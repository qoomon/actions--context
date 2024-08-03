# Enhanced GitHub Action Context
This action provides enhanced context information for GitHub Actions jobs.

### Usage
```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    environment: playground
    permissions:
      actions:     read  # required for qoomon/actions--context action
      deployments: read  # required for qoomon/actions--context action
      contents: read
    steps:
      - uses: qoomon/actions--context@v1
        id: context

      - run: |
          echo "Current Environment: ${{ steps.context.outputs.environment }}"
          echo "Job Logs: ${{ steps.context.outputs.job_log_url }}"
```

### Outputs
```yaml
outputs:
  job:
    description: The workflow job name of the current job.
  job_id:
    description: The workflow run job id of the current job.
  job_log_url:
    description: The HTML url of the job log for the current job.

  run_id:
    description: The workflow run id of the current job.
  run_attempt:
    description: The workflow run attempt of the current job.
  run_number:
    description: The workflow run number of the current job. Same as `github.run_number`.

  environment:
    description: The environment of the current job.
  environment_url:
    description: The environment HTML url of the current job.

  deployment_id:
    description: The deployment id of the current job.
  deployment_url:
    description: The deployment HTML url of the current job.
  deployment_workflow_url:
    description: The deployment workflow HTML url of the current job.
  deployment_log_url:
    description: The deployment log HTML url of the current job.
```

### Usage within Reusable Workflows
Main Workflow
```yaml
jobs:
  reusable-job:
    strategy:
      matrix:
        node-version: [ 22.x, 20.x ]
        chrome-version: [ latest, stable ]
    uses: ./.github/workflows/~reusable-example.yml
    with:
      # IMPORTANT job value needs to be set to the job name of the reusable workflow
      # If the surrounding workflow is a reusable workflow itself,
      #  add ${{ inputs.workflow-context }} as first line of 'workflow-context' value
      workflow-context: |
        { "job": "build-with-reusable-workflow-with-matrix", "matrix": ${{ toJSON(matrix) }} }
```

Reusable workflow
```yaml
on:
  workflow_call:
    inputs:
      workflow-context:
        type: string

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      actions: read  # required for qoomon/actions--context action
      deployments: read  # required for qoomon/actions--context action
      contents: read
    steps:
      - uses: qoomon/actions--context@v1
        id: context
        with:
          workflow-context: ${{ inputs.workflow-context }}

      - run: |
          echo "Current Environment: ${{ steps.context.outputs.environment }}"
          echo "Job Logs: ${{ steps.context.outputs.job_log_url }}"
```

#### Release New Action Version
- Trigger the [Release workflow](../../actions/workflows/release.yaml)
  - The workflow will create a new release with the given version and also move the related major version tag e.g. `v1` to point to this new release
