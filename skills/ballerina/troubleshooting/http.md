# HTTP Issues

**Contents:** Trace logs — the first thing to enable · Access logs — for production-safe summaries · HTTP client errors · HTTP listener / service errors · Client configuration reference

`ballerina/http` is the most common source of runtime failures. The diagnostic tools here apply whether the program is acting as a client, a service, or both.

## Trace logs — the first thing to enable

HTTP trace logs capture full requests and responses (headers, body, timing). They're indispensable when an HTTP call isn't behaving as expected:

```bash
# Single file
bal run my_program.bal -- -Cballerina.http.traceLogConsole=true

# Package project (from the package root)
bal run -- -Cballerina.http.traceLogConsole=true
```

Output looks like:

```text
[2024-03-15 10:30:01,234] TRACE {http.tracelog.downstream} - [id: 0x04eed4c9] REGISTERED
[2024-03-15 10:30:01,240] TRACE {http.tracelog.downstream} - [id: 0x04eed4c9, host:/127.0.0.1:9090 - remote:/127.0.0.1:54362] INBOUND: DefaultHttpRequest
  GET /api/users HTTP/1.1
  Host: localhost:9090
[2024-03-15 10:30:01,242] TRACE {http.tracelog.downstream} - [id: 0x04eed4c9] OUTBOUND: DefaultHttpResponse
  HTTP/1.1 200 OK
  Content-Type: application/json
```

Two trace channels to watch:

| Channel                    | Direction                                              |
| -------------------------- | ------------------------------------------------------ |
| `http.tracelog.downstream` | External caller ↔ Ballerina **listener** (your service)|
| `http.tracelog.upstream`   | Ballerina **client** ↔ upstream backend                |

If you see `downstream` but no `upstream`, the request reached your service but no outbound call was made. If neither appears, the listener probably isn't starting.

## Access logs — for production-safe summaries

Access logs are lightweight (method, path, status, timing) and safe to leave on:

```toml
# Config.toml
[ballerina.http.accessLogConfig]
console = true
path = "access.log"   # optional; logs to console only if omitted
```

Sample output:

```text
192.168.1.10 - - [15/Mar/2024:10:30:01 +0000] "GET /api/users HTTP/1.1" 200 1234
10.0.0.5     - - [15/Mar/2024:10:30:05 +0000] "GET /api/users/999 HTTP/1.1" 404 89
```

Use access logs for production traffic patterns (error-rate spikes, slow endpoints). Use trace logs only for narrow debugging — they capture full bodies and `Authorization` headers and aren't appropriate for production.

## HTTP client errors

Outbound HTTP calls produce errors under `http:ClientError`:

```text
http:ClientError
├── http:ApplicationResponseError       (any 4xx or 5xx response)
│   ├── http:ClientRequestError         (4xx)
│   └── http:RemoteServerError          (5xx)
├── http:ResiliencyError
│   ├── http:IdleTimeoutError
│   ├── http:AllRetryAttemptsFailed
│   ├── http:FailoverAllEndpointsFailedError
│   ├── http:UpstreamServiceUnavailableError
│   └── http:AllLoadBalanceEndpointsFailedError
├── http:GenericClientError
│   ├── http:MaximumWaitTimeExceededError  (connection pool exhausted)
│   └── http:UnsupportedActionError
├── http:Http2ClientError
├── http:SslError
├── http:ClientConnectorError
├── http:OutboundRequestError
├── http:InboundResponseError
├── http:NoContentError
├── http:PayloadBindingError
├── http:HeaderBindingError
└── http:StatusCodeResponseBindingError
```

### Important: when do 4xx/5xx become errors?

A common surprise: 4xx/5xx are **not** automatically errors when the target type is `http:Response`. They only convert to errors when the response is bound to a specific data type.

```ballerina
// Pattern 1 — raw response; 4xx/5xx are NOT errors
http:Response response = check httpClient->get("/users/1");
// You must inspect response.statusCode yourself

// Pattern 2 — typed binding; 4xx/5xx ARE errors
User|error result = httpClient->get("/users/1");
// `check` converts non-2xx into http:ClientRequestError / http:RemoteServerError
```

To read the response details from a typed-binding error:

```ballerina
User|http:ClientRequestError|http:RemoteServerError result = httpClient->get("/users/1");
if result is http:ClientRequestError {
    int status = result.detail().statusCode;         // e.g. 404
    anydata body = result.detail().body;             // response body
    map<string[]> headers = result.detail().headers; // response headers
}
```

> Error types and binding behavior can shift slightly across Swan Lake updates. Confirm against the version in use.

### Common client error patterns

| Error / symptom                    | Likely cause                                              | How to diagnose                                                | Fix                                                              |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Connection refused: host:port`    | Target service not running, or wrong port                 | Hit the URL with `curl`                                        | Correct the URL in the `http:Client` init                        |
| `Connection timed out`             | Slow upstream, firewall dropping packets, network latency | Try `curl --max-time 5`; enable trace logs                     | Raise `timeout` in `http:ClientConfiguration`                    |
| `idle connection timed out`        | Connection idle longer than the server's keep-alive       | Trace logs reveal whether the same connection is reused        | Reduce `maxIdleConnections`, or set keep-alive shorter           |
| `SSL/TLS handshake failure`        | Cert mismatch, expired cert, missing CA in trust store    | `openssl s_client -connect host:port`                          | Configure `secureSocket`, or trust the CA in the JRE truststore  |
| `All retry attempts failed`        | Every retry attempt failed too                            | Inspect logs for the per-attempt cause                         | Fix the upstream, or adjust the retry policy                     |
| `Maximum wait time exceeded`       | HTTP connection pool exhausted; requests queue            | Enable DEBUG; watch for pool-exhaustion messages               | Raise `maxActiveConnections` in `poolConfig`                     |

## HTTP listener / service errors

When Ballerina is the server, errors live under `http:ListenerError`:

```text
http:ListenerError
├── http:GenericListenerError
├── http:InterceptorReturnError
├── http:ListenerAuthError
│   ├── http:ListenerAuthnError              (401)
│   └── http:ListenerAuthzError              (403)
├── http:InboundRequestError
│   ├── http:InitializingInboundRequestError
│   ├── http:ReadingInboundRequestHeadersError
│   └── http:ReadingInboundRequestBodyError
├── http:OutboundResponseError
│   ├── http:InitializingOutboundResponseError
│   ├── http:WritingOutboundResponseHeadersError
│   ├── http:WritingOutboundResponseBodyError
│   ├── http:Initiating100ContinueResponseError
│   ├── http:Writing100ContinueResponseError
│   └── http:InvalidCookieError
└── http:RequestDispatchingError
    ├── http:ServiceDispatchingError
    │   ├── http:ServiceNotFoundError            (404)
    │   └── http:BadMatrixParamError             (400)
    └── http:ResourceDispatchingError
        ├── http:ResourceNotFoundError           (404)
        ├── http:ResourceMethodNotAllowedError   (405)
        ├── http:UnsupportedRequestMediaTypeError (415)
        ├── http:RequestNotAcceptableError       (406)
        └── http:ResourceDispatchingServerError  (500)
```

Plus the listener-side binding errors that surface as `400 Bad Request`:

- `http:QueryParameterBindingError` / `http:QueryParameterValidationError`
- `http:PathParameterBindingError`
- `http:PayloadBindingError` / `http:PayloadValidationError`
- `http:HeaderBindingError` / `http:HeaderValidationError`
- `http:MediaTypeBindingError`

### Common service issues

| Symptom                                       | Likely cause                                          | Diagnose                                                  | Fix                                                          |
| --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Port already in use / listener fails to start | Another process bound to the port                     | `lsof -i :<port>` or `netstat -an \| grep <port>`         | Pick a different port or stop the conflicting process        |
| Listener up but no requests received          | Bound to `localhost` while called from another host   | Inspect `host` in the listener config                     | Bind to `"0.0.0.0"` for external access                      |
| `401 Unauthorized`                            | Auth handler set, request lacks credentials           | Trace logs show whether the auth header arrived           | Verify `auth` configuration                                  |
| `500 Internal Server Error`                   | Unhandled error or panic in a resource function       | Check stderr for the stack trace                          | Fix the error in the resource handler                        |
| Browser CORS error                            | CORS not configured or misconfigured                  | Check response headers in the trace log                   | Configure `http:CorsConfig` on the service                   |
| Request body silently empty                   | Body not consumed before responding                   | —                                                          | Call `request.getJsonPayload()` (or `getTextPayload`, etc.)   |

A `500` from a Ballerina service almost always means a panic or unhandled error inside a resource function. Look in **stderr** for a stack trace with frames like `at myorg/…` and read [runtime.md](runtime.md) for the panic-handling rules.

## Client configuration reference

The fields you'll most often adjust:

```ballerina
http:Client cl = check new ("http://api.example.com", {
    timeout: 30,                       // request timeout (seconds; default 30)
    followRedirects: {
        enabled: true,
        maxCount: 5
    },
    retryConfig: {
        count: 3,
        interval: 0.5,                 // seconds between retries
        backOffFactor: 2.0,
        maxWaitInterval: 20.0
    },
    poolConfig: {
        maxActiveConnections: 100,     // -1 means unlimited
        maxIdleConnections: 100,
        waitTime: 30                   // seconds to wait for a free conn
    },
    secureSocket: {
        cert: "/path/to/cert.pem",
        key: { certFile: "...", keyFile: "..." }
    }
});
```

See [auth.md](auth.md) for `secureSocket` and OAuth2/JWT details. See [performance.md](performance.md) for connection pool tuning.
