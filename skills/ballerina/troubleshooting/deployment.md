# Deployment Issues

Covers Docker, Kubernetes, GraalVM native image, and runtime configuration in deployed environments.

## Docker

Ballerina supports Code-to-Cloud (C2C) Docker generation via `cloud = "docker"` in `Ballerina.toml`. The generated image uses `ballerina/jvm-runtime` (Debian-based). Custom base images (e.g. Alpine) can hit native-library compatibility issues — usually around DNS resolution and TLS.

A hand-written `Dockerfile` that runs the jar from `bal build` needs a base image with at least the distribution's Java version: Java 25 for 2201.14.x (e.g. `eclipse-temurin:25-jre`), Java 21 for 2201.13.x. Check the distribution with `bal version`.

```bash
# In Ballerina.toml: [build-options] cloud = "docker"
bal build

# Artifacts:
docker build -t myapp:latest target/docker/myapp/
docker run -p 9090:9090 myapp:latest
```

### Common issues

| Symptom                                  | Cause                                            | Fix                                                                       |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `UnsupportedClassVersionError` (`class file version 69.0`) | Base image's Java is older than the distribution's | Use a Java 25 runtime for 2201.14.x (Java 21 for 2201.13.x), e.g. `eclipse-temurin:25-jre` |
| Container starts but service unreachable | Port not exposed, or listener bound to localhost | Expose the port; bind the listener to `0.0.0.0`                           |
| `Config.toml` not found in the container | Not mounted                                      | Mount as a volume or pass `BAL_CONFIG_DATA` as an env var                 |
| `OutOfMemoryError` inside the container  | Container memory limit too low for the JVM       | Raise the container limit; set `-Xmx` via `JAVA_OPTS`                     |
| `File not found` for resources           | Relative paths invalid in the container          | Use paths relative to the working directory (`/home/ballerina`)           |
| TLS certificate errors                   | Cert files not present in the container          | Mount the cert files and update `Config.toml` accordingly                 |

### Passing config to Docker

```bash
# Inline env (good for secrets)
docker run -e BAL_CONFIG_DATA='[myorg.myapp]
port = 8080
apiKey = "secret"
' myapp:latest

# Mount a Config.toml file
docker run -v /path/to/Config.toml:/home/ballerina/Config.toml myapp:latest
```

## Kubernetes

Use `cloud = "k8s"` in `Ballerina.toml`. Manifests are generated under `target/kubernetes/`.

### Common issues

| Symptom                        | Cause                                                      | Fix                                                          |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Pod in `CrashLoopBackOff`      | App panicking at startup, OOM, or missing config           | `kubectl logs <pod>` — read stdout/stderr                    |
| Pod in `Pending`               | Cluster lacks resources to schedule                        | `kubectl describe pod <pod>` for the scheduling reason       |
| Service unreachable externally | No `Ingress` or `LoadBalancer`                             | Check `external_accessible` in `Cloud.toml`                  |
| Configurable values not loaded | `Config.toml` not mounted as a ConfigMap/Secret            | See `Cloud.toml` below                                       |
| `ImagePullBackOff`             | Image not pushed, or wrong registry URL                    | Push the image; verify `container.image.repository`          |
| Health checks failing          | Liveness/readiness probes not configured                   | Add probe configuration to `Cloud.toml`                      |

### Reference `Cloud.toml`

```toml
[container.image]
repository = "myregistry.io/myorg"
name = "myservice"
tag = "v1.0.0"

[cloud.deployment]
min_memory          = "256Mi"   # default 100Mi
max_memory          = "512Mi"   # default 256Mi
min_cpu             = "250m"    # default 1000m
max_cpu             = "1500m"   # default 1500m
external_accessible = true

[cloud.deployment.autoscaling]
min_replicas = 2    # default 2
max_replicas = 5    # default 3
cpu          = 50   # CPU threshold %
memory       = 80   # memory threshold %

[cloud.deployment.probes.readiness]
port = 9090
path = "/health/ready"

[cloud.deployment.probes.liveness]
port = 9090
path = "/health/live"

# Env from a secret
[[cloud.secret.envs]]
key_ref     = "DB_PASSWORD"
name        = "DB_PASSWORD"
secret_name = "db-secret"

# Config file as a ConfigMap
[[cloud.config.files]]
file = "Config.toml"

# Secret file mounted to a directory
[[cloud.secret.files]]
file      = "secrets.toml"
mount_dir = "/home/ballerina/secrets"
```

> Full Cloud.toml spec: <https://github.com/ballerina-platform/ballerina-spec/blob/master/c2c/code-to-cloud-spec.md>

## GraalVM native image

Native image builds give faster cold-start and lower memory at the cost of build time and runtime constraints.

```bash
bal build --graalvm
```

Prerequisites:

- GraalVM JDK installed and `GRAALVM_HOME` set (or `native-image` on PATH).
- In `Ballerina.toml`:

```toml
[build-options]
graalvm = true                            # equivalent to --graalvm
graalvmBuildOptions = "--no-fallback"     # optional native-image flags
```

**Always verify in JVM mode first.** If `bal run` works without `--graalvm` and the native image fails, the bug is GraalVM-specific — that's a much cheaper triage than blaming your code.

| Error / symptom                                | Cause                                                       | Fix                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `native-image` command not found               | GraalVM not installed or not on PATH                        | Install GraalVM, set `GRAALVM_HOME`, and run `gu install native-image`                               |
| Reflection error at runtime                    | A reflectively-accessed class wasn't registered             | Add a `reflect-config.json` under `resources/META-INF/native-image/`                                 |
| Build fails with "unsupported feature"         | A library uses a JVM feature GraalVM doesn't support        | Confirm GraalVM support for the library; some `ballerinax/*` connectors may not be GraalVM-compatible |
| Native image crashes at runtime                | Runtime behaviour differs from JVM                          | Reproduce in JVM mode first; if JVM works, file a GraalVM compatibility issue                        |
| Native build extremely slow / out of memory    | Native compilation is resource-intensive                    | Raise build memory: `graalvmBuildOptions = "-J-Xmx8g"`                                              |

> `JAVA_OPTS` (`-Xmx` etc.) does **not** apply to native images. Use `-R:MaxHeapSize=512m` in `graalvmBuildOptions` (build time) or at runtime to cap heap. See [performance.md](performance.md) for JVM-mode memory tuning — the two are different runtimes.

## Configuration in deployed environments

Resolution order (highest to lowest):

1. `BAL_CONFIG_VAR_<NAME>` environment variables (per-variable override)
2. `BAL_CONFIG_DATA` environment variable (inline TOML)
3. Files listed in `BAL_CONFIG_FILES` (colon-separated on Linux/macOS, semicolon on Windows)
4. `Config.toml` in the working directory

For sensitive values (API keys, passwords), prefer `BAL_CONFIG_VAR_<NAME>` over mounting files — it avoids writing secrets to disk in the container. See [tooling.md](tooling.md) for supported types and the value format.

### Kubernetes pattern — ConfigMap + Secret

```yaml
# Non-sensitive config
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
data:
  config.toml: |
    [myorg.myapp]
    port    = 8080
    dbHost  = "postgres.example.com"
---
# Secrets
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
data:
  secrets.toml: <base64-encoded TOML>
```

Pod spec:

```yaml
env:
  - name: BAL_CONFIG_FILES
    value: "/config/config.toml:/secrets/secrets.toml"
volumeMounts:
  - name: config-vol
    mountPath: /config
  - name: secrets-vol
    mountPath: /secrets
```

### Debugging config in a deployed pod

```bash
# Inspect env and config visible to the container
kubectl exec -it <pod-name> -- env | grep BAL_CONFIG
kubectl exec -it <pod-name> -- cat /config/config.toml
```

If a configurable value still resolves to its default, add a one-shot debug log in the service init that prints the value — this is the fastest way to confirm whether the value is *actually* being read or silently falling back.
