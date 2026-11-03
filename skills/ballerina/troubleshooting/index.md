# Troubleshooting — Index

Use this table when searching the skill for the error's words (`scripts/lookup.mjs`) found nothing. **Read only the topic file matching the symptom — do not preload all troubleshooting files.**

## Symptom → file

| Symptom                                                                  | Read                                       |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `bal: command not found` — Ballerina not installed or not on PATH        | [../setup.md](../setup.md)                 |
| `bal build` reports `ERROR [file.bal:(line,col)] ...`                    | [compiler.md](compiler.md)                 |
| `bal build` prints `Oh no, something really went wrong` + JVM stack      | [compiler.md](compiler.md) §Crashes        |
| Runtime panic — `error: {ballerina}...` + stack trace during `bal run`   | [runtime.md](runtime.md)                   |
| HTTP client/listener — `{ballerina/http}...Error`, timeouts, 4xx/5xx     | [http.md](http.md)                         |
| SQL — `{ballerina/sql}DatabaseError`, `NoRowsError`, connection refused  | [sql.md](sql.md)                           |
| GraphQL — resolver errors, schema validation, subscription failures      | [graphql.md](graphql.md)                   |
| Kafka / RabbitMQ / NATS / JMS — connector or broker errors               | [messaging.md](messaging.md)               |
| gRPC or WebSocket failures                                               | [grpc-websocket.md](grpc-websocket.md)     |
| TLS handshake, PKIX path, OAuth2, JWT validation                         | [auth.md](auth.md)                         |
| `cloneWithType` / `fromJsonStringWithType` / data binding errors         | [data-binding.md](data-binding.md)         |
| High latency, throughput drops, OOM, GC pressure, thread starvation      | [performance.md](performance.md)           |
| `cannot resolve module`, `package not found`, version conflicts          | [packages.md](packages.md)                 |
| `bal openapi`, `bal grpc`, `bal test`, `bal persist`, formatter problems | [tooling.md](tooling.md)                   |
| Works locally, fails in Docker / Kubernetes / GraalVM native image       | [deployment.md](deployment.md)             |

## What to capture before diving in

Whatever the symptom, three pieces of context make every diagnosis faster:

1. **Ballerina version** — `bal --version`. Bugs and APIs are version-specific.
2. **Project files** — `Ballerina.toml` (package + declared deps) and `Dependencies.toml` (resolved lockfile).
3. **Full error output** — the complete stack trace, not just the last line. Run with debug logging where possible (see the relevant topic file for how to enable it).

## Reference links

- Ballerina docs: <https://ballerina.io/learn/>
- Language specification: <https://ballerina.io/spec/lang/>
- Ballerina Central (packages): <https://central.ballerina.io>
- Ballerina platform repos: <https://github.com/ballerina-platform>
