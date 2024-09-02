import {GitHub} from "@actions/github/lib/utils";

/**
 * Parse repository string to owner and repo
 * @param repository - repository string e.g. 'spongebob/sandbox'
 * @return object with owner and repo
 */
export function parseRepository(repository: string) {
  const separatorIndex = repository.indexOf('/');
  if (separatorIndex === -1) throw Error(`Invalid repository format '${repository}'`);
  return {
    owner: repository.substring(0, separatorIndex),
    repo: repository.substring(separatorIndex + 1),
  };
}

export async function getLatestDeploymentStatus(
    octokit: InstanceType<typeof GitHub>,
    repository: string, deploymentId: number
) {
  return octokit.rest.repos.listDeploymentStatuses({
    ...parseRepository(repository),
    deployment_id: deploymentId,
    per_page: 1,
  }).then(({data}) => {
    if (data.length === 0) return undefined;
    return data[0];
  });
}

export type DeploymentStatus = "error" | "failure" | "inactive" | "in_progress" | "queued" | "pending" | "success";

export function getWorkflowRunHtmlUrl(context: {
  serverUrl: string,
  repo: { owner: string; repo: string };
  runId: number,
  runAttempt?: number
}) {
  return `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}` + (context.runAttempt ? `/attempts/${context.runAttempt}` : '');
}
