# GitHub Action Context
This action provides enhanced context information for GitHub Actions jobs.

### Usage
```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    environment: playground
    steps:
      - uses: qoomon/actions--context@v1
        id: context

      - run: |
          echo "Current Environment: ${{ steps.context.outputs.environment }}"
          echo "Job Logs: ${{ steps.context.outputs.job_log_url }}"
```

### Outputs
```yaml
job:
  description: |
    The workflow jobs.<job_id> of the current job.
    Same as `github.job`.
job_id:
  description: The workflow run job id of the current job.
job_log_url:
  description: The HTML url of the job log for the current job.
job_matrix:
  description: The artificial matrix workflow jobs.<job_id> of the current job.
run_id:
  description: |
    The workflow run id of the current job.
    Same as `github.run_id`.
run_attempt:
  description: |
    The workflow run attempt of the current job.
    Same as `github.run_attempt`.
run_number:
  description: |
    The workflow run number of the current job.
    Same as `github.run_number`.
environment:
  description: The environment of the current job.
environment_url:
  description: The HTML url of the environment of the current job.
deployment_url:
  description: The HTML url of the deployment of the current job.
deployment_workflow_url:
  description: The HTML url of the deployment workflow of the current job.
deployment_log_url:
  description: The HTML url of the deployment log of the current job.
```

#### Release New Action Version
- Trigger the [Release workflow](../../actions/workflows/release.yaml)
  - The workflow will create a new release with the given version and also move the related major version tag e.g. `v1` to point to this new release
