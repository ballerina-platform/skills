# Test Rules

Read when writing Ballerina tests.

- Use the `ballerina/test` module and any service-specific test libraries.
- Test an HTTP service through an `http:Client` against the running service — assert its public contract, not internals.
- Override `configurable` values for tests in `tests/Config.toml` (not the package's `Config.toml`).
- To mock a client or connector, wrap its construction in a small init function so `@test:Mock` can replace it.
- Use `dependsOn` only when test ordering is the behavior under test — not to sequence otherwise-independent tests.
