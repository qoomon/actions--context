/* eslint-disable camelcase */
import * as core from '@actions/core'
import {getInput} from '@actions/core'
import * as github from '@actions/github'
// eslint-disable-next-line node/no-unpublished-import
import {Deployment} from '@octokit/graphql-schema'
import {run} from './lib/actions.js'
// see https://github.com/actions/toolkit for more github actions libraries
import {fileURLToPath} from 'url'
import * as process from 'node:process'

export const action = () => run(async () => {
  const context = github.context
  const enhancedContext = {
    serverUrl: process.env.GITHUB_SERVER_URL!,
    runAttempt: parseInt(process.env.GITHUB_RUN_ATTEMPT!, 10),
    runnerName: process.env.RUNNER_NAME!,
  }

  const inputs = {
    token: getInput('token', {required: true})!,
  }
  const octokit = github.getOctokit(inputs.token)

  const currentJob = await getCurrentJob(octokit, {
    repo: context.repo,
    runId: context.runId,
    runAttempt: enhancedContext.runAttempt,
    job: context.job,
  })

  const currentDeployment = await getCurrentDeployment(octokit, {
    serverUrl: enhancedContext.serverUrl,
    repo: context.repo,
    sha: context.sha,
    runId: context.runId,
    runJobId: currentJob.id,
  })

  // TODO core.setOutput('matrix_job_id', environment)
  core.info(`Run job id: ${currentJob.html_url}`)
  core.setOutput('run_job_id', currentJob.id)

  core.info(`Run job log url: ${currentJob.html_url}`)
  core.setOutput('run_job_log_url', currentJob.html_url)

  core.info(`Environment: ${currentDeployment?.latestEnvironment}`)
  core.setOutput('environment', currentDeployment?.latestEnvironment)

  core.info(`Deployment log url: ${currentDeployment?.latestStatus?.logUrl}`)
  core.setOutput('deployment_log_url', currentDeployment?.latestStatus?.logUrl)
})

/**
 * Get the current job from the workflow run
 * @param octokit - octokit instance
 * @param context - github context
 * @returns the current job
 */
async function getCurrentJob(octokit: ReturnType<typeof github.getOctokit>, context: {
  repo: { owner: string; repo: string };
  runId: number;
  runAttempt: number;
  job: string;
}) {
  const workflowRunJobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRunAttempt, {
    ...context.repo,
    run_id: context.runId,
    attempt_number: context.runAttempt,
  }).then((res) => res.jobs)

  const effectiveJobName = context.job
  // TODO support matrix
  // const matrix = process.env.matrix ? JSON.parse(process.env.matrix) : undefined
  // const effectiveJobName = `${context.job}${matrix ? ` (${Object.values(matrix).join(', ')})` : ''}`
  return workflowRunJobs.find((job) => job.name === effectiveJobName)!
}

/**
 * Get the current deployment from the workflow run
 * @param octokit - octokit instance
 * @param context - github context
 * @returns the current deployment or undefined
 */
async function getCurrentDeployment(octokit: ReturnType<typeof github.getOctokit>, context: {
  serverUrl: string;
  repo: { owner: string; repo: string };
  sha: string;
  runId: number;
  runJobId: number;
}) {
  // --- get deployments for current sha
  const potentialDeploymentsFromRestApi = await octokit.rest.repos.listDeployments({
    ...context.repo,
    sha: context.sha,
    task: 'deploy',
    per_page: 100,
  }).then(({data: deployments}) => deployments
      .filter((deployment) => deployment.performed_via_github_app?.slug === 'github-actions'))

  // --- get deployment workflow job run id
  // noinspection GraphQLUnresolvedReference
  const potentialDeploymentsFromGrapqlApi = await octokit.graphql<{ nodes: Deployment[] }>(`
    query ($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Deployment {
          commitOid
          createdAt
          task
          state
          latestEnvironment
          latestStatus { logUrl }
        }
      }
    }`, {
    ids: potentialDeploymentsFromRestApi.map(({node_id}) => node_id),
  }).then(({nodes: deployments}) => deployments
      .filter((deployment) => deployment.commitOid === context.sha)
      .filter((deployment) => deployment.task === 'deploy')
      .filter((deployment) => deployment.state === 'IN_PROGRESS'))

  return potentialDeploymentsFromGrapqlApi.find((deployment) => {
    if (!deployment.latestStatus?.logUrl) return false
    const logUrl = new URL(deployment.latestStatus.logUrl)

    if (logUrl.origin !== context.serverUrl) return false

    const pathnameMatch = logUrl.pathname
        .match(/\/(?<repository>[^/]+\/[^/]+)\/actions\/runs\/(?<run_id>[^/]+)\/job\/(?<run_job_id>[^/]+)/)
    return pathnameMatch &&
        pathnameMatch.groups?.repository === `${context.repo.owner}/${context.repo.repo}` &&
        pathnameMatch.groups?.run_id === context.runId.toString() &&
        pathnameMatch.groups?.run_job_id !== context.runJobId.toString()
  })
}

// Execute the action, if running as main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  action()
}
