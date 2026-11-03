# SAP Rules

Read when calling an SAP system's OData or HTTP API (S/4HANA, SAP Gateway). The HTTP rules in
[http.md](http.md) apply as well.

For an SAP system's OData or HTTP API (S/4HANA, SAP Gateway), use `sap:Client` from `ballerinax/sap` instead of `http:Client`. It fetches the CSRF token, keeps the session cookie the token is bound to, sends the token on writes, and fetches a new one when SAP rejects it, so no hand-written CSRF handling is needed. Point it at the OData service root (e.g. `.../sap/opu/odata/sap/<SERVICE>`): it fetches the token with `HEAD /` relative to that URL.

```ballerina
import ballerinax/sap;

configurable string s4hanaServiceUrl = ?;
configurable string s4hanaUser = ?;
configurable string s4hanaPassword = ?;

final sap:Client s4hanaClient = check new (s4hanaServiceUrl, config = {auth: {username: s4hanaUser, password: s4hanaPassword}});
```

Each `sap:Client` fetches and holds its own token and session, so splitting reads (with `retryConfig`) and writes (without) across two clients is safe.
