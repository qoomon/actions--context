import * as core from '@actions/core'

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
 * Sleep for a number of milliseconds
 * @param milliseconds - number of milliseconds to sleep
 * @returns void
 */
export async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
