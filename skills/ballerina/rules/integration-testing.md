# Integration Testing Rules

Read when the program connects to a broker, database, or any other external server.

When the program needs a broker, database, or other server, a clean `bal build` proves only that it compiles, and `bal run` fails on the first connection attempt. Neither tells you the integration works. Before calling it done:

1. Check whether the dependency is already reachable at the host and port the project targets, for each broker or database it connects to (`nc -z <host> <port>`; in PowerShell, `Test-NetConnection <host> -Port <port>`). If it is, use it and skip to step 3.
2. Otherwise, if a container runtime is available, stand up a disposable instance (a short `docker-compose.yml`, DDL mounted for databases). Give it a distinctive name and a host port you have checked is free rather than the vendor default, which may already be taken, and point the project's configuration at that port. To see what is running, list only names, status and ports (`docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"`), and read a container's logs with `--tail` rather than whole.
3. Exercise more than the happy path — at minimum one malformed input, and one dependency failure to confirm the error path does what the requirement actually says.
4. Clean up only what you started. If step 1 found the dependency already running it is not yours: never stop or remove it, and simulate failure another way (wrong credentials, a closed connection) rather than taking it down.

The failure classes that matter most in integrations are **runtime-only**: message acknowledgement, SQL parameter binding, and retry behaviour each compile perfectly while being wrong. Only call the work unrun when the dependency is genuinely unavailable — not reachable already, and no disposable instance can be started. In that case say plainly that the code is compile-verified but unrun, rather than implying it works.
