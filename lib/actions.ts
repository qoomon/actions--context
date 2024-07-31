import * as core from '@actions/core'
import * as httpClient from '@actions/http-client'
import * as _exec from '@actions/exec'
import YAML from 'yaml'

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
    console.error('Error:', error)
    let failedMessage = 'Unhandled error, see job logs'
    if (error != null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      failedMessage = error.message
    }
    core.setFailed(failedMessage)
  })
}

/**
 * Gets string value of an input.
 * Unless trimWhitespace is set to false in InputOptions, the value is also trimmed.
 * Returns null if the value is not defined.
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   parsed input as object
 */
export function getInput(name: string, options?: core.InputOptions): string | undefined {
  return core.getInput(name, options) || undefined
}

/* eslint-disable  @typescript-eslint/no-explicit-any */
/**
 * Gets the yaml value of an input.
 * Unless trimWhitespace is set to false in InputOptions, the value is also trimmed.
 * Returns null if the value is not defined.
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   parsed input as object
 */
export function getYamlInput(name: string, options?: core.InputOptions): any | undefined {
  const input = getInput(name, options)
  if (input === undefined) return undefined
  return YAML.parse(input)
}

/**
 * Execute a command and get the output.
 * @param commandLine - command to execute (can include additional args). Must be correctly escaped.
 * @param args - optional command arguments.
 * @param options - optional exec options. See ExecOptions
 * @returns status, stdout and stderr
 */
export async function exec(commandLine: string, args?: string[], options?: _exec.ExecOptions): Promise<ExecResult> {
  const stdoutChunks = <Buffer[]>[]
  const stderrChunks = <Buffer[]>[]
  const status = await _exec.exec(commandLine, args, {
    ...options,
    listeners: {
      stdout(data) {
        stdoutChunks.push(data)
      },
      stderr(data) {
        stderrChunks.push(data)
      },
    },
  })
  return {
    status,
    stdout: Buffer.concat(stdoutChunks as Uint8Array[]),
    stderr: Buffer.concat(stderrChunks as Uint8Array[]),
  }
}

export type ExecResult = {
  status: number
  stdout: Buffer
  stderr: Buffer
}
