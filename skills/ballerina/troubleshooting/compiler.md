# Compiler and Language Issues

Compilation problems appear before the program starts and are deterministic — the same input always produces the same diagnostic.

## Reading a compiler error

`bal build` prints diagnostics in this form:

```text
ERROR [<file>.bal:(<startLine>:<startCol>,<endLine>:<endCol>)] <message>
```

Process them in order:

1. **Read the message literally.** It is precise and usually identifies the wrong token.
2. **Use the column range.** It marks the exact span of the offending tokens.
3. **Fix the first error and recompile.** Most cascades originate from a single earlier mistake — don't try to fix everything in one pass.

## Common compile-time errors

| Message pattern                                            | Likely cause                                                       | What to do                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `incompatible types: expected 'X', found 'Y'`              | Type mismatch on assignment or return                              | Check the declared type vs. the value's type at that line        |
| `undefined symbol 'X'`                                     | Missing import or identifier typo                                  | Add the right `import` or correct the spelling                   |
| `missing semicolon token`                                  | Syntax — usually an unclosed bracket/paren/string on a prior line  | Look upward, not at the reported line                            |
| `variable 'X' is not initialized`                          | Read before assignment                                             | Initialize at declaration or change the type to nilable (`X?`)   |
| `cannot use type 'X' as a 'readonly'`                      | Mutable value where the API expects immutable                      | Call `.cloneReadOnly()` or declare the value as `readonly`       |
| `invalid access of mutable storage in 'isolated' function` | Concurrency isolation violation inside an `isolated` function      | Wrap the access in `lock { ... }` or remove the shared mutability |
| `invalid token 'X'` then `missing identifier` (later `$missingNode$`) | `X` is a keyword used as a field or variable name                 | Quote it: `'X` (a JSON key `X` still binds)                      |
| `invalid record constructor: duplicate key 'X'`            | A spread already supplies field `X`, then `X` is given again       | Leave `X` out of the spread: `let T {X: _, ...rest} = r in {...rest, X: v}`; or `clone()` the record and assign `X` |

> Ballerina's `isolated` qualifier enforces concurrency safety at compile time. `lock { ... }` gives exclusive access to shared mutable state — comparable to a Java `synchronized` block.

## Compiler crashes

The crash banner looks like this:

```text
ballerina: Oh no, something really went wrong. Bad. Sad.

We appreciate it if you can report the code that broke Ballerina in
https://github.com/ballerina-platform/ballerina-lang/issues with the
log you get below and your sample code.
```

…followed by a Java stack trace.

A crash means a bug in the compiler or one of its plugins — not in your code. You cannot fix it by editing your `.bal` files, but you can often **work around it** by restructuring the code that triggers the crash path.

To narrow down where to report, look at the top frames of the stack trace:

| Top-frame package prefix                                  | Component                                              | Tracker                                                   |
| --------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `io.ballerina.stdlib.<name>` or `io.ballerina.lib.<name>` | A library's compiler plugin (e.g. `http`, `sql`)       | The matching library repo under `ballerina-platform`      |
| `org.wso2.ballerinalang.<…>`                              | Core compiler                                          | `ballerina-platform/ballerina-lang`                       |
| `io.ballerina.compiler.<…>`                               | Compiler API                                           | `ballerina-platform/ballerina-lang`                       |

Always capture a minimal reproducible example and the full stack trace before filing.

## Compiler plugin diagnostics

Compiler plugins ship with most standard libraries and emit their own diagnostics. They look identical to core compiler errors but are usually more domain-specific:

```text
ERROR [service.bal:(5:1,5:1)] remote methods are not allowed in HTTP service
```

Plugins enforcing common rules:

| Library             | What its compiler plugin checks                                            |
| ------------------- | -------------------------------------------------------------------------- |
| `ballerina/http`    | Service and resource method signatures, payload binding shapes             |
| `ballerina/graphql` | Schema definitions, resolver signatures, union/interface usage             |
| `ballerina/sql`     | SQL query syntax (on supported versions)                                   |
| `ballerina/persist` | Entity definitions and relations                                           |
| `ballerinax/kafka`  | Listener configurations and consumer signatures                            |

The fix is in your code — the diagnostic message tells you what the plugin rejected.

## Java exceptions during compilation

Compilation may also fail with a raw Java exception rather than a Ballerina diagnostic. Common forms:

```text
error: compilation failed
java.lang.ClassCastException: class org.wso2.ballerinalang.compiler.tree.BLangFunction
    cannot be cast to class org.wso2.ballerinalang.compiler.tree.BLangService
    at io.ballerina.stdlib.http.compiler.HttpServiceValidator.validate(...)
```

```text
error: compilation failed
java.lang.NoClassDefFoundError: io/ballerina/stdlib/http/compiler/Constants
    at io.ballerina.stdlib.http.compiler.HttpServiceContractResourceValidator.<init>(...)
```

Interpret by exception class:

| Exception                                         | Typical cause                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ClassCastException`                              | A compiler or plugin bug — an AST node was cast to the wrong type                       |
| `ClassNotFoundException` / `NoClassDefFoundError` | A library class disappeared or moved between versions — likely a dependency mismatch    |
| `NoSuchMethodError`                               | Similar — a method signature changed between library versions                           |
| `NullPointerException`                            | A compiler/plugin bug — an unexpected `null` somewhere in the AST                       |
| `StackOverflowError`                              | A compiler bug — typically infinite recursion in type resolution                        |

Resolution path:

1. **Identify whether it's core or plugin.** Top frames in `io.ballerina.stdlib.*` / `io.ballerina.lib.*` → plugin. Top frames in `org.wso2.ballerinalang.*` / `io.ballerina.compiler.*` → core.
2. **Suspect version drift first.** `NoClassDefFoundError`, `NoSuchMethodError`, and `ClassNotFoundException` usually mean two packages pulled in incompatible versions of the same library. Inspect `Dependencies.toml` for the version of the affected module and try deleting `Dependencies.toml` to force a fresh resolution.
3. **Check release notes** for the Ballerina distribution and the affected library — the bug may already be fixed in a newer build.
4. **Try a structural workaround.** If a plugin crashes on a particular service or type shape, simplifying that shape often unblocks the build temporarily.
