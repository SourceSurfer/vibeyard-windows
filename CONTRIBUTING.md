# Contributing to Vibeyard

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. **Node v24** is required — see `.nvmrc`. Use `nvm use` to switch.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build and run:
   ```bash
   npm run build
   npm start
   ```

There is **no hot reload** — changes require a full rebuild and app restart.

## Testing

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-runs on file changes)
npm run test:coverage # Coverage report (terminal + HTML at coverage/index.html)
```

Tests use [Vitest](https://vitest.dev/) and are co-located with source files as `*.test.ts`.

## Code Style

No lint tooling is configured yet (planned). For now:

- Use 2-space indentation
- Follow existing patterns in the codebase

## Pull Request Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes and add tests where appropriate
4. Run `npm run build` and `npm test` to verify nothing is broken
5. Open a PR against `main`

## Reporting Issues

When filing a bug report, please include:

- **OS version** (e.g., macOS 15.3)
- **Vibeyard version** (from the app's title bar or `package.json`)
- **Claude Code CLI version** (`claude --version`)
- **Steps to reproduce**
- **Expected vs actual behavior**
