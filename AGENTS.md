# Notes for agents

## ui-sdk

The web app's components are built on [ui-sdk](https://ui-sdk.dev) (`@ui-sdk/react` and `@ui-sdk/core`).

Before using ui-sdk, follow the ui-sdk skill if it's installed (`.agents/skills/ui-sdk`), and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.

The packages are installed in `apps/web`, so the docs are in `apps/web/node_modules/@ui-sdk/react/docs/`.

## Work tracking

Track your work using the public facing smelp instance, through the MCP server at `https://smelp.philipps.io/mcp`.

Important: the workspace and project are public for read-only access if there is no authentication present.
