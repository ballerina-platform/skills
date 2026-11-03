# Tooling Issues

**Contents:** `bal` CLI · OpenAPI tool · gRPC tool · Test framework · `bal persist` · Formatter

Covers `bal` CLI itself, OpenAPI/gRPC generators, the test framework, `bal persist`, and the formatter.

## `bal` CLI

Check tool and distribution versions:

```bash
bal --version
# Ballerina 2201.x.y  (distribution)
# Update Tool 1.x.x   (tool itself)
```

The tool and the distribution update independently:

```bash
bal update          # updates the bal CLI tool
bal dist update     # pulls a newer Swan Lake patch distribution
```

| Symptom                                    | Cause                                  | Fix                                                                     |
| ------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| `bal: command not found`                   | PATH not configured                    | Add `<ballerina_home>/bin` to PATH and re-source the shell profile      |
| `bal --version` reports the wrong version  | Multiple distributions installed       | `bal dist use <version>` to switch                                      |
| `bal build` is unusually slow              | Resolving deps over the network        | Use `--offline` (see [packages.md](packages.md)) or check Central latency |
| `bal run` exits immediately with no output | Panic during startup                   | Inspect stderr; rerun with debug logging                                |

## OpenAPI tool

Generate a client or service stub from an OpenAPI / Swagger spec:

```bash
bal openapi -i api-spec.yaml --mode client  -o ./generated
bal openapi -i api-spec.yaml --mode service -o ./generated
```

| Error / symptom                                  | Cause                                                                  | Fix                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Generated code doesn't compile                   | Unsupported OpenAPI features — complex `oneOf`/`anyOf`, circular refs   | Use `--nullable`; tidy generated types by hand            |
| Generated client missing request body            | `requestBody` not allowed on that HTTP method                          | Validate the spec is consistent with the method           |
| Path parameter mismatch                          | Variable in the path template doesn't match the parameter name         | Fix the spec for consistency                              |
| Output files are empty                           | Spec couldn't be parsed                                                | Validate the spec with an online validator first          |
| Nullable fields not generated as nullable        | Spec uses `nullable: true` but tool ignored it                         | Pass `--nullable`                                         |

Useful flags:

```bash
bal openapi -i spec.yaml --mode client \
    --nullable \
    --status-code-binding \
    --tags "Pets,Store" \
    --operations "listPets" \
    --client-methods remote \
    -o ./generated
```

Flag reference:

- `--nullable` — generate nullable types for optional fields
- `--status-code-binding` — generate per-status-code return types (e.g. `http:Response200`, `http:Response404`); enables type-safe `UserResponse|http:NotFound` patterns instead of inspecting `response.statusCode` manually
- `--tags` — limit generation to listed tags
- `--operations` — limit generation to listed operation IDs
- `--client-methods` — `remote` (remote-method style) or `resource` (default, resource-method style)

Generating an OpenAPI spec from a Ballerina service:

```bash
bal openapi -i service.bal -o ./generated
bal openapi -i service.bal --json    # JSON output instead of YAML
```

## gRPC tool

```bash
bal grpc --input service.proto --output ./generated --mode client
bal grpc --input service.proto --output ./generated --mode service
bal grpc --input service.proto --output ./generated --mode both
```

| Error                            | Cause                                            | Fix                                                  |
| -------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `proto file not found`           | Wrong path                                       | Use an absolute path, or run from the proto directory |
| Generated stub fails to compile  | Proto uses features not fully supported          | Inspect unsupported field types; file an issue       |
| Server not reachable at runtime  | Wrong host/port in the generated stub            | Verify endpoint in `grpc:ClientConfiguration`        |

## Test framework

```bash
bal test                    # all tests
bal test --tests myTest     # one test function
bal test --code-coverage    # produce coverage
bal test --test-report      # produce HTML report
```

| Symptom                             | Likely cause                                                              | Fix                                                              |
| ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Tests not discovered                | Test file outside `tests/` or missing `@test:Config` annotation           | Move tests into the `tests/` folder                              |
| Tests pass locally, fail in CI      | `Config.toml` not available to the CI runner                              | Provide `BAL_CONFIG_DATA`, `BAL_CONFIG_FILES`, or `BAL_CONFIG_VAR_*` |
| Mock not applied                    | `test:mock()` applied to the wrong target                                 | Ensure the mock is installed before the function under test runs |
| `ResourceUnavailableError` in tests | Port still bound from a previous run                                      | Use `before*` / `after*` to manage lifecycle                     |

### Providing configuration to `bal test` in CI

Configurable values need a `Config.toml` or equivalent. Four approaches:

**1) `tests/Config.toml`** — Ballerina automatically uses this when running tests.

```text
my-package/
├── Ballerina.toml
├── Config.toml          # runtime config (ignored for tests)
├── main.bal
└── tests/
    ├── Config.toml      # test-only config
    └── my_test.bal
```

**2) `BAL_CONFIG_DATA`** — inline TOML:

```bash
export BAL_CONFIG_DATA='[myorg.mypackage]
dbHost = "test-db.example.com"
dbPort = 3306'
bal test
```

**3) `BAL_CONFIG_FILES`** — file paths (colon-separated on Unix):

```bash
export BAL_CONFIG_FILES="/path/to/test-config.toml:/path/to/secrets.toml"
bal test
```

**4) `BAL_CONFIG_VAR_<NAME>`** — per-variable env vars. Names are uppercased. Best for secrets that should be injected one at a time:

```bash
export BAL_CONFIG_VAR_DBHOST="test-db.example.com"
export BAL_CONFIG_VAR_DBPORT=3306
export BAL_CONFIG_VAR_APIKEY="..."
bal test
```

> `BAL_CONFIG_VAR_*` supports `int`, `byte`, `float`, `boolean`, `string`, `decimal`, `enum`, and `xml` — the value must be the `toString()` form of the value. Use it for simple top-level configurables.

GitHub Actions example:

```yaml
- name: Run Ballerina tests
  env:
    BAL_CONFIG_DATA: |
      [myorg.mypackage]
      dbHost = "localhost"
      dbPort = 3306
    BAL_CONFIG_VAR_APIKEY: ${{ secrets.TEST_API_KEY }}
  run: bal test --code-coverage
```

## `bal persist`

Generates type-safe database clients from entity definitions.

```bash
bal persist init                 # initialize persist config in the project
bal persist generate             # generate client code from entity definitions
bal persist pull --datastore mysql --host localhost --port 3306 --user root --database mydb
                                 # reverse-engineer entities from an existing DB
bal persist migrate              # run database migrations (experimental)
```

Plugin diagnostics you may hit:

| Error                                             | Cause                                                     | Fix                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `entity must have at least one key field`         | Entity record missing a `readonly` key field              | Add a `readonly` field, e.g. `readonly int id;`                                                                                |
| `unsupported field type`                          | Field type not supported by the persist model             | Use supported types: `int`, `string`, `float`, `decimal`, `boolean`, `time:Date`, `time:TimeOfDay`, `time:Civil`, `time:Utc`   |
| `entity relation error`                           | Wrong relation declaration                                | Verify referenced entities exist and cardinality annotations are correct                                                       |
| Generated code stops compiling after a schema edit | Stale generated client                                    | Re-run `bal persist generate` after every entity change                                                                        |

Entity definition shape:

```ballerina
// persist/model.bal
import ballerina/persist as _;
import ballerina/time;

type Employee record {|
    readonly int id;            // readonly fields become primary keys
    string name;
    decimal salary;
    time:Date joinDate;
    Department department;      // relation to another entity
|};

type Department record {|
    readonly int id;
    string name;
    Employee[] employees;       // one-to-many relation
|};
```

Supported datastores:

| Datastore     | Config value    | Notes                                                |
| ------------- | --------------- | ---------------------------------------------------- |
| MySQL         | `mysql`         | Requires `ballerinax/mysql` plus driver import       |
| PostgreSQL    | `postgresql`    | Requires `ballerinax/postgresql` plus driver import  |
| MSSQL         | `mssql`         | Requires `ballerinax/mssql` plus driver import       |
| Google Sheets | `googlesheets`  | Requires `ballerinax/googleapis.sheets`              |
| In-memory     | `inmemory`      | Default; for testing only                            |
| Redis         | `redis`         | Requires `ballerinax/redis`                          |

Migration notes:

- `bal persist migrate` is **experimental**. In production prefer hand-written migrations or a dedicated tool.
- Failed migrations leave SQL in `persist/migrations/` — apply it manually if needed.
- Destructive changes (drop column, change type) are not auto-generated; write them yourself.

## Formatter

```bash
bal format               # format the entire package
bal format main.bal      # format a single file
bal format --dry-run     # preview without writing
```

| Symptom                                        | Likely cause                                              | Fix                                                                |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| `bal format` produces no output and no changes | Code already formatted, or the path is wrong              | Run from the package root or pass an explicit file                 |
| Formatter crashes with a stack trace           | Formatter bug triggered by specific syntax                | Capture a minimal repro and the stack trace; file a tool bug       |
| Output differs across versions                 | Formatting rules changed between Ballerina distributions  | Pin the distribution across the team via `bal dist use`            |
| CI formatting check fails but local passes     | Different Ballerina version in CI vs local                | Match the distribution version in CI                               |

> In CI, use `bal format --dry-run` to enforce formatting without rewriting files — a non-zero exit means there's drift.
