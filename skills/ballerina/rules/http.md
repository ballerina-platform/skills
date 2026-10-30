# HTTP Rules

Read when building an HTTP service or calling an HTTP API.

## Service design

Define resource function signatures first, with full return types:

```ballerina
resource function get users() returns UserList|http:NotFound|http:NotImplemented {
    return http:NOT_IMPLEMENTED;
}
```

Use `http:NotImplemented` as a placeholder return type initially, then implement each resource function.

## SAP systems

For an SAP system's OData or HTTP API (S/4HANA, SAP Gateway), use `sap:Client` from `ballerinax/sap` instead of `http:Client`. It fetches the CSRF token, keeps the session cookie the token is bound to, sends the token on writes, and fetches a new one when SAP rejects it, so no hand-written CSRF handling is needed. Point it at the OData service root (e.g. `.../sap/opu/odata/sap/<SERVICE>`): it fetches the token with `HEAD /` relative to that URL.

```ballerina
import ballerinax/sap;

configurable string s4hanaServiceUrl = ?;
configurable string s4hanaUser = ?;
configurable string s4hanaPassword = ?;

final sap:Client s4hanaClient = check new (s4hanaServiceUrl, config = {auth: {username: s4hanaUser, password: s4hanaPassword}});
```

Each `sap:Client` fetches and holds its own token and session, so splitting reads (with `retryConfig`) and writes (without) across two clients is safe.

## Client resilience

For idempotent calls (`GET`, `PUT`, `DELETE`, or a write the API deduplicates by an idempotency key), configure retries on the client — do not hand-write a retry loop with `runtime:sleep`:

```ballerina
http:Client partnerClient = check new (partnerBaseUrl,
    timeout = 30,
    retryConfig = {
        count: 2,                              // RETRIES, not attempts — 2 means 3 calls
        interval: 1,
        backOffFactor: 2.0,
        maxWaitInterval: 20,
        statusCodes: [500, 502, 503, 504]
    }
);
```

- `count` is the number of **retries**, so "max N attempts" is `count: N - 1`. With the settings above, `count: 2` issues 3 requests in total, spaced ~1 s then ~2 s.
- `statusCodes` is an explicit list, not a range. `[500, 502, 503, 504]` is *not* "all 5xx" — 501, 505, 507 and 511 fall through unretried. List every code you mean.
- Exhausting retries keeps the two failure kinds distinguishable: a listed status code comes back as an **`http:Response` carrying its real status**; a transport failure (DNS, refused, timeout) comes back as an **`http:ClientError`**. So there is never a reason to invent a status code for a call that never reached the server — record "no response" as its own outcome.
- This is not only for `http:Client`. A `ballerinax/*` connector that speaks HTTP underneath usually carries `retryConfig` on its own `ConnectionConfig` — configure it there instead of wrapping the connector in a loop. Database and messaging clients (`postgresql`, `mysql`, `mongodb`, `redis`, `kafka`, `rabbitmq`, …) have no such field; check the connector's config record before assuming either way.
- `retryConfig` resends on the listed status codes **and on every transport error — no response at all, a timeout included — whatever the method**; `statusCodes` does not limit those retries. A `POST` or `PATCH` that timed out may already have been applied, so resending it can apply it twice. For such a call, either send an idempotency key the API honours (the retry resends the same headers), or call it through a client without `retryConfig` and retry by hand only on responses that show the request was not applied (typically `503`). A timeout on that call is an unknown outcome: report it, don't resend it.
- Writing the loop yourself is legitimate for that case, and when the retry decision is something `retryConfig` cannot see — an error carried in the response *body*, a whole unit of work, added jitter — or when the client exposes no retry configuration at all. Wanting to preserve the status code is **not** a reason: exhaustion already returns it.
- The built-in retry does not log individual attempts, so per-attempt correlation logging is the other legitimate reason to hand-roll.
