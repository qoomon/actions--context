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
    console.error('Error:', error)
    let failedMessage = 'Unhandled error, see job logs'
    if (error != null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      failedMessage = error.message
    }
    core.setFailed(failedMessage)
  })
}
