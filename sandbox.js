/* eslint-disable */

const parentJobName = 'parent-build-job'
const parentJobMatrix = {parentJobProperty: 'parentValue'}
const parentJobContext = `"${parentJobName}", ${toJson(parentJobMatrix)}`

const jobName = 'build-job'
const jobMatrix = {jobProperty: 'jobValue'}

const workflowContext = `"${jobName}", ${toJson(jobMatrix)}, ${parentJobContext}`

console.log(workflowContext)
console.log('=>')
console.log(parseWorkflowContext(workflowContext))

function parseWorkflowContext(contextString) {
  const contextArray = JSON.parse(`[${contextString}]`)
  const context = []
  while (contextArray.length > 0) {
    const job = contextArray.shift()
    if (typeof job !== 'string') {
      throw new Error(`Invalid job name: ${job}`)
    }
    let matrix = undefined
    if(typeof contextArray[0] === 'object') {
      matrix = contextArray.shift()
    }
    context.push({ job, matrix })
  }
  return context
}

function toJson(obj) {
  if (!obj) return 'null'
  return JSON.stringify(obj, null, 2)
}

console.log('---', Date())
