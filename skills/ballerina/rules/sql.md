# SQL Rules

Read when the code talks to a relational database.

Most SQL mistakes in Ballerina compile cleanly and fail when the statement runs, so `bal build`
will not tell you about any of the rules below.

## Driver import

The client alone is not enough — the JDBC driver arrives as a side-effect import that looks
unused and must stay:

```ballerina
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;
```

Same for `mysql`, `mssql`, `oracledb` and `h2`. None of them bundle a driver; without the
import the code compiles and then fails at runtime with *Error while loading database driver*.

The generic `ballerinax/java.jdbc` connector is the exception — there is no `java.jdbc.driver`
package. Add the vendor's JDBC JAR as a platform dependency in `Ballerina.toml` instead.

## Parameter binding

Bind the native Ballerina type. Passing a string where the column is a temporal or JSON type
compiles and then fails with SQL state `42804`:

| Column type | Bind this |
| ----------- | --------- |
| `timestamptz` / `timestamp` | `time:Utc` or `time:Civil` |
| PostgreSQL `jsonb` | `new postgresql:JsonBinaryValue(value.toJsonString())` |
| PostgreSQL `json` | `new postgresql:JsonValue(value.toJsonString())` |

Pass JSON text: `toJsonString()` for a `json` value; a `string` that already holds JSON text goes in as is
(`toJsonString()` would quote it again). As of postgresql 1.19 a `json` value is sent with `toString()`, which doesn't
escape quotes, backslashes or newlines, so the insert fails (library#9836).

An explicit SQL cast (`${text}::jsonb`, `${text}::timestamptz`) also works, but the typed
value does not depend on getting the cast syntax right.

## Queries

Use a backtick template so values are bound as parameters. Never concatenate a value into the
query string — that is both an injection risk and a type-binding one:

```ballerina
sql:ParameterizedQuery q = `SELECT id, name FROM users WHERE id = ${userId}`;
```

`queryRow()` raises `sql:NoRowsError` when nothing matches. That is an ordinary outcome for a
lookup, not a failure — handle it in the union rather than letting it propagate:

```ballerina
User|sql:Error result = dbClient->queryRow(`SELECT ... WHERE id = ${id}`);
if result is sql:NoRowsError {
    // no such user — usually a normal branch
}
```

## Result mapping

Matching columns to record fields is **case-insensitive**, so a `receivedat` column fills a
`receivedAt` field. The two mismatch directions do not behave alike:

- a record field with **no matching column** raises no error: an `int` reads `0` and a `boolean`
  `false`, so it can look like real data, and a `string` or `decimal` field holds `()` even when its
  type isn't nilable, so `== ""` is false and a string method on it panics (as of sql 1.19,
  library#9835). Select a column for every field you read, or declare the field optional
  (`string email?;`) or nilable (`string? email;`);
- a column with **no matching record field** raises `sql:FieldMismatchError`.

## Schema identifiers

PostgreSQL folds unquoted identifiers to lowercase, so `CREATE TABLE t (receivedAt ...)`
creates `receivedat`. Pick one convention for the whole schema — if the DDL quotes camelCase
names, every query must quote them too.

## Generated keys

`sql:ExecutionResult.lastInsertId` covers `SERIAL` / `IDENTITY` columns. When you need other
generated columns in the same round trip, use `RETURNING` with `queryRow`.

For diagnosing a failure that has already happened — connection errors, the `sql:Error`
hierarchy, transactions — see [../troubleshooting/sql.md](../troubleshooting/sql.md).
