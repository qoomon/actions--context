import * as core from '@actions/core'
import {InputOptions} from '@actions/core'
import {z, ZodSchema} from 'zod'
import {Context} from '@actions/github/lib/context';
import process from 'node:process';
import {getFlatValues, JsonObject, JsonObjectSchema, JsonTransformer} from './common.js';
import * as github from '@actions/github';
import {Deployment} from '@octokit/graphql-schema';
import {GitHub} from "@actions/github/lib/utils";

export const context = enhancedContext()

/**
 * GitHub Actions bot user
 */
export const bot = {
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com',
} as const

/**
 * Run action and catch errors
 * @param action - action to run
 * @returns void
 */
export function run(action: () => Promise<void>): void {
  action().catch(async (error: unknown) => {
    let failedMessage = 'Unhandled error, see job logs'
    if (error != null && typeof error === 'object' &&
        'message' in error && error.message != null) {
      failedMessage = error.message.toString()
    }
    core.setFailed(failedMessage)

    if (error != null && typeof error === 'object' &&
        'stack' in error) {
      console.error(error.stack)
    }
  })
}

/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param options - input options
 * @returns input value
 */
export function getInput(
    name: string,
    options: core.InputOptions & { required: true },
): string
/**
 * {@link  core.getInput}
 *
 * @param name - input name
 * @param options - input options
 * @returns input value
 */
export function getInput(
    name: string,
    options?: core.InputOptions,
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
    name: string,
    options: core.InputOptions & { required: true },
    schema: T
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

export function getInput<T extends ZodSchema>(name: string, options_schema?: InputOptions | T, schema?: T): string | z.infer<T> | undefined {
  let options: InputOptions | undefined
  if (options_schema instanceof ZodSchema) {
    schema = options_schema
  } else {
    options = options_schema
  }

  const input = core.getInput(name, options)
  if (!input) return undefined
  if (!schema) return input

  const parseResult = schema.safeParse(input)
  if (parseResult.error) {
    const issues = parseResult.error.issues.map(formatZodIssue)
    throw new Error(`Invalid value for input '${name}': ${input}\n` +
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

function enhancedContext() {
  const context = github.context

  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const runAttempt = parseInt(process.env.GITHUB_RUN_ATTEMPT!, 10);
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}` +
      (runAttempt ? `/attempts/${runAttempt}` : '');
  const runnerName = process.env.RUNNER_NAME!;
  const runnerTempDir = process.env.RUNNER_TEMP!;

  const additionalContext = {
    repository,
    runAttempt,
    runUrl,
    runnerName,
    runnerTempDir,
  };

  return new Proxy(context, {
    get(context, prop, receiver) {
      return prop in context
          // @ts-ignore
          ? context[prop]
          // @ts-ignore
          : additionalContext[prop];
    },
  }) as Context & typeof additionalContext
}

function getAbsoluteJobName({job, matrix, workflowContextChain}: {
  job: string
  matrix?: JsonObject | null
  workflowContextChain?: WorkflowContext[]
}) {
  let actualJobName = job
  if (matrix) {
    const flatValues = getFlatValues(matrix)
    if (flatValues.length > 0) {
      actualJobName = `${actualJobName} (${flatValues.join(', ')})`
    }
  }

  workflowContextChain?.forEach((workflowContext) => {
    const contextJob = getAbsoluteJobName(workflowContext)
    actualJobName = `${contextJob} / ${actualJobName}`
  })

  return actualJobName
}

const JobMatrixParser = JsonTransformer.pipe(JsonObjectSchema.nullable())

const WorkflowContextSchema = z.object({
  job: z.string(),
  matrix: JsonObjectSchema.nullable(),
}).strict()

type WorkflowContext = z.infer<typeof WorkflowContextSchema>

const WorkflowContextParser = z.string()
    .transform((str, ctx) => JsonTransformer.parse(`[${str}]`, ctx))
    .pipe(z.array(z.union([z.string(), JsonObjectSchema]).nullable()))
    .transform((contextChainArray, ctx) => {
      const contextChain: unknown[] = []
      while (contextChainArray.length > 0) {
        const job = contextChainArray.shift()
        if (typeof job !== 'string') {
          ctx.addIssue({
            code: 'custom',
            message: `Value must match the schema: "<JOB_NAME>", [<MATRIX_JSON>], [<JOB_NAME>", [<MATRIX_JSON>], ...]`,
          })
          return z.NEVER
        }
        let matrix;
        if (typeof contextChainArray[0] === 'object') {
          matrix = contextChainArray.shift()
        }
        contextChain.push({job, matrix})
      }
      return contextChain
    })
    .pipe(z.array(WorkflowContextSchema))


let _jobObject: Awaited<ReturnType<typeof getJobObject>>

/**
 * Get the current job from the workflow run
 * @returns the current job
 */
export async function getJobObject(octokit: InstanceType<typeof GitHub>): Promise<typeof jobObject> {
  if (_jobObject) return _jobObject

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

  const absoluteJobName = getAbsoluteJobName({
    job: context.job,
    matrix: getInput('#matrix', JobMatrixParser),
    workflowContextChain: getInput('workflow-context', WorkflowContextParser),
  })

  const currentJob = workflowRunJobs.find((job) => job.name === absoluteJobName)
  if (!currentJob) {
    throw new Error(`Current job '${absoluteJobName}' could not be found in workflow run.\n` +
        'If this action is used within a reusable workflow, ensure that ' +
        'action input \'#workflow-context\' is set correctly and ' +
        'the \'#workflow-context\' job name matches the job name of the job name that uses the reusable workflow.')
    // TODO better error message
  }

  const jobObject = {...currentJob,}
  return _jobObject = jobObject;
}

let _deploymentObject: Awaited<ReturnType<typeof getDeploymentObject>>

/**
 * Get the current deployment from the workflow run
 * @returns the current deployment or undefined
 */
export async function getDeploymentObject(octokit: InstanceType<typeof GitHub>): Promise<typeof deploymentObject | undefined> {
  if (_deploymentObject) return _deploymentObject

  const job = await getJobObject(octokit)

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
        .match(/\/(?<repository>[^/]+\/[^/]+)\/actions\/runs\/(?<run_id>[^/]+)\/job\/(?<job_id>[^/]+)/)

    return pathnameMatch &&
        pathnameMatch.groups?.repository === `${context.repo.owner}/${context.repo.repo}` &&
        pathnameMatch.groups?.run_id === context.runId.toString() &&
        pathnameMatch.groups?.job_id === job.id.toString()
  })

  if (!currentDeployment) return undefined

  const currentDeploymentUrl =
      // eslint-disable-next-line max-len
      `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/deployments/${currentDeployment.latestEnvironment}`
  const currentDeploymentWorkflowUrl =
      `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`

  const deploymentObject = {
    ...currentDeployment,
    databaseId: undefined,
    latestEnvironment: undefined,
    latestStatus: undefined,
    id: currentDeployment.databaseId!,
    url: currentDeploymentUrl,
    workflowUrl: currentDeploymentWorkflowUrl,
    logUrl: currentDeployment.latestStatus!.logUrl! as string,
    environment: currentDeployment.latestEnvironment!,
    environmentUrl: currentDeployment.latestStatus!.environmentUrl as string || undefined,
  }
  return _deploymentObject = deploymentObject
}

/**
 * Throw a permission error
 * @param permission - GitHub Job permission
 * @param options - error options
 * @returns void
 */
export function throwPermissionError(permission: { scope: string; permission: string }, options?: ErrorOptions): never {
  throw new Error(
      `Ensure that GitHub job has permission: \`${permission.scope}: ${permission.permission}\`. ` +
      // eslint-disable-next-line max-len
      'https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token',
      options)
}


// TODO function to store and read job state
