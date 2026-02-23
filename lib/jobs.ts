import { GitHub } from "@actions/github/lib/utils";
import { context, throwPermissionError } from "./actions";
import { EnhancedContext } from "./common";
import * as core from '@actions/core'
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

// type alias for job object returned by octokit.rest.actions.getJobForWorkflowRun
type Job = RestEndpointMethodTypes["actions"]["getJobForWorkflowRun"]["response"]["data"];

// cache of getCurrentJob result
let _currentJob: Job | undefined = undefined

/**
 * Get the job for the current runner from the workflow run using Octokit REST API.
 * Equivalent to:
 *   jobs=`curl .../actions/runs/${run_id}/jobs`
 *   job=$(echo $jobs | jq -r '.jobs[] | select(.runner_name=="${{ runner.name }}")')
 * @param octokit - An authenticated Octokit instance
 * @param context - The enhanced GitHub Actions context
 * @returns The job for the current runner, or undefined if not found
 */
export async function getCurrentJobByRunner(
  octokit: InstanceType<typeof GitHub>,
  context: EnhancedContext
): Promise<Job | undefined> {
  const runId = context.runId;
  const runnerName = context.runnerName;
  const { owner, repo } = context.repo;
  const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
    owner: owner,
    repo: repo,
    run_id: runId,
    per_page: 100,
  });
  const job: Job | undefined = jobsResponse.data.jobs.find(j => j.runner_name === runnerName);
  return job;
}

/**
 * Get the job object for the current runner from the workflow run using Octokit REST API.
 * @param octokit - An authenticated Octokit instance
 * @param context - The enhanced GitHub Actions context
 * @returns The job object for the current runner
 */
export async function getCurrentJob(octokit: InstanceType<typeof GitHub>, context: EnhancedContext
) : Promise<Job | undefined>{
  if (_currentJob != undefined) return _currentJob

  if (context.isGithubEnterprise) {
    // For GitHub Enterprise we need a workaround
    core.warning(
      'Running in GitHub Enterprise environment, we currently need to use a workaround until ' +
      'this functionality is natively supported: https://github.blog/changelog/2025-11-13-github-actions-oidc-token-claims-now-include-check_run_id/'
    )
    const currentJob = await getCurrentJobByRunner(octokit, context)
    return _currentJob = currentJob
  }

  const currentJob = await octokit.rest.actions.getJobForWorkflowRun({
    ...context.repo,
    job_id: context.jobCheckRunId,
  }).catch((error) => {
    if (error.status === 403) {
      throwPermissionError({scope: 'actions', permission: 'read'}, error)
    }
    throw error
  }).then((res) => res.data)
  return _currentJob = currentJob
}
