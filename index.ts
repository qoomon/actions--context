/* eslint-disable camelcase */
import * as core from '@actions/core'
import {getInput, InputOptions} from '@actions/core'
import * as github from '@actions/github'
// eslint-disable-next-line node/no-unpublished-import
import {Deployment} from '@octokit/graphql-schema'
import {run, sleep} from './lib/actions.js'
// see https://github.com/actions/toolkit for more GitHub actions libraries
import {fileURLToPath} from 'url'
import * as process from 'node:process'
import {z} from 'zod'

const context = github.context
const enhancedContext = {
  repository: `${context.repo.owner}/${context.repo.repo}`,
  runAttempt: parseInt(process.env.GITHUB_RUN_ATTEMPT!, 10),
  runnerName: process.env.RUNNER_NAME!,
}

export const action = () => run(async () => {
  const inputs = {
    token: getInput('token', {required: true})!,
    matrix: getAndParseInput('__matrix',
        JsonTransformer.pipe(z.union([z.null(), z.record(JsonSchema)])), {required: true})!,
    // As of now (Aug 2024) it is not possible to reconstruct the job name from within a reusable workflows,
    // so we need to pass the job name and matrix properties as an action input variable
    workflowContext: getAndParseInput('workflow-context',
        WorkflowContextParser, {required: false}),
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
    throw new Error(`Current job '${actualJobName}' could not be found in workflow run.\n` +
        'If this action is used within a reusable workflow, ensure that ' +
        'action input \'workflow-context\' is set correctly and ' +
        'the \'workflow-context\' job name matches the job name of the job name that uses the reusable workflow.')
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
function getActualJobName({job, matrix, workflowContext}: {
  job: string, matrix?: Json, workflowContext?: WorkflowContext[]
}) {
  let actualJobName = job
  if (matrix) {
    const flatValues = getFlatValues(matrix)
    if (flatValues.length > 0) {
      actualJobName = `${actualJobName} (${flatValues.join(', ')})`
    }
  }

  workflowContext?.forEach((context) => {
    const contextJob = getActualJobName(context)
    actualJobName = `${contextJob} / ${actualJobName}`
  })

  return actualJobName
}

// --- github actions utils ---

/**
 * Get and parse input
 * @param name - input name
 * @param schema - input schema
 * @param options - input options
 * @returns parsed input
 */
function getAndParseInput(name: string, schema: z.ZodSchema, options?: InputOptions): z.infer<typeof schema> {
  const input = getInput(name, options)
  if (!input) return undefined

  const parseResult = schema.safeParse(input)
  if (parseResult.error) {
    const issues = parseResult.error.issues.map(formatZodIssue)
    throw new Error(`Invalid value for input '${name}': ${input}\n` +
        issues.map((it) => `  - ${it}`).join('\n'))
  }

  return parseResult.data
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

// --- common utils ---

/**
 * Flatten objects and arrays to all its values including nested objects and arrays
 * @param values - value(s)
 * @returns flattened values
 */
function getFlatValues(values: unknown): unknown[] {
  if (typeof values !== 'object' || values == null) {
    return [values]
  }

  if (Array.isArray(values)) {
    return values.flatMap(getFlatValues)
  }

  return getFlatValues(Object.values(values))
}

// --- types and schemas ---

const LiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
type Literal = z.infer<typeof LiteralSchema>
type Json = Literal | { [key: string]: Json } | Json[]
const JsonSchema: z.ZodType<Json> = z.lazy(() => z.union([LiteralSchema, z.array(JsonSchema), z.record(JsonSchema)]))

const WorkflowContextSchema = z.object({
  job: z.string(),
  matrix: z.union([z.null(), JsonSchema]),
}).strict()
type WorkflowContext = z.infer<typeof WorkflowContextSchema>

const WorkflowContextParser = z.string()
    .transform((str, ctx) => {
      try {
        return JSON.parse(`[${str
            // fix trailing comma
            .replace(/,\s*$/g, '')
            // fix missing values
            .replace(/,(?=,)/, ',null')
        }]`)
      } catch (error: unknown) {
        ctx.addIssue({code: 'custom', message: (error as { message?: string }).message})
        return z.NEVER
      }
    })
    .pipe(z.array(z.union([z.string(), z.record(JsonSchema), z.null()])))
    .transform((contextArray, ctx) => {
      const context: unknown[] = []
      while (contextArray.length > 0) {
        const job = contextArray.shift()
        if (typeof job !== 'string') {
          ctx.addIssue({
            code: 'custom',
            message: `Value must match the schema: "<JOB_NAME>", [<MATRIX_JSON>], [<JOB_NAME>", [<MATRIX_JSON>], ...]`,
          })
          return z.NEVER
        }
        if (typeof contextArray[0] === 'object') {
          const matrix = contextArray.shift()
          context.push({job, matrix})
        } else {
          context.push({job})
        }
      }
      return z.array(WorkflowContextSchema).parse(context)
    })

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

const JsonTransformer = z.string().transform((str, ctx) => {
  try {
    return JsonSchema.parse(JSON.parse(str))
  } catch (error: unknown) {
    ctx.addIssue({code: 'custom', message: (error as { message?: string }).message})
    return z.NEVER
  }
})

// --- main ---

// Execute the action, if running as the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  action()
}
