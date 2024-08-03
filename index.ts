/* eslint-disable camelcase */
import * as core from '@actions/core'
import {getInput} from '@actions/core'
import * as github from '@actions/github'
// eslint-disable-next-line node/no-unpublished-import
import {Deployment} from '@octokit/graphql-schema'
import {run, sleep} from './lib/actions.js'
// see https://github.com/actions/toolkit for more GitHub actions libraries
import {fileURLToPath} from 'url'
import * as process from 'node:process'
import {z} from 'zod'

export const action = () => run(async () => {
  const context = github.context
  const enhancedContext = {
    repository: `${context.repo.owner}/${context.repo.repo}`,
    runAttempt: parseInt(process.env.GITHUB_RUN_ATTEMPT!, 10),
    runnerName: process.env.RUNNER_NAME!,
  }

  const inputs = {
    token: getInput('token', {required: true})!,
    // TODO parse with zod
    // As of now (Aug 2024) it is not possible to reconstruct the job name from within a reusable workflows,
    // so we need to pass workflow context as an input variable see type WorkflowContext
    workflowContext: !getInput('workflow-context') ? undefined :
        z.array(WorkflowContextSchema).parse(parseJsonObjects(getInput('workflow-context'))),
    matrix: !getInput('__matrix') ? undefined :
        JsonSchema.parse(JSON.parse(getInput('__matrix'))),
  }

  const octokit = github.getOctokit(inputs.token)

  // --- due to some eventual consistency issues with the GitHub API, we need to take a sort break
  await sleep(2000)
  const currentJob = await getCurrentJob(octokit, {
    repo: context.repo,
    runId: context.runId,
    runAttempt: enhancedContext.runAttempt,
    runnerName: enhancedContext.runnerName,
    workflowContext: inputs.workflowContext,
    job: context.job,
    matrix: inputs.matrix,
  })
  setContextOutput('run_id', currentJob.run_id)
  setContextOutput('run_attempt', currentJob.run_attempt)
  setContextOutput('run_number', context.runNumber)
  setContextOutput('job', currentJob.name)
  setContextOutput('job_id', currentJob.id)
  setContextOutput('job_log_url', currentJob.html_url!)

  const currentDeployment = await getCurrentDeployment(octokit, {
    serverUrl: context.serverUrl,
    repo: context.repo,
    sha: context.sha,
    runId: context.runId,
    runJobId: currentJob.id,
  })
  if (currentDeployment) {
    setContextOutput('environment', currentDeployment.environment)
    setContextOutput('environment_url', currentDeployment.environmentUrl)
    setContextOutput('deployment_id', currentDeployment.id!)
    setContextOutput('deployment_url', currentDeployment.url)
    setContextOutput('deployment_workflow_url', currentDeployment.workflowUrl)
    setContextOutput('deployment_log_url', currentDeployment.logUrl)
  }
})

// Execute the action, if running as the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  action()
}

/**
 * Set context output
 * @param name - output name
 * @param value - output value
 * @returns void
 */
function setContextOutput(name: string, value: string | number | undefined) {
  if (value !== undefined) {
    core.info(`${name}: ${value}`)
  }
  core.setOutput(name, value)
}

/**
 * Get the current job from the workflow run
 * @param octokit - octokit instance
 * @param context - GitHub context
 * @returns the current job
 */
async function getCurrentJob(octokit: ReturnType<typeof github.getOctokit>, context: {
  repo: { owner: string; repo: string };
  runId: number;
  runAttempt: number;
  runnerName: string;
  workflowContext?: WorkflowContext[];
  job: string;
  matrix?: Json;
}) {
  const workflowRunJobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRunAttempt, {
    ...context.repo,
    run_id: context.runId,
    attempt_number: context.runAttempt,
  }).catch((error) => {
    if (error.status === 403) {
      throwPermissionError({scope: 'actions', permission: 'read'}, error)
    }
    throw error
  })

  const actualJobName = getActualJobName(context)
  const currentJob = workflowRunJobs.find((job) => job.name === actualJobName)
  if (!currentJob) {
    throw new Error(`Current job '${actualJobName}' could not found in workflow run.`)
  }
  return currentJob
}

/**
 * Get the current deployment from the workflow run
 * @param octokit - octokit instance
 * @param context - GitHub context
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
  }).catch((error) => {
    if (error.status === 403) {
      throwPermissionError({scope: 'deployments', permission: 'read'}, error)
    }
    throw error
  }).then(({data: deployments}) => deployments
      .filter((deployment) => deployment.performed_via_github_app?.slug === 'github-actions'))


  // --- get deployment workflow job run id
  // noinspection GraphQLUnresolvedReference
  const potentialDeploymentsFromGrapqlApi = await octokit.graphql<{ nodes: Deployment[] }>(`
    query ($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Deployment {
          databaseId,
          commitOid
          createdAt
          task
          state
          latestEnvironment
          latestStatus {
            logUrl
            environmentUrl
          }
        }
      }
    }`, {
    ids: potentialDeploymentsFromRestApi.map(({node_id}) => node_id),
  }).then(({nodes: deployments}) => deployments
      // filter is probably not needed due to check log url to match run id and job id
      .filter((deployment) => deployment.commitOid === context.sha)
      .filter((deployment) => deployment.task === 'deploy')
      .filter((deployment) => deployment.state === 'IN_PROGRESS'))

  const currentDeployment = potentialDeploymentsFromGrapqlApi.find((deployment) => {
    if (!deployment.latestStatus?.logUrl) return false
    const logUrl = new URL(deployment.latestStatus.logUrl)

    if (logUrl.origin !== context.serverUrl) return false

    const pathnameMatch = logUrl.pathname
        .match(/\/(?<repository>[^/]+\/[^/]+)\/actions\/runs\/(?<run_id>[^/]+)\/job\/(?<run_job_id>[^/]+)/)

    return pathnameMatch &&
        pathnameMatch.groups?.repository === `${context.repo.owner}/${context.repo.repo}` &&
        pathnameMatch.groups?.run_id === context.runId.toString() &&
        pathnameMatch.groups?.run_job_id === context.runJobId.toString()
  })

  if (!currentDeployment) return undefined

  const currentDeploymentUrl =
      // eslint-disable-next-line max-len
      `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/deployments/${currentDeployment.latestEnvironment}`
  const currentDeploymentWorkflowUrl =
      `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`

  return {
    ...currentDeployment,
    databaseId: undefined,
    latestEnvironment: undefined,
    latestStatus: undefined,
    id: currentDeployment.databaseId,
    url: currentDeploymentUrl,
    workflowUrl: currentDeploymentWorkflowUrl,
    logUrl: currentDeployment.latestStatus!.logUrl! as string,
    environment: currentDeployment.latestEnvironment!,
    environmentUrl: currentDeployment.latestStatus!.environmentUrl as string || undefined,
  }
}

/**
 * Get the actual job name
 * @param job - job name
 * @param matrix - matrix properties
 * @param contexts - workflow contexts
 * @returns the actual job name
 */
function getActualJobName({job, matrix, contexts}: {
  job: string, matrix?: Json, contexts?: WorkflowContext[]
}) {
  let actualJobName = job
  if (matrix) {
    actualJobName = `${actualJobName} (${flatValues(matrix).join(', ')})`
  }

  contexts?.forEach((context) => {
    const contextJob = getActualJobName(context)
    actualJobName = `${contextJob} / ${actualJobName}`
  })

  return actualJobName
}

/**
 * Parse JSON objects
 * @param jsonObjects - JSON objects
 * @returns parsed JSON objects
 */
function parseJsonObjects(jsonObjects: string) {
  const jsonObjectArray = '[' + jsonObjects.replaceAll(/}\s*{/g, '},\n{') + ']'
  return JSON.parse(jsonObjectArray) as object[]
}

/**
 * Flatten objects and arrays to all its values including nested objects and arrays
 * @param values - value(s)
 * @returns flattened values
 */
function flatValues(values: unknown): unknown[] {
  if (typeof values !== 'object' || values == null) {
    return [values]
  }

  if (Array.isArray(values)) {
    return values.flatMap(flatValues)
  }

  return flatValues(Object.values(values))
}

/**
 * Throw a permission error
 * @param permission - GitHub Job permission
 * @param options - error options
 * @returns void
 */
function throwPermissionError(permission: { scope: string; permission: string }, options?: ErrorOptions): never {
  throw new Error(
      `Ensure that GitHub job has \`permissions: ${permission.scope}: ${permission.permission}\`. ` +
      // eslint-disable-next-line max-len
      'https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token',
      options)
}

// --- types ---

const LiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
type Literal = z.infer<typeof LiteralSchema>
type Json = Literal | { [key: string]: Json } | Json[]
const JsonSchema: z.ZodType<Json> = z.lazy(() => z.union([LiteralSchema, z.array(JsonSchema), z.record(JsonSchema)]))

const WorkflowContextSchema = z.object({
  job: z.string(),
  matrix: z.union([z.null(), JsonSchema]),
}).strict()
type WorkflowContext = z.infer<typeof WorkflowContextSchema>


