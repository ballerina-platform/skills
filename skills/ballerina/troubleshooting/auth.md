# Security and Authentication

**Contents:** TLS / SSL · OAuth2 / JWT / token issues

Covers TLS/SSL, OAuth2, and JWT in Ballerina HTTP services and clients.

## TLS / SSL

### Common TLS errors

| Error / symptom                                                | Likely cause                                                       | Fix                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PKIX path building failed`                                    | Server cert not trusted by the JVM truststore                      | Either import the CA into the Ballerina JRE truststore (see [packages.md](packages.md) on proxy/cert handling) or set `secureSocket` on the client               |
| `SSL/TLS handshake failure`                                    | Cert mismatch, expired cert, or protocol/cipher mismatch           | Inspect with `openssl s_client -connect host:port`; verify TLS version compatibility on both sides                                                               |
| `unable to find valid certification path to requested target`  | Self-signed cert, or intermediate CA missing from the chain        | Add the full certificate chain to the truststore or to `secureSocket.cert`                                                                                       |
| Client cert rejected by server (mTLS)                          | Client cert not configured, or its CA not trusted by the server    | Set `secureSocket.key` on the client; make sure the server's truststore contains the client CA                                                                   |

### Configuring TLS on a client

```ballerina
// One-way TLS — client verifies the server
http:Client secureClient = check new ("https://api.example.com", {
    secureSocket: {
        cert: "/path/to/server-cert.pem"   // truststore: the server's CA
    }
});

// Mutual TLS (mTLS) — both sides verify
http:Client mtlsClient = check new ("https://api.example.com", {
    secureSocket: {
        cert: "/path/to/server-cert.pem",        // trust the server
        key: {
            certFile: "/path/to/client-cert.pem", // present this client cert
            keyFile:  "/path/to/client-key.pem"   // private key for the client cert
        }
    }
});
```

### Configuring TLS on a listener

```ballerina
listener http:Listener secureListener = new (9443, {
    secureSocket: {
        key: {
            certFile: "/path/to/server-cert.pem",
            keyFile:  "/path/to/server-key.pem"
        },
        // mTLS — require client certs trusted by this truststore
        mutualSsl: {
            cert: "/path/to/client-truststore.pem"
        }
    }
});
```

### Using JKS / PKCS12

```ballerina
http:Client cl = check new ("https://api.example.com", {
    secureSocket: {
        cert: {
            path: "/path/to/truststore.p12",
            password: "truststorePassword"
        },
        key: {
            path: "/path/to/keystore.p12",
            password: "keystorePassword"
        }
    }
});
```

> When debugging TLS, run `openssl s_client -connect host:port -showcerts` to see the chain the server actually presents, then compare against what the client is configured to trust.

## OAuth2 / JWT / token issues

### Common auth errors

| Error / symptom                          | Likely cause                                       | Fix                                                                              |
| ---------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `401 Unauthorized` from upstream         | Token expired or invalid                            | Inspect token expiry; verify the OAuth2 client credentials grant is configured     |
| `403 Forbidden` from upstream            | Token valid but missing required scopes            | Audit `scopes` in the client config                                              |
| JWT validation failure on a service      | Bad signature, expired, wrong issuer/audience      | Verify `issuer`, `audience`, and `signatureConfig` in `http:JwtValidatorConfig`   |
| Token refresh silently failing           | Refresh token expired or revoked                   | Confirm refresh-token validity; re-authenticate                                  |

### OAuth2 client credentials (machine-to-machine)

```ballerina
http:Client apiClient = check new ("https://api.example.com", {
    auth: {
        tokenUrl:     "https://auth.example.com/oauth2/token",
        clientId:     "my-client-id",
        clientSecret: "my-client-secret",
        scopes:       ["read", "write"]
    }
});
```

### JWT auth on a service

```ballerina
listener http:Listener secureListener = new (9090, {
    auth: [
        {
            jwtValidatorConfig: {
                issuer:   "https://auth.example.com",
                audience: "my-api",
                signatureConfig: {
                    jwksConfig: {
                        url: "https://auth.example.com/.well-known/jwks.json"
                    }
                }
            },
            scopes: ["admin"]
        }
    ]
});
```

### Diagnosis steps for auth failures

1. Turn on HTTP trace logs (see [http.md](http.md)) — confirm the `Authorization` header is actually being sent and contains what you expect.
2. Decode the JWT (jwt.io or similar) — verify `exp`, `iss`, `aud`, and `scope` claims.
3. For OAuth2 client credentials, test the token endpoint independently with `curl`:

   ```bash
   curl -X POST https://auth.example.com/oauth2/token \
     -d "grant_type=client_credentials&client_id=ID&client_secret=SECRET&scope=read"
   ```
