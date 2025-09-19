# Repository Guidelines

## Project Structure & Module Organization
`browser-tools-mcp/` contains the MCP server entrypoint (`mcp-server.ts`) that packages to `dist/` for the `browser-tools-mcp` binary. `browser-tools-server/` hosts the Node bridge (`browser-connector.ts`, `puppeteer-service.ts`, `lighthouse/`) that launches audits and manages sockets. The DevTools assets (`manifest.json`, `panel.js`, `background.js`) sit under `chrome-extension/`, while supporting diagrams and copy live in `docs/`. Keep generated output inside the `dist/` folders and leave the project root for planning docs and licensing.

## Build, Test, and Development Commands
Install dependencies per package (`npm install` inside `browser-tools-mcp/` and `browser-tools-server/`). Run `npm run build` to emit strict TypeScript bundles, and `npm start` for a compile-plus-launch workflow. Debug MCP tools with `npm run inspect` against `dist/mcp-server.js`, or `npm run inspect-live` once the package is globally installed. For end-to-end checks, start the server package first, then the MCP package, then load the Chrome extension in DevTools.

## Coding Style & Naming Conventions
TypeScript uses `NodeNext` modules, `strict` mode, two-space indentation, double-quoted strings, and explicit async return types. Exported functions should describe intent (`discoverServer`, `runAuditMode`), and filenames stay kebab-case at the package root. Keep shared types close to their usage (`lighthouse/types.ts`) and avoid ad hoc globals; prefer small utility modules instead.

## Testing Guidelines
There is no automated harness yet—treat `npm run build` in both packages as the regression gate. During manual verification, confirm the connector with `curl http://127.0.0.1:3025/.identity` and trigger at least one audit from your MCP client. When contributing new logic, accompany it with a reproducible script or documented manual scenario and note any required credentials or Chrome flags in the PR.

## Commit & Pull Request Guidelines
Follow the observed `type(scope): subject` convention (`feat(mcp):`, `chore(server):`, `docs:`) and write imperative summaries. Link issues, outline manual validation, and attach screenshots or console captures for UI or audit output changes. Ensure both TypeScript builds succeed before review and call out configuration updates, especially around discovery defaults or network ports.

## Configuration Tips for Agents
The MCP server reads `BROWSER_TOOLS_HOST` and `BROWSER_TOOLS_PORT`, falling back to the `.port` file written by the connector. Align these values in automation scripts and close extra DevTools panels to prevent socket conflicts during discovery.
