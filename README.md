# Enhanced Job Context &nbsp; [![Actions](https://img.shields.io/badge/qoomon-GitHub%20Actions-blue)](https://github.com/qoomon/actions)

This action provides an enhanced job context for GitHub Actions.
> [!Note]
> If you're missing a context value feel free to [open a feature request](https://github.com/qoomon/actions--context/issues)

### Usage
```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    environment: playground
    steps:
      - uses: qoomon/actions--context@v2
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

#### Release New Action Version
- Trigger the [Release workflow](../../actions/workflows/release.yaml)
  - The workflow will create a new release with the given version and also move the related major version tag e.g. `v1` to point to this new release
