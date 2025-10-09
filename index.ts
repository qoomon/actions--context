import * as core from '@actions/core'
import {context, getCurrentDeployment, getCurrentJob, getInput, PermissionError, run} from './lib/actions.js'
// see https://github.com/actions/toolkit for more GitHub actions libraries
import {fileURLToPath} from 'url'
import * as process from 'node:process'
import {sleep} from "./lib/common.js";
import * as github from "@actions/github";

export const action = run(async () => {

  const inputs = {
    token: getInput('token', {required: true}),
  }

  const octokit = github.getOctokit(inputs.token);

  // --- due to some eventual consistency issues with the GitHub API, we need to take a sort break
  await sleep(2000)

  // --- run information

  core.setOutput('run_id', context.runId)
  core.setOutput('run_attempt', context.runAttempt)
  core.setOutput('run_number', context.runNumber)
  const runHtmlUrl = context.runHtmlUrl
  core.setOutput('run_html_url', runHtmlUrl)
  core.exportVariable('GITHUB_RUN_HTML_URL', runHtmlUrl)

  await getCurrentJob(octokit).then((job) => {
    if (core.isDebug()) {
      core.debug(JSON.stringify(job));
    }

    // --- runner information

    core.setOutput('runner_name', context.runnerName)

    const runnerId = process.env.RUNNER_ID ?? job.runner_id
    core.setOutput('runner_id', runnerId)
    core.exportVariable('RUNNER_ID', runnerId)

    // --- job information

    const jobName = process.env.GITHUB_JOB_NAME ?? job.name
    core.setOutput('job_name', jobName)
    core.exportVariable('GITHUB_JOB_NAME', jobName)

    const jobCheckRunId = process.env.GITHUB_JOB_CHECK_RUN_ID ?? job.id
    core.setOutput('job_check_run_id', jobCheckRunId)
    core.exportVariable('GITHUB_JOB_CHECK_RUN_ID', jobCheckRunId)

    const jobHtmlUrl = process.env.GITHUB_JOB_HTML_URL ?? job.html_url ?? ''
    core.setOutput('job_html_url', jobHtmlUrl)
    core.exportVariable('GITHUB_JOB_HTML_URL', jobHtmlUrl)
  });

  await getCurrentDeployment(octokit).catch((error) => {
    if (error instanceof PermissionError && error.scope === 'deployments' && error.permission === 'read') {
      core.debug('No permission to read deployment information.' +
          ' Grant the "deployments: read" permission to workflow job, if needed.')
      return null
    }
    throw error
  }).then((deployment) => {
    if (deployment) {
      if (core.isDebug()) {
        core.debug(JSON.stringify(deployment));
      }

      // --- environment information

      const environment = process.env.GITHUB_ENVIRONMENT ?? deployment.environment
      core.setOutput('environment', environment)
      core.exportVariable('GITHUB_ENVIRONMENT', environment)

      const environmentHtmlUrl = process.env.GITHUB_ENVIRONMENT_HTML_URL ?? deployment.environmentUrl ?? ''
      core.setOutput('environment_html_url', environmentHtmlUrl)
      core.exportVariable('GITHUB_ENVIRONMENT_HTML_URL', environmentHtmlUrl)

      // --- deployment information

      const deploymentId = process.env.GITHUB_DEPLOYMENT_ID ?? deployment.id
      core.setOutput('deployment_id', deploymentId)
      core.exportVariable('GITHUB_DEPLOYMENT_ID', deploymentId)

      const deploymentHtmlUrl = process.env.GITHUB_DEPLOYMENT_HTML_URL ?? deployment.url
      core.setOutput('deployment_html_url', deploymentHtmlUrl)
      core.exportVariable('GITHUB_DEPLOYMENT_HTML_URL', deploymentHtmlUrl)
    }
  })
})

// --- main ---

// Execute the action, if running as the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  action()
}
