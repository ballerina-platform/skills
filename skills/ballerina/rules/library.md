# Looking Up a Library's API

Read before writing code against a connector or library.

## With `bal discover`

- Start with `bal discover search "<words>" --output-format text` or
  `bal discover package <org>/<name> --output-format text`, then run the `Next:` commands it prints.
- Ask one question per call: `client <Name>`, `method <name> --client <Name>`, `type <Name>`, or `service` for a
  listener's service type (it lists the methods to implement and their rules), each with `-p <org>/<name>` and
  `--output-format text`. Run one command per shell call, or separate several with `;` (not `&&`, which Windows
  PowerShell 5.1 rejects).
- Narrow a long listing with `--filter <keyword>` rather than paging.
- Run it from the project folder, and check again after the first `bal build`: outside a project it reads the latest
  version on Central, which may differ from the one the build resolves (`Dependencies.toml`).
- Copy signatures verbatim; never invent them. `bal discover <noun> --help` shows a noun's options.
- It reads Central, not the installed distribution: for `lang.*` behaviour, the version that applies is `bal version`.
- Behaviour notes in these rules say "as of <package> <version>" with an issue id. The version that applies is on
  discover's header line when run from the project folder (`ballerinax/kafka:4.6.8 · …`) or in `Dependencies.toml`
  (`bal version` for `lang.*`). If it is newer than the note's, check the issue before applying the workaround.

When both a `trigger.*` listener package and a connector that ships its own listener cover the same events (e.g.
`ballerinax/trigger.<x>` vs `ballerinax/<x>`), pick the connector's listener: `trigger.*` packages are being
superseded. Don't judge by the modified date.

## Without `bal discover`

If `bal discover` isn't installed or a `bal discover` command fails (unknown command, "removed manually", no network):

1. Tell the user once that `bal tool pull discover` (Ballerina 2201.14 or later) gives faster lookups. Never run
   `bal tool pull` or `bal tool remove` yourself unless asked, even when `bal` suggests it.
2. Search Ballerina Central: `bal search <keyword>` (one term per search).
3. Pull the package: `bal pull <org>/<name>`. Its sources land in your home directory under
   `.ballerina/repositories/central.ballerina.io/bala/<org>/<name>/<version>/<platform>/modules/<name>/`. Match both
   `<version>` and `<platform>` with a wildcard: the platform is `any` for pure-Ballerina packages, otherwise a JDK
   target such as `java25` or `java21`. If Central is unreachable, read the balas already pulled there.
4. Search the module for the declarations you need instead of reading whole files: `public type`, `public isolated
   function`, `remote isolated function`, `resource isolated function`, and the listener and service types. File names
   vary between connectors (`client.bal`, `types.bal`, `listener.bal`, `service_types.bal`, …), so search rather than
   assume a name. Read only the matching declarations and their doc comments.
5. Use the signatures you find verbatim; never invent them. An empty service body in a connector's service type
   (`service object { }`) means a compiler plugin checks the remote methods: read the package README (`docs/README.md` in the pulled package) for them.
