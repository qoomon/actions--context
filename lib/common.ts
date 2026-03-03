import {z} from "zod";
import YAML from "yaml";
import {Context} from '@actions/github/lib/context';

export type JsonLiteral = string | number | boolean | null
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type JsonObject = { [key: string]: Json };
export type Json = JsonLiteral | JsonObject | Json[]
export const LiteralSchema: z.ZodType<JsonLiteral> = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const JsonSchema: z.ZodType<Json> = z.lazy(() => z.union([LiteralSchema, JsonObjectSchema, z.array(JsonSchema)]))
export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.union([z.string(), z.number()]), JsonSchema)

export const YamlParser = z.string().transform((str, ctx) => {
  try {
    return YAML.parse(str) as Json
  } catch (error: unknown) {
    ctx.addIssue({code: 'custom', message: (error as { message?: string }).message})
    return z.NEVER
  }
})

export const JsonParser = z.string().transform((str, ctx) => {
  try {
    return YAML.parse(str) as Json
  } catch (error: unknown) {
    ctx.addIssue({code: 'custom', message: (error as { message?: string }).message})
    return z.NEVER
  }
})

/**
 * Returns a promise that resolves after the specified time
 * @param milliseconds
 */
export async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Flatten objects and arrays to all its values including nested objects and arrays
 * @param values - value(s)
 * @returns flattened values
 */
export function getFlatValues(values: unknown): unknown[] {
  if (typeof values !== 'object' || values == null) {
    return [values]
  }

  if (Array.isArray(values)) {
    return values.flatMap(getFlatValues)
  }

  return getFlatValues(Object.values(values))
}

/**
 * Throws an error
 * @param error
 */
export function _throw(error: unknown): never {
  throw error
}

// --- Enhanced GitHub Action Context --------------------------------------------------

export class EnhancedContext extends Context {

  get repository() {
    return `${this.repo.owner}/${this.repo.repo}`;
  }

  get isGithubEnterprise() {
    return process.env.GITHUB_API_URL != 'https://api.github.com'
  }

  get jobCheckRunId() {
    return parseInt(process.env.JOB_CHECK_RUN_ID
        // WORKAROUND until https://github.com/actions/runner/pull/4053 is merged and released
        ?? process.env.INPUT__JOB_CHECK_RUN_ID
        ?? _throw(new Error('Missing environment variable: JOB_CHECK_RUN_ID')));
  }

  get workflowRef() {
    return process.env.GITHUB_WORKFLOW_REF
        ?? _throw(new Error('Missing environment variable: GITHUB_WORKFLOW_REF'));
  }

  get workflowSha() {
    return process.env.GITHUB_WORKFLOW_SHA
        ?? _throw(new Error('Missing environment variable: GITHUB_WORKFLOW_SHA'));
  }

  get runHtmlUrl() {
    return process.env.GITHUB_RUN_HTML_URL ?? `${this.serverUrl}/${this.repository}` + `/actions/runs/${this.runId}` +
        (this.runAttempt ? `/attempts/${this.runAttempt}` : '');
  }

  get runnerName() {
    return process.env.RUNNER_NAME
        ?? _throw(new Error('Missing environment variable: RUNNER_NAME'));
  }

  get runnerTempDir() {
    return process.env.RUNNER_TEMP
        ?? _throw(new Error('Missing environment variable: RUNNER_TEMP'));
  }
}
