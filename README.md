# Enhanced Job Context &nbsp; [![Actions](https://img.shields.io/badge/qoomon-GitHub%20Actions-blue)](https://github.com/qoomon/actions) [![starline](https://starlines.qoo.monster/assets/qoomon/actions--context)](https://github.com/qoomon/starlines)


This action provides additinal contextual job informations like the current **job id**, **environment**, **deployment url** and more.
- [Default GitHub Actions Environment Variables](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables)
- [Default GitHub Actions Contexts](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/accessing-contextual-information-about-workflow-runs)

> [!Note]
> This action also works with matrix jobs as well as within reusable workflows!

### Usage
```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    environment: playground
    steps:
      - uses: qoomon/actions--context@v4

      - run: |
          echo "Job Log URL:    ${GITHUB_JOB_URL}"
          echo "Environment:    ${GITHUB_ENVIRONMENT}"
          echo "Deployment URL: ${GITHUB_DEPLOYMENT_URL}"
```

### Additional GitHub Actions Environemt Variables 
- `GITHUB_RUN_URL`
  - The workflow run HTML url of the current job.

- `GITHUB_JOB_NAME`
  - The workflow run job name of the current job.
- `GITHUB_JOB_ID`
  - The workflow run job id of the current job.
- `GITHUB_JOB_URL`
  - The workflow run jub HTML url of the current job.

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

### Enhanced GitHub Actions Job Context as Action Outputs Variables
```yaml
job_name:
  description: The workflow run job name of the current job.
job_id:
  description: The workflow run job id of the current job.
job_url:
  description: The workflow run jub HTML url of the current job.

run_id:
  description: The workflow run id of the current job.
run_attempt:
  description: The workflow run attempt of the current job.
run_number:
  description: The workflow run number of the current job.
run_url:
  description: The workflow run HTML url of the current job.

environment:
  description: The job environment of the current job.
environment_url:
  description: The job environment HTML url of the current job.

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
