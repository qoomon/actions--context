import * as core from '@actions/core'
import {InputOptions} from '@actions/core'
import {z, ZodSchema} from 'zod'
import {Context} from '@actions/github/lib/context';
import process from 'node:process';
import {_throw, sleep} from './common.js';
import * as github from '@actions/github';
import {Deployment} from '@octokit/graphql-schema';
import {GitHub} from "@actions/github/lib/utils";
import {getWorkflowRunHtmlUrl} from "./github.js";
import YAML from "yaml";
import fs from "node:fs";

// cache of getCurrentJob result
let _currentJob: Awaited<ReturnType<typeof getCurrentJob>>
// cache of getCurrentJob result
let _currentDeployment: Awaited<ReturnType<typeof getCurrentDeployment>>

// --- GitHub Constants -------------------------------------------------------

/**
 * GitHub Actions bot user
 */
export const bot = {
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com',
} as const

// --- GitHub Actions Utils ---------------------------------------------------

/**
 * Run action and catch errors
 * @param action - action to run
 * @returns void
 */
export function run(action: () => Promise<void>) {
  return () => action().catch(async (error: unknown) => {
    let failedMessage = 'Unhandled error, see job log for details';
    if (error != null && typeof error === 'object' && 'message' in error && error.message != null) {
      failedMessage = error.message.toString();
    }
    core.setFailed(failedMessage)
    if (error != null && typeof error === 'object' && 'stack' in error) {
      console.error(error.stack);
    }
  });
}

/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param options - input options
 * @returns input value
 */
export function getInput(
    name: string, options: core.InputOptions & { required: true },
): string
/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param options - input options
 * @returns input value
 */
export function getInput(
    name: string, options?: core.InputOptions,
): string | undefined
/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param options - input options
 * @param schema - input schema
 * @returns input value
 */
export function getInput<T extends ZodSchema>(
    name: string, options: core.InputOptions & { required: true }, schema: T
): z.infer<T>
/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param options - input options
 * @param schema - input schema
 * @returns input value
 */
export function getInput<T extends ZodSchema>(
    name: string, options: core.InputOptions, schema: T
): z.infer<T> | undefined
/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param schema - input schema
 * @returns input value
 */
export function getInput<T extends ZodSchema>(
    name: string, schema: T
): z.infer<T> | undefined
export function getInput<T extends ZodSchema>(
    name: string, options_schema?: InputOptions | T, schema?: T
): string | z.infer<T> | undefined {
  let options: InputOptions | undefined
  // noinspection SuspiciousTypeOfGuard
  if (options_schema instanceof ZodSchema) {
    schema = options_schema
  } else {
    options = options_schema
  }

  const input = core.getInput(name, options)
  if (!input) return undefined
  if (!schema) return input

  let parseResult = schema.safeParse(input)
  if (parseResult.error) {
    const initialIssue = parseResult.error.issues.at(0);
    if (initialIssue?.code === "invalid_type" &&
        initialIssue.received === "string" &&
        initialIssue.expected !== "string"
    ) {
      // try parse as yaml/json
      parseResult = z.string().transform((val, ctx) => {
        try {
          return YAML.parse(val);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.invalid_type,
            expected: initialIssue.expected,
            received: 'unknown',
          })
          return z.NEVER;
        }
      }).pipe(schema).safeParse(input);
    }
  }

  if (parseResult.error) {
    const issues = parseResult.error.issues.map(formatZodIssue)
    throw new Error(`Invalid input value for \`${name}\`, received \`${input}\`\n` +
        issues.map((it) => `  - ${it}`).join('\n'))
  }

  return parseResult.data

  // --- zod utils ---

  /**
   * This function will format a zod issue
   * @param issue - zod issue
   * @return formatted issue
   */
  function formatZodIssue(issue: z.ZodIssue): string {
    if (issue.path.length === 0) return issue.message
    return `${issue.path.join('.')}: ${issue.message}`
  }
}

/**
 * Throw a permission error
 * @param permission - GitHub Job permission
 * @param options - error options
 * @returns void
 */
export function throwPermissionError(permission: { scope: string; permission: string }, options?: ErrorOptions): never {
  throw new PermissionError(
      `Ensure that GitHub job has permission: \`${permission.scope}: ${permission.permission}\`. ` +
      // eslint-disable-next-line max-len
      'https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token',
      permission,
      options,
  )
}

export class PermissionError extends Error {

  scope: string;
  permission: string;

  constructor(msg: string, permission: { scope: string; permission: string }, options?: ErrorOptions) {
    super(msg, options);

    this.scope = permission.scope;
    this.permission = permission.permission;

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

// --- Enhanced GitHub Action Context --------------------------------------------------

/**
 * Enhanced GitHub context
 */
export const context = (() => {
  const additionalContext = {
    repository: `${github.context.repo.owner}/${github.context.repo.repo}`,

    get workflowRef() {
      return process.env.GITHUB_WORKFLOW_REF
          ?? _throw(new Error('Missing environment variable: GITHUB_WORKFLOW_REF'));
    },
    get workflowSha() {
      return process.env.GITHUB_WORKFLOW_SHA
          ?? _throw(new Error('Missing environment variable: GITHUB_WORKFLOW_SHA'));
    },

    get runAttempt() {
      return parseInt(process.env.GITHUB_RUN_ATTEMPT
          ?? _throw(new Error('Missing environment variable: RUNNER_NAME')), 10);
    },
    get runUrl() {
      return `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}` +
          `/actions/runs/${github.context.runId}` + (this.runAttempt ? `/attempts/${this.runAttempt}` : '');
    },

    get runnerName() {
      return process.env.RUNNER_NAME
          ?? _throw(new Error('Missing environment variable: RUNNER_NAME'));
    },
    get runnerTempDir() {
      return process.env.RUNNER_TEMP
          ?? _throw(new Error('Missing environment variable: RUNNER_TEMP'));
    },
  }

  return new Proxy(github.context, {
    get(context: Context, prop) {
      return prop in context
          ? context[prop as keyof Context]
          : additionalContext[prop as keyof typeof additionalContext];
    },
  }) as Context & typeof additionalContext
})();

if (core.isDebug()) {
  core.debug(`github.context: ${JSON.stringify(context, null, 2)}`);
}

/**
 * Get the current job from the workflow run
 * @returns the current job
 */
export async function getCurrentJob(octokit: InstanceType<typeof GitHub>): Promise<typeof currentJobObject> {
  if (_currentJob) return _currentJob

  const githubRunnerNameMatch = context.runnerName.match(/^GitHub-Actions-(?<id>\d+)$/)
  const runnerId = githubRunnerNameMatch?.groups?.id ? parseInt(githubRunnerNameMatch.groups.id, 10) : null;

  let currentJob: Awaited<ReturnType<typeof listJobsForCurrentWorkflowRun>>[number] | null = null;
  // retry to determine current job, because it takes some time until the job is available through the GitHub API
  const retryMaxAttempts = 30, retryDelay = 1000;
  let retryAttempt = 0;
  do {
    retryAttempt++
    if (retryAttempt > 1) await sleep(retryDelay);
    core.debug(`Try to determine current job, attempt ${retryAttempt}/${retryMaxAttempts}`)
    const currentWorkflowRunJobs = await listJobsForCurrentWorkflowRun();
    core.debug(`runner_name: ${context.runnerName}\n` + 'workflow_run_jobs:' + JSON.stringify(currentWorkflowRunJobs, null, 2));
    const currentJobs = currentWorkflowRunJobs
        .filter((job) => job.status === "in_progress")
        .filter((job) =>
            (job.runner_name === context.runnerName) ||
            (job.runner_name === "GitHub Actions" && job.runner_id === runnerId)
        );
    if(currentJobs.length === 1) {
      currentJob = currentJobs[0];
      core.debug('job:' + JSON.stringify(currentJob, null, 2));
    } else {
      if (currentJobs.length === 0) {
        core.debug('No matching job found in workflow run.')
      } else {
        core.debug('Multiple matching jobs found in workflow run.')
      }
    }
  } while (!currentJob && retryAttempt < retryMaxAttempts);

  if(!currentJob){
    throw new Error(`Current job could not be determined.`);
  }

  const currentJobObject = {
    ...currentJob,
  }
  return _currentJob = currentJobObject;

  async function listJobsForCurrentWorkflowRun() {
    return octokit.paginate(octokit.rest.actions.listJobsForWorkflowRunAttempt, {
      ...context.repo,
      run_id: context.runId,
      attempt_number: context.runAttempt,
    }).catch((error) => {
      if (error.status === 403) {
        throwPermissionError({scope: 'actions', permission: 'read'}, error)
      }
      throw error;
    });
  }
}

/**
 * Get the current deployment from the workflow run
 * @returns the current deployment or undefined
 */
export async function getCurrentDeployment(
    octokit: InstanceType<typeof GitHub>
): Promise<typeof currentDeploymentObject | undefined> {
  if (_currentDeployment) return _currentDeployment

  const currentJob = await getCurrentJob(octokit)

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
  }).then(({data: deployments}) =>
      deployments.filter((deployment) => deployment.performed_via_github_app?.slug === 'github-actions'))

  // --- get deployment workflow job run id
  // noinspection GraphQLUnresolvedReference
  const potentialDeploymentsFromGraphqlApi = await octokit.graphql<{ nodes: Deployment[] }>(`
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

  const currentDeployment = potentialDeploymentsFromGraphqlApi.find((deployment) => {
    if (!deployment.latestStatus?.logUrl) return false
    const logUrl = new URL(deployment.latestStatus.logUrl)

    if (logUrl.origin !== context.serverUrl) return false

    const pathnameMatch = logUrl.pathname
        .match(/\/(?<repository>[^/]+\/[^/]+)\/actions\/runs\/(?<run_id>[^/]+)\/job\/(?<job_id>[^/]+)/)

    return pathnameMatch &&
        pathnameMatch.groups?.repository === `${context.repo.owner}/${context.repo.repo}` &&
        pathnameMatch.groups?.run_id === context.runId.toString() &&
        pathnameMatch.groups?.job_id === currentJob.id.toString()
  })

  if (!currentDeployment) return undefined

  const currentDeploymentUrl =
      // eslint-disable-next-line max-len
      `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/deployments/${currentDeployment.latestEnvironment}`
  const currentDeploymentWorkflowUrl = getWorkflowRunHtmlUrl(context);

  if (!currentDeployment.latestStatus) {
    throw new Error('Missing deployment latestStatus');
  }
  if (!currentDeployment.latestEnvironment) {
    throw new Error('Missing deployment latestEnvironment');
  }

  const currentDeploymentObject = {
    ...currentDeployment,
    databaseId: undefined,
    latestEnvironment: undefined,
    latestStatus: undefined,
    id: currentDeployment.databaseId ?? _throw(new Error('Missing deployment databaseId')),
    url: currentDeploymentUrl,
    workflowUrl: currentDeploymentWorkflowUrl,
    logUrl: currentDeployment.latestStatus.logUrl as string || undefined,
    environment: currentDeployment.latestEnvironment,
    environmentUrl: currentDeployment.latestStatus.environmentUrl as string || undefined,
  }
  return _currentDeployment = currentDeploymentObject
}

// --- Job State Management ---------------------------------------------------

const JOB_STATE_FILE = `${context.runnerTempDir ?? '/tmp'}/${context.action.replace(/_\d*$/, '')}`;

export function addJobState<T>(obj: T) {
  fs.appendFileSync(JOB_STATE_FILE, JSON.stringify(obj) + '\n');
}

export function getJobState<T>() {
  if (!fs.existsSync(JOB_STATE_FILE)) return [];

  return fs.readFileSync(JOB_STATE_FILE).toString()
      .split('\n').filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line)) as T[];
}
