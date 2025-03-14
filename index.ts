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

  await getCurrentJob(octokit).then((job) => {
    if(core.isDebug()){
      core.debug(JSON.stringify(job));
    }

    core.setOutput('run_id', job.run_id)
    core.setOutput('run_attempt', job.run_attempt)
    core.setOutput('run_number', context.runNumber)
    core.setOutput('run_url', context.runUrl)
    core.exportVariable('GITHUB_RUN_URL', job.runner_id ?? '')

    core.setOutput('runner_name', context.runnerName)
    core.setOutput('runner_id', job.runner_id ?? '')
    core.exportVariable('RUNNER_ID', job.runner_id ?? '')

    core.setOutput('job_name', job.name)
    core.exportVariable('GITHUB_JOB_NAME', job.name ?? '')
    core.setOutput('job_id', job.id)
    core.exportVariable('GITHUB_JOB_ID', job.id)
    core.setOutput('job_url', job.html_url ?? '')
    core.exportVariable('GITHUB_JOB_URL', job.html_url ?? '')
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
      if(core.isDebug()){
        core.debug(JSON.stringify(deployment));
      }

      core.setOutput('environment', deployment.environment)
      core.exportVariable('GITHUB_ENVIRONMENT', deployment.environment)
      core.setOutput('environment_url', deployment.environmentUrl)
      core.exportVariable('GITHUB_ENVIRONMENT_URL', deployment.environmentUrl)

      core.setOutput('deployment_id', deployment.id)
      core.exportVariable('GITHUB_DEPLOYMENT_ID', deployment.id)
      core.setOutput('deployment_url', deployment.url)
      core.exportVariable('GITHUB_DEPLOYMENT_URL', deployment.url)
    }
  })
})

// --- main ---

// Execute the action, if running as the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  action()
}
