#!/usr/bin/env bash
# Fails when the Copilot copies of the plugin config drift from the Claude Code originals.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import json, sys

def load(path):
    with open(path) as f:
        return json.load(f)

def body(path):
    text = open(path).read()
    return text.split("---", 2)[2].strip()

errors = []

claude, copilot = load(".claude-plugin/plugin.json"), load("plugin.json")
for key in ("name", "version", "description", "license"):
    if claude.get(key) != copilot.get(key):
        errors.append(f"plugin.json '{key}' differs from .claude-plugin/plugin.json")

claude_mp, copilot_mp = load(".claude-plugin/marketplace.json"), load(".github/plugin/marketplace.json")
strip = lambda mp: {**mp, "plugins": [{k: v for k, v in p.items() if k != "source" or isinstance(v, str)} for p in mp["plugins"]]}
if strip(claude_mp) != strip(copilot_mp):
    errors.append(".github/plugin/marketplace.json differs from .claude-plugin/marketplace.json (beyond plugin sources)")

claude_lsp = load(".lsp.json")["ballerina"]
copilot_lsp = load("com.github.copilot/lsp.json")["lspServers"]["ballerina"]
mapped = {"command": claude_lsp["command"], "args": claude_lsp["args"],
          "fileExtensions": claude_lsp["extensionToLanguage"],
          "initializationOptions": claude_lsp["initializationOptions"]}
if mapped != copilot_lsp:
    errors.append("com.github.copilot/lsp.json differs from .lsp.json")

for e in errors:
    print(f"out of sync: {e}", file=sys.stderr)
sys.exit(1 if errors else 0)
PY
echo "Copilot config is in sync"
