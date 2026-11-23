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

A `post` resource that returns a plain value (`string`, `json`, a record), or answers through `http:Caller` with one, responds `201 Created`; one that returns nothing responds `202 Accepted`. When callers expect `200` (the endpoint replaces an existing one, or creates nothing), return `http:Ok` (set its `mediaType` when the content type matters) or an `http:Response`.

## XML bodies

- Read an XML body, of a request or a client response, with `getXmlPayload()`: it works whatever the content type and handles a leading byte order mark (BOM). `@http:Payload xml` and an `xml` client target type bind only an XML content type (a `text/plain` sender gets `400`), and an XML body doesn't bind to a record (as of http 2.18, library#9527).
- For a record, parse the bytes: `xmldata:parseBytes(check request.getBinaryPayload())`. It doesn't check the root element's name; check it yourself when it matters.
- Don't decode the body as text and call `xml:fromString`: as of 2201.14 a leading BOM then becomes a stray text item, or an error when an XML declaration follows (lang#44899).
- A document with an XML declaration is a sequence (processing instruction, then the element), so `doc is xml:Element` is false. Navigate it (`doc/<Child>`), or take the root element with `doc.elements()`.

## Product APIs

Before writing an `http:Client` for a product's API, look for its connector (SKILL.md Step 2) and use it when there is one: it already handles the product's auth and protocol details. For SAP, see [sap.md](sap.md).

## Client protocol

`http:Client` defaults to HTTP/2, so on an `http://` URL its first request carries an `Upgrade: h2c` header, which some proxies and gateways reject (e.g. with `501`). For an `http://` endpoint, set `httpVersion = http:HTTP_1_1` on `http:Client`, and on a connector's config when it has `httpVersion` (`bal discover type <ConfigType> -p <org>/<package>` shows the field and its default; `sap:Client` defaults to HTTP/2 as of sap 1.4.0, library#9768). `https://` needs nothing: the version is negotiated in the TLS handshake.

## Client resilience

For idempotent calls (`GET`, `PUT`, `DELETE`, or a write the API deduplicates by an idempotency key), configure retries on the client — do not hand-write a retry loop with `runtime:sleep`:

`bal discover type RetryConfig -p ballerina/http --output-format text` shows the fields. What they do is easy to get wrong:

- `count` is the number of **retries**, so "max N attempts" is `count: N - 1`. For example, `count: 2` issues 3 requests in total.
- `statusCodes` is an explicit list, not a range. `[500, 502, 503, 504]` is *not* "all 5xx" — 501, 505, 507 and 511 fall through unretried. List every code you mean.
- Exhausting retries keeps the two failure kinds distinguishable: a listed status code comes back as an **`http:Response` carrying its real status**; a transport failure (DNS, refused, timeout) comes back as an **`http:ClientError`**. So there is never a reason to invent a status code for a call that never reached the server — record "no response" as its own outcome.
- This is not only for `http:Client`. A `ballerinax/*` connector that speaks HTTP underneath usually carries `retryConfig` on its own `ConnectionConfig` — configure it there instead of wrapping the connector in a loop. Database and messaging clients (`postgresql`, `mysql`, `mongodb`, `redis`, `kafka`, `rabbitmq`, …) have no such field; check the connector's config record before assuming either way.
- `retryConfig` resends on the listed status codes **and on every transport error — no response at all, a timeout included — whatever the method**; `statusCodes` does not limit those retries. A `POST` or `PATCH` that timed out may already have been applied, so resending it can apply it twice. For such a call, either send an idempotency key if the API documents one (there is no standard header; the retry resends the same headers), or call it through a client without `retryConfig` and retry by hand only on responses the API documents as not applied. A timeout on that call is an unknown outcome: report it, don't resend it.
- Writing the loop yourself is legitimate for that case, and when the retry decision is something `retryConfig` cannot see — an error carried in the response *body*, a whole unit of work, added jitter — or when the client exposes no retry configuration at all. Wanting to preserve the status code is **not** a reason: exhaustion already returns it.
- The built-in retry does not log individual attempts, so per-attempt correlation logging is the other legitimate reason to hand-roll.
