import {action} from './index.js'
import {exec} from './lib/actions.js'
import * as process from 'process'

// Set Working directory
process.chdir('/tmp/sandbox')

// Prepare scenario
await exec('sh -c "date > date.txt"')

// ---------------------------------------------------------------------------------------------------------------------

// Set action input
setActionInputs({
  token: process.env.GITHUB_TOKEN,
})

// Run the action
action()

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Set action input environment variables
 * @param inputs - input values
 * @returns void
 */
function setActionInputs(inputs: Record<string, string | undefined>) {
  Object.entries(inputs).forEach(([name, value]) => {
    process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value
  })
}
