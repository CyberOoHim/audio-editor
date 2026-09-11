# CI/CD Must-Do Guidelines

- **Commit `package-lock.json`**: Always maintain and commit an up-to-date `package-lock.json` alongside `package.json` (`npm i --package-lock-only`). `actions/setup-node` with `cache: 'npm'` strictly requires this file or the CI build fails.
- **Set Node Version to Active LTS (22+)**: Always configure `node-version: 22` (or higher) in GitHub Actions workflows to prevent Node 20 runner deprecation warnings.
