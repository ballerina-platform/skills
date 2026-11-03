---
name: ballerina
description: Writes, runs, tests, debugs, and deploys Ballerina programs and integrations.
  Use when the user asks to write, create, implement, update, or fix Ballerina code; create
  or set up a new Ballerina project or package; build an HTTP service, API, GraphQL service,
  or integration in Ballerina; run, test, or build a Ballerina project; add a library or
  dependency; debug, diagnose, or explain a Ballerina compile error, runtime panic, stack
  trace, or failing integration; work with a .bal file, Ballerina.toml, Dependencies.toml,
  or Config.toml; answer a question about a Ballerina project or its build, runtime, or
  deployment requirements; run a bal command; generate Ballerina code from an OpenAPI or
  proto specification; deploy a Ballerina service to Docker, Kubernetes, or a GraalVM native
  image; or when the user does not have Ballerina installed and needs help setting it up.
---

**Before you write or edit any `.bal` file, read [code-rules.md](code-rules.md) in full.** It holds the rules for all Ballerina code and routes to the domain rules your task needs.

## Creating a New Project

When the user asks to create a new project, service, or program from scratch:

```bash
bal new <project-name>   # scaffolds main.bal + Ballerina.toml
cd <project-name>
```

- Read the generated `Ballerina.toml` to understand the package (name, org, version)
- For a workspace (multiple packages in one repo), see the workspace rules that [code-rules.md](code-rules.md) routes to

## Writing Ballerina Code

**Step 1 — Read existing code and plan file layout**: Read `.bal` files and `Ballerina.toml` to understand the project and its existing layout. Place new code in the file that fits its concern rather than everything in `main.bal`.

**Step 2 — Discover libraries if needed**: If the task calls a product's API (SAP, Salesforce, GitHub, …), look for its connector first, even when the task describes plain HTTP calls; write `http:Client` code only when there is none, or when it lacks the operation the task needs. If the task needs an external connector or library you don't know, invoke the `library` agent with the full task (including auth and trigger/event details), one call per library, in parallel, while you carry on with other work. Add the `import` it returns; `bal build` resolves the dependency from Central. Trust its API summary rather than reading package sources, and never call `get_library` yourself: its output is the whole library API. No `library` agent? Follow [rules/library.md](rules/library.md).

**Step 3 — Write the code**, following [code-rules.md](code-rules.md) and the domain rules it routes to. If the Ballerina language server (LSP) is available, use `hover` and `goToDefinition` to confirm a symbol's type or an API's real shape.

**Step 4 — Validate**: Run `bal build`. Fix every error before moving on. Repeat until clean. If an error is about a library's own API (wrong method, listener, or service signature), ask the `library` agent for the specific detail rather than re-guessing.

## Running and Testing

- Test request → `bal test`; otherwise → `bal run`
- Always run `bal build` first — if errors, stop and report each one with file and line number
- A service started with `bal run` does not exit on its own. Send its output to a log file, read the log's last lines or search it for `error` rather than printing it whole, and stop the service when done
- On test: fix failures and re-run until clean
- A jar from `bal build` needs the Java version its distribution targets: Java 25 for 2201.14.x, Java 21 for 2201.13.x (`bal version` shows the distribution). A `Dockerfile` needs a base image with that Java

When the program needs a broker, database, or other server, see [rules/integration-testing.md](rules/integration-testing.md) before calling the work done.

## Look Things Up

Before writing a construct you have not used in this task and these rules do not show (XML namespaces, regular expressions, query expressions, transactions, streams, a library's listener), or when an error message does not tell you the fix, search:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/lookup.mjs" <words>          # matching sections of this skill, and matching examples
node "${CLAUDE_SKILL_DIR}/scripts/lookup.mjs" example <slug>   # print one example's code (add --explain for its notes)
```

`${CLAUDE_SKILL_DIR}` is the folder holding this file. For a skill match, read about 40 lines from its `file:line`. The examples are Ballerina by Example, shipped with the installed Ballerina under `<bal home>/examples/` (`bal home` prints the path); without Node, search there and in this skill's folder with your own search tool. For a `bal` command's options, run `bal <command> --help`.

## Ballerina Not Installed

If a `bal` command fails because Ballerina is not installed, read [setup.md](setup.md) for installation instructions.

## Errors and Unexpected Behavior

When `bal build` reports an error whose message tells you the fix, fix it and rebuild. When the message does not, or a program panics at runtime or behaves unexpectedly, look up the error's distinctive words (above) and read the section it finds. If the search finds nothing, [troubleshooting/index.md](troubleshooting/index.md) maps symptoms to topic files. Do not preload troubleshooting files.
