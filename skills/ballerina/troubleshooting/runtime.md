# Runtime Issues

**Contents:** Errors vs panics · Reading an error or panic · Core runtime errors · Strand dumps — diagnosing hangs and deadlocks

Runtime problems surface after compilation succeeds, while the program is executing. This file covers the **core runtime** — for connector-specific runtime failures, jump to the matching file (`http.md`, `sql.md`, …).

## Errors vs panics

Ballerina splits failures into two categories, and they are read differently.

|                | Error                                                            | Panic                                                                |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Nature         | Expected failure, returned as a value                            | Unrecoverable failure that terminates the strand                     |
| Triggered by   | `return error(...)`, `check` on failure, library function return | `panic`, nil dereference via unsafe cast, divide by zero, type cast  |
| Handled by     | `if x is error { ... }` or `do { ... } on fail var e { ... }`    | `trap` expression (use sparingly — usually a bug, not a flow)        |
| Stops program? | No                                                               | Yes, unless trapped                                                  |
| Stack trace?   | Optional, attached to the error value                            | Always printed to stderr                                             |

## Reading an error or panic

The standard format is:

```text
error: <message>
    at <org>/<package>:<version>:<function>(<file>.bal:<line>)
    ...
```

A real example:

```text
error: {ballerina/http}ClientRequestError Connection refused: localhost/127.0.0.1:8080
       └── origin ──┘ └── type ────────┘ └────── message ─────────────────────────┘
```

The `{org/module}` prefix identifies where the error came from:

| Prefix                | Origin                                |
| --------------------- | ------------------------------------- |
| `{ballerina}`         | Core runtime                          |
| `{ballerina/http}`    | `ballerina/http`                      |
| `{ballerina/sql}`     | `ballerina/sql`                       |
| `{ballerina/graphql}` | `ballerina/graphql`                   |
| `{ballerina/io}`      | `ballerina/io`                        |
| `{ballerinax/kafka}`  | `ballerinax/kafka` (extended library) |
| `{myorg/mypackage}`   | Your own package                      |

Ballerina stack traces may interleave Ballerina frames (`at myorg/mypackage:main(main.bal:15)`) with Java frames from the runtime. Focus on the Ballerina frames first — they tell you what your code was doing when it failed.

## Core runtime errors

The part in braces names the module that raised the error: `{ballerina}` is the runtime itself, `{ballerina/lang.array}` the array langlib, and so on. Errors from a library module are documented with that module's API.

| Error (2201.14)                          | Typical cause                                                        | Action                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `{ballerina}TypeCastError`               | `<MyType>value` where the value is not a `MyType`, including `()`    | Replace `<T>val` with `if val is T { ... }` or `value:ensureType(val)`                   |
| `{ballerina}DivisionByZero`              | Integer division or `%` by zero                                      | Check the divisor first                                                                   |
| `{ballerina}StackOverflow`               | Recursive function missing a base case                               | Add the base case, or switch to an iterative form                                         |
| `{ballerina}JSONOperationError`          | Field access on a `json` value that is not a mapping (`five.a`)      | Check the shape before drilling in, or convert to a record first                         |
| `{ballerina/lang.int}NumberParsingError` | `int:fromString("abc")` (`float:`/`decimal:` have their own)         | Handle the `error` the function returns; validate input before converting                |
| `{ballerina/lang.array}IndexOutOfRange`  | Reading past the end of an array or tuple                            | Guard with `if i < arr.length()`                                                          |
| `{ballerina/lang.map}KeyNotFound`        | `m.get(k)`, `m.remove(k)`, or `json` field access, on a key that is not present | Use `m.hasKey(k)`, member access `m[k]` (returns `()`) or `m.removeIfHasKey(k)`; `j?.k` for optional `json` keys |

### Worked example — `TypeCastError`

```text
error: {ballerina}TypeCastError {"message":"incompatible types: 'string' cannot be cast to 'int'"}
        at myorg/mypackage:0.1.0:processData(utils.bal:42)
        at myorg/mypackage:0.1.0:main(main.bal:10)
```

Look at `utils.bal:42` — it likely contains `<int>someValue` where `someValue` is sometimes a `string` at runtime. Trace where `someValue` is assigned and confirm the type holds on every path.

If the stack trace shows no frames from your code — every frame is in the runtime — the panic is a runtime bug rather than misuse. File against `ballerina-platform/ballerina-lang` with a minimal reproducer.

## Strand dumps — diagnosing hangs and deadlocks

When a program hangs, take a strand dump to see which strands are blocked and on what. The mechanism uses `SIGTRAP`, so it works on Linux and macOS but **not on Windows**.

Find the PID:

```bash
jps
# Look for: <PID> $_init   (a running service)
# or:       <PID> BTestMain (a test run)
```

Trigger the dump:

```bash
kill -SIGTRAP <PID>
# equivalent:
kill -5 <PID>
```

The dump goes to the program's **standard output**. If you want to capture it, run the program with `bal run . > out.log 2>&1`.

Since 2201.11 each strand runs on a Java virtual thread. The dump lists every strand with its stack, grouped into isolated and non-isolated strands; it shows no state per strand. A 2201.14 dump:

```text
Ballerina Strand Dump [2026/11/03 17:24:34]
Total Strand count               :  2
Total Isolated Strand count      :  1
Total Non Isolated Strand count  :  1

Isolated Strands:
    Strand #32 "waiter" :
        at       ballerina.lang&0046runtime.0.runtime.sleep(runtime.bal:86)
                 myorg.mypackage.0.main.$lambda$_0(main.bal:13)

Non Isolated Strands:
    Strand #29 "main" :
        at       ballerina.lang&0046runtime.0.runtime.sleep(runtime.bal:86)
                 myorg.mypackage.0.main.holdLock(main.bal:7)
                 myorg.mypackage.0.main.main(main.bal:15)
```

The first frame in your own code (`main.bal:7` above) is where that strand is waiting.

### Suspecting a deadlock

1. Take two dumps a few seconds apart. Strands whose stacks do not change are stuck.
2. Several stuck strands at the same `lock` block, or at worker sends (`->`) and receives (`<-`) that never pair up, show the contention. Use the file:line in each frame.
3. Common fixes: shrink the scope of `lock` blocks, take locks in the same order at every call site, or remove shared mutable state. Every worker `->` needs a matching `<-`.

### Program hangs without deadlock

1. Look for strands whose first frame in your code is a client call (HTTP, database, broker): they are waiting on that dependency.
2. Check whether the downstream service is responding (network, DNS, listener up).
3. Long-term fix: set timeouts on every external client so a slow dependency cannot stall a strand indefinitely.
