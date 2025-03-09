import * as core from '@actions/core'
import {context, getCurrentDeployment, getCurrentJob, getInput, PermissionError, run} from './lib/actions.js'
// see https://github.com/actions/toolkit for more GitHub actions libraries
import {fileURLToPath} from 'url'
import * as process from 'node:process'
import {sleep} from "./lib/common.js";
import * as github from "@actions/github";

export const action = () => run(async () => {

  const inputs = {
    token: getInput('token', {required: true}),
  }

  const octokit = github.getOctokit(inputs.token);

  // --- due to some eventual consistency issues with the GitHub API, we need to take a sort break
  await sleep(2000)

  await getCurrentJob(octokit).then((job) => {
    setOutputAndLog('run_id', job.run_id)
    setOutputAndLog('run_attempt', job.run_attempt)
    setOutputAndLog('run_number', context.runNumber)
    setOutputAndLog('job', job.name)
    setOutputAndLog('job_id', job.id)
    setOutputAndLog('job_log_url', job.html_url || '')
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
      setOutputAndLog('environment', deployment.environment)
      setOutputAndLog('environment_url', deployment.environmentUrl)
      setOutputAndLog('deployment_id', deployment.id)
      setOutputAndLog('deployment_url', deployment.url)
      setOutputAndLog('deployment_workflow_url', deployment.workflowUrl)
      setOutputAndLog('deployment_log_url', deployment.logUrl)
    }
  })
})

function setOutputAndLog(name: string, value: string | number | undefined) {
  core.setOutput(name, value)
  if (value !== undefined) {
    core.info(`output => ${name}: ${value}`)
  }
}

// --- main ---

// Execute the action, if running as the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  action()
}
