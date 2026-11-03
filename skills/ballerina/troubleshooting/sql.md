# SQL / Database Issues

**Contents:** Connection failures · Parameter binding — compiles clean, fails at execution · Query and result errors · Transactions

## Connection failures

The most common SQL problem is failing to connect:

```text
error: {ballerina/sql}DatabaseError Communications link failure: ...
```

Walk this checklist in order:

1. **Confirm credentials and endpoint** — host, port, user, password, database name.
2. **Verify network reachability** from the host running Ballerina: `telnet <host> <port>` or `nc -zv <host> <port>`.
3. **Confirm the JDBC driver is imported.** This is the single most common cause of cryptic connection failures. The driver package must appear as an empty import, otherwise the client cannot initialize:

   ```ballerina
   import ballerinax/mysql.driver as _;        // MySQL
   import ballerinax/mssql.driver as _;        // SQL Server
   import ballerinax/postgresql.driver as _;   // PostgreSQL
   ```

   The code compiles without it — the failure only appears at runtime. Expect either
   `No suitable driver found for jdbc:...` or, on recent connectors (verified on
   `postgresql` 1.19.0):

   ```text
   error: Error while loading database driver. This may be because the database driver path
   is not configured correctly in the `Ballerina.toml` file or provided database driver
   version is not supported by the connector
   ```

   Confirmed on `postgresql` 1.19.0. Expect the same for the other vendor connectors: a
   matching `.driver` package is published for `mysql`, `mssql`, `oracledb` and `h2`, which
   would serve no purpose if the client carried its own.

   `ballerinax/java.jdbc` is different — no `java.jdbc.driver` package exists. If the client
   is the generic JDBC one, the missing piece is a platform dependency in `Ballerina.toml`
   (the vendor's JDBC JAR), not an import.
4. **Check whether the connection pool is exhausted.** See [performance.md](performance.md) for pool tuning.

### Typical client initialization

```ballerina
mysql:Client dbClient = check new (
    host = "localhost",
    port = 3306,
    user = "root",
    password = "password",
    database = "mydb",
    connectionPool = {
        maxOpenConnections: 15,        // default: 15
        maxConnectionLifeTime: 1800.0, // seconds; default: 1800 (30 min)
        minIdleConnections: 5          // default: matches maxOpenConnections
    }
);
```

## Parameter binding — compiles clean, fails at execution

Binding the wrong Ballerina type into a column is not a compile error. It surfaces only
when the statement runs, so `bal build` passing proves nothing here.

```text
ERROR: column "receivedAt" is of type timestamp with time zone
       but expression is of type character varying          (SQL state 42804)
```

Verified against PostgreSQL 16 with `ballerinax/postgresql` 1.19.0:

| Column type       | Bind this                                | Not this                                        |
| ----------------- | ---------------------------------------- | ----------------------------------------------- |
| `timestamptz` / `timestamp` | `time:Utc` or `time:Civil` — both work directly | a `string` (e.g. `time:utcToString(...)`) → 42804 |
| PostgreSQL `jsonb` | `postgresql:JsonBinaryValue`            | a bare `string` parameter → 42804               |
| PostgreSQL `json`  | `postgresql:JsonValue`                  | a bare `string` parameter → 42804               |

```ballerina
time:Utc receivedAt = time:utcNow();
postgresql:JsonBinaryValue payloadValue = new (rawPayload);   // rawPayload is json|string
_ = check dbClient->execute(`
    INSERT INTO events ("tradeId", payload, "receivedAt")
    VALUES (${tradeId}, ${payloadValue}, ${receivedAt})
`);
```

An explicit SQL cast works too — `${text}::jsonb`, `CAST(${text} AS JSONB)`, and likewise
`${text}::timestamptz` for a temporal. Those are not wrong. But binding the native type is
the intended path: it does not depend on getting the cast syntax right, and it keeps the
column type out of the query text where a schema change can silently invalidate it.

### Identifier casing

PostgreSQL folds unquoted identifiers to **lowercase**. `CREATE TABLE t (receivedAt ...)`
creates a column literally named `receivedat`; `"receivedAt"` preserves the case. Mixing the
two conventions fails in the **query**, and the quoting in the message tells you which side
is wrong:

```text
quoted DDL + unquoted query  ->  ERROR: column "receivedat" does not exist
unquoted DDL + quoted query  ->  ERROR: column "receivedAt" does not exist
```

Pick one convention for the whole schema, and if the DDL quotes camelCase names then every
query must quote them too.

**Result-set mapping is a separate question, and it is more forgiving than the query.**
Matching column names to record fields is **case-insensitive**, so a `receivedat` column
maps into a `receivedAt` field without complaint — casing alone never breaks the mapping.

The two directions of mismatch behave differently, and only one of them tells you:

| Mismatch | Result |
| -------- | ------ |
| Record field with **no matching column** | **Silent.** The field is left at its zero value — no error |
| Column with **no matching record field** | `sql:FieldMismatchError` — *No mapping field found for SQL table column …* |

Verified on `postgresql` 1.19.0 with a closed record and non-nilable fields:

```ballerina
type MissingRec record {| int id; string tradeId; string nosuchColumn; |};
// SELECT id, tradeid FROM m   ->  {"id":1, "tradeId":"x", "nosuchColumn":null}
```

"Zero value" is type-dependent — a `string` field comes back `null`, an `int` field comes
back `0` — so a mistyped field name can look like real data rather than a gap. Open and
closed records behave the same way here. When a field is unexpectedly empty, check its name
against the projection.

### Generated keys

`sql:ExecutionResult.lastInsertId` works for PostgreSQL `SERIAL` / `IDENTITY` columns. When
you need other generated columns in the same round trip, use `RETURNING` with `queryRow`:

```ballerina
int newId = check dbClient->queryRow(`
    INSERT INTO orders (customer_id) VALUES (${customerId}) RETURNING id
`);
```

## Query and result errors

`sql:Error` hierarchy:

```text
sql:Error
├── sql:DatabaseError         (has errorCode and sqlState fields)
├── sql:NoRowsError           (queryRow() returned no row)
├── sql:BatchExecuteError     (one or more batch commands failed; has executionResults)
└── sql:ApplicationError
    └── sql:DataError         (problem with parameters or result mapping)
        ├── sql:TypeMismatchError
        ├── sql:ConversionError
        ├── sql:FieldMismatchError
        └── sql:UnsupportedTypeError
```

To branch on the failure kind:

```ballerina
User|sql:Error result = dbClient->queryRow(`SELECT * FROM users WHERE id = ${userId}`);
if result is sql:NoRowsError {
    // No row matched — usually a normal flow, not an error
} else if result is sql:DatabaseError {
    string sqlState = result.detail().sqlState ?: "";
    int errorCode = result.detail().errorCode ?: 0;
    // map sqlState / errorCode to your domain error
}
```

### Common patterns

| Error                          | SQL state | Cause                                    | Fix                                                                  |
| ------------------------------ | --------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `{ballerina/sql}NoRowsError`   | —         | `queryRow()` matched zero rows           | Handle as a valid case in the union                                  |
| `Duplicate entry`              | `23000`   | Unique constraint violation on insert    | Check for duplicates first, or use `INSERT ... ON DUPLICATE KEY UPDATE` |
| `Table doesn't exist`          | `42S02`   | Wrong table name or migrations not run   | Verify the schema; run pending migrations                            |
| `Access denied`                | `28000`   | Wrong DB credentials                     | Verify user/password and grants                                      |
| `Communications link failure`  | —         | Network issue, DB down, firewall blocked | Test reachability with `telnet`/`nc`                                 |
| `is of type X but expression is of type Y` | `42804` | A temporal or JSON value was bound as `string` | Bind the native type — see [Parameter binding](#parameter-binding--compiles-clean-fails-at-execution) |
| `column "..." does not exist` | `42703` | Unquoted identifier folded to lowercase | Match the DDL's quoting convention                                   |
| Pool exhausted                 | —         | All pool slots occupied                  | Increase `maxOpenConnections` or hunt for leaks (missing `close()`)  |
| `No suitable driver found` / `Error while loading database driver` | — | Driver package not imported | Add `import ballerinax/<vendor>.driver as _;` |

## Transactions

```ballerina
transaction {
    check dbClient->execute(`INSERT INTO orders VALUES (${id}, ${amount})`);
    check dbClient->execute(`UPDATE inventory SET stock = stock - 1 WHERE id = ${itemId}`);
    check commit;
} on fail var e {
    // Automatic rollback already happened; log e here
}
```

Things that bite in transactions:

- **Transaction never committed** — the function returned or raised before reaching `check commit`. Re-read the control flow.
- **Implicit rollback** — any error inside the `transaction` block triggers rollback. Inspect the `on fail` clause to see what actually failed.
- **Distributed transactions** — Ballerina's `transaction` is single-datasource by default. Spanning multiple databases requires explicit coordination (e.g., 2PC or saga patterns implemented in application code).
