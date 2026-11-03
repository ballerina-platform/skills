# GraphQL Issues

`ballerina/graphql` runs on top of `ballerina/http`. HTTP trace logs (see [http.md](http.md)) reveal the request/response JSON; this file covers GraphQL-specific layers above that.

## Error types

**Listener-side** (`graphql:Error` — returned from listener lifecycle calls like `attach`, `start`, `gracefulStop`):

```text
graphql:Error
├── graphql:AuthnError    (authentication failed)
└── graphql:AuthzError    (authorization failed)
```

**Client-side** (`graphql:ClientError`):

```text
graphql:ClientError
├── graphql:RequestError
│   ├── graphql:HttpError              (network failure; detail has the response body)
│   └── graphql:InvalidDocumentError   (query fails schema validation; detail has ErrorDetail[])
├── graphql:PayloadBindingError        (response cannot bind to the target type)
└── graphql:ServerError                (deprecated — old executeWithType() API)
```

`graphql:ServerError` is deprecated. Migrate callers from `executeWithType()` to `execute()`.

## Resolver errors become response entries, not panics

When a resource or remote method returns an `error`, the framework converts it into an `errors[]` entry in the GraphQL response — the service stays up:

```json
{
  "data": null,
  "errors": [
    { "message": "Something went wrong", "locations": [...], "path": [...] }
  ]
}
```

So when a resolver "fails" but the service keeps running, look at the response payload, not at stderr:

1. Enable DEBUG logging to see the error value before serialization.
2. Enable HTTP trace logs to inspect the full request/response JSON.

## Common GraphQL issues

| Symptom                                                       | Likely cause                                                       | Fix                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Compile error: "must have at least one resource function"     | GraphQL service has no `resource function get ...`                 | Add at least one query resolver                                               |
| Compile error on return type                                  | Resource returns `error` or `error?` alone                         | Return `T\|error`, where `T` is the data type                                  |
| Subscription doesn't stream                                   | Resolver returns `T` instead of `stream<T>`                        | Change return type to `stream<T, error?>`                                     |
| Client raises `graphql:InvalidDocumentError`                  | Query document doesn't match the schema                            | Validate the query against the published schema                               |
| `graphql:PayloadBindingError`                                 | Target record on the client doesn't match the response shape       | Compare the client's target type against the response shape                   |
| Subscription auth error                                       | WebSocket upgrade missing auth headers                             | Pass auth tokens via the connection init params                               |
| Union type compile error                                      | Union member service class is not `distinct`                       | Declare each union member as a `distinct service class`                       |
| `graphql:HttpError` on client                                 | Network failure or wrong endpoint URL                              | Verify the endpoint; enable HTTP trace logs                                   |

## `graphql:Context` — request-scoped data

`graphql:Context` carries request-scoped values (auth info, DataLoaders, etc.) into resolvers:

```ballerina
resource function get user(graphql:Context ctx) returns User|error {
    string token = check ctx.get("auth_token").ensureType();
    // ...
}
```

The classic pitfall: calling `ctx.get("key")` when nothing set it returns a `graphql:Error` ("Attribute with the key ... not found in the context"). Make sure an interceptor (or earlier resolver) runs `ctx.set("key", value)` before any resolver that needs the key.

## DataLoader issues

DataLoaders batch and cache field fetches to fix the N+1 problem. Watch for:

| Issue                                | Symptom                                                          | Fix                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| N+1 not actually resolved            | Trace logs show one DB call per row                              | Register a DataLoader and have resolvers call `dataLoader.load(key)` instead of querying directly   |
| Batch function returns error         | Every waiting resolver sees the same error                       | Handle per-key failures inside the batch function; return partial success where the API supports it |
| Stale data across requests           | Resolver returns yesterday's data                                | DataLoader's cache is per-request — confirm you're not sharing one instance across requests          |
| Batch function never called          | DataLoader registered but resolvers still hit the database       | Check that resolvers actually call `dataLoader.load(key)` instead of the underlying client          |

## Compile-time schema validations

The `ballerina/graphql` compiler plugin enforces schema correctness up front. Common rules it rejects:

| Compile error                                            | Rule it enforces                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Service must have at least one resource method           | The `Query` type cannot be empty                                          |
| Remote methods not allowed in sub-object service types   | Only the root service can declare `remote` methods                        |
| Union member must be a `distinct service class`          | GraphQL is nominally typed — Ballerina union members must be distinct     |
| Subscription must return `stream<T>`                     | Subscription resolvers must return a stream                               |
| Interface must be implemented fully                      | All fields from an interface must appear on the implementing type         |
