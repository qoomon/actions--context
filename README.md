# Enhanced Job Context &nbsp; [![Actions](https://img.shields.io/badge/qoomon-GitHub%20Actions-blue)](https://github.com/qoomon/actions)

This action provides an enhanced job context for GitHub Actions e.g., job_id, environment, deployment_id, and more.


> [!Note]
> This action will also work with matrix jobs and/or within reusable workflows!

> [!Note]
> If you're missing a context value feel free to [open a feature request](https://github.com/qoomon/actions--context/issues)

### Usage
```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    environment: playground
    steps:
      - uses: qoomon/actions--context@v3
        id: context

      - run: |
          echo "Current Environment: ${{ steps.context.outputs.environment }}"
          echo "Job Logs: ${{ steps.context.outputs.job_log_url }}"
```

### Exported Variables
- `GITHUB_RUN_URL`

- `GITHUB_JOB_NAME`
  - The full workflow job name of the current job.`
- `GITHUB_JOB_ID`
  - The workflow run job id of the current job.
- `GITHUB_JOB_URL`
  - The HTML url of the job of the current job.

- `GITHUB_ENVIRONMENT`
  - The environment of the current job.
- `GITHUB_ENVIRONMENT_URL`
  - The environment HTML url of the current job.

- `GITHUB_DEPLOYMENT_ID`
  - The deployment id of the current job.
- `GITHUB_DEPLOYMENT_URL`
  - The deployment HTML url of the current job.

- `RUNNER_ID`
  - The runner id of the current job.

### Outputs
```yaml
outputs:
  job_name:
    description: The workflow job name of the current job.
  job_id:
    description: The workflow run job id of the current job.
  job_url:
    description: The HTML url of the job of the current job.

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

  runner_name:
    description: The runner name of the current job.
  runner_id:
    description: The runner id of the current job.
```

---

## Development

#### Release New Action Version
- Trigger the [Release workflow](../../actions/workflows/release.yaml)
  - The workflow will create a new release with the given version and also move the related major version tag e.g. `v1` to point to this new release
