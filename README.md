# Ballerina Skills

Agent skills and plugins for Ballerina developers — language-server code intelligence for `.bal` files, and an AI coding assistant that writes integrations and services, discovers libraries from Ballerina Central, and builds, runs, and tests projects.

## Prerequisites

- Ballerina 2201.12.0 (Swan Lake Update 12) or later, with `bal` available on the `PATH`.
- Node.js 18 or later, for the activation hooks (Claude Code).
- Recommended: the `bal discover` tool (Ballerina 2201.14.0 or later) for library lookups: `bal tool pull discover`.
  To skip a permission prompt per lookup, allow `Bash(bal discover:*)`. Without it, the skill reads the pulled
  package source instead.

## Installation

### Claude Code

Register the marketplace and install the plugin:

```bash
/plugin marketplace add ballerina-platform/skills
/plugin install ballerina@ballerina-skills
```

Restart the session to activate the language server, the `ballerina` skill, and the activation hooks.

### GitHub Copilot

In GitHub Copilot CLI, register the marketplace and install the plugin:

```bash
copilot plugin marketplace add ballerina-platform/skills
copilot plugin install ballerina@ballerina-skills
```

In VS Code, add `ballerina-platform/skills` to the `chat.plugins.marketplaces` setting, then search `@agentPlugins ballerina` in the Extensions view and install it.

This installs the language server (Copilot CLI) and the `ballerina` skill. The activation hooks are Claude Code only.

### Other agents (Open Agent Skills CLI)

Install the skill for Codex, Cursor, Gemini CLI, and other agents:

```bash
npx skills add ballerina-platform/skills
```

Pass `--agent <name>` to target a specific agent. This channel installs the `ballerina` skill only; the language server comes with the Claude Code and GitHub Copilot plugins, and the activation hooks with the Claude Code plugin.

## Skills

| Skill | Description |
|-------|-------------|
| `ballerina` | Write, build, run, and test Ballerina programs and integrations, and discover and add libraries from Ballerina Central. |

## Usage

The `ballerina` skill activates automatically when a request involves Ballerina work, or it can be invoked directly:

```bash
/ballerina <request>
```

Representative requests:

| Request | Outcome |
|---------|---------|
| "Write a Ballerina HTTP service" | Scaffolds and implements the service |
| "Run the Ballerina project" | Builds and runs the project |
| "Fix this `.bal` file" | Diagnoses and corrects the code |
| "Find a Ballerina GitHub client" | Discovers the library and its API |

## Removed in 0.6.0

The `ballerina:library` agent and the `get_library` MCP tool are gone; the skill looks libraries up with `bal discover`
(or the pulled package source). Saved permission rules or instructions that name them no longer apply.

## License

Licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for details.

---------------------------------------------------------------------------
(c) Copyright 2026 WSO2 LLC.
