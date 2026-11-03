# Library Discovery Without the `library` Agent

Read when the task needs a connector or library and no `library` agent is available.

1. Search Ballerina Central: `bal search <keyword>` (one term per search).
2. Pull the package: `bal pull <org>/<name>`. Its sources land in your home directory under
   `.ballerina/repositories/central.ballerina.io/bala/<org>/<name>/<version>/<platform>/modules/<name>/`. Match both
   `<version>` and `<platform>` with a wildcard: the platform is `any` for pure-Ballerina packages, otherwise a JDK
   target such as `java25` or `java21`.
3. Search the module for the declarations you need instead of reading whole files: `public type`, `public isolated
   function`, `remote isolated function`, `resource isolated function`, and the listener and service types. File names
   vary between connectors (`client.bal`, `types.bal`, `listener.bal`, `service_types.bal`, …), so search rather than
   assume a name. Read only the matching declarations and their doc comments.
4. Use the signatures you find verbatim; never invent them.

When both a `trigger.*` listener package and a connector that ships its own listener cover the same events (e.g.
`ballerinax/trigger.<x>` vs `ballerinax/<x>`), pick the connector's listener: `trigger.*` packages are being
superseded. Don't judge by the modified date `bal search` shows.

An empty service body in a connector's service type (`service object { }`) means the remote-method contract is
checked by a compiler plugin, not that the service has no methods: read the package README for the method signature.
