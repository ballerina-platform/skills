/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOKS = fileURLToPath(new URL("../hooks/", import.meta.url));
let stateDir;

beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "bal-hooks-"));
});

function runHook(name, input) {
    const env = { ...process.env, TMPDIR: stateDir, TEMP: stateDir, TMP: stateDir, CLAUDE_PLUGIN_ROOT: "/plugin" };
    const result = spawnSync(process.execPath, [join(HOOKS, name)], { input: JSON.stringify(input), env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

function reminderOf(output) {
    return output ? JSON.parse(output).hookSpecificOutput.additionalContext : undefined;
}

const heredocWrite = { tool_name: "Bash", tool_input: { command: "cat > main.bal <<EOF\nimport ballerina/io;\nEOF" } };

test("prompt nudge fires once per session for a Ballerina prompt", () => {
    const input = { session_id: "s1", prompt: "Write a Ballerina service", cwd: stateDir };
    assert.match(runHook("prompt-nudge.mjs", input), /load the `ballerina` skill/);
    assert.equal(runHook("prompt-nudge.mjs", input), "");
});

test("prompt nudge fires for a folder holding a Ballerina project", () => {
    writeFileSync(join(stateDir, "Ballerina.toml"), "");
    assert.match(runHook("prompt-nudge.mjs", { session_id: "s1", prompt: "add a health check", cwd: stateDir }), /ballerina/);
});

test("prompt nudge stays quiet for unrelated work", () => {
    assert.equal(runHook("prompt-nudge.mjs", { session_id: "s1", prompt: "summarise the changelog", cwd: stateDir }), "");
});

test("remind asks for the skill on a .bal write through Bash, at most three times", () => {
    const outputs = [1, 2, 3, 4].map(() => reminderOf(runHook("remind.mjs", { session_id: "s1", ...heredocWrite })));
    assert.equal(outputs.filter(Boolean).length, 3);
    assert.match(outputs[0], /Load the `ballerina` skill/);
});

test("remind output is valid JSON and never makes a permission decision", () => {
    const output = JSON.parse(runHook("remind.mjs", { session_id: "s1", tool_name: "Bash", tool_input: { command: "bal build" } }));
    assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
});

test("remind ignores commands that only list .bal files", () => {
    assert.equal(runHook("remind.mjs", { session_id: "s1", tool_name: "Bash", tool_input: { command: "ls *.bal" } }), "");
});

test("a loaded plugin skill stops the skill reminder and asks once for the code rules", () => {
    runHook("mark.mjs", { session_id: "s1", tool_name: "Skill", tool_input: { skill: "ballerina:ballerina" } });
    const write = { session_id: "s1", tool_name: "Write", tool_input: { file_path: join("w", "main.bal") } };
    assert.match(reminderOf(runHook("remind.mjs", write)), /code-rules\.md/);
    assert.equal(runHook("remind.mjs", write), "");
});

test("reading the code rules, with either path separator, stops the rules reminder", () => {
    runHook("mark.mjs", { session_id: "s1", tool_name: "Skill", tool_input: { skill: "ballerina" } });
    runHook("mark.mjs", { session_id: "s1", tool_name: "Read", tool_input: { file_path: "C:\\p\\skills\\ballerina\\code-rules.md" } });
    assert.equal(runHook("remind.mjs", { session_id: "s1", tool_name: "Write", tool_input: { file_path: "main.bal" } }), "");
});

test("hooks exit cleanly on input that is not JSON", () => {
    for (const name of ["prompt-nudge.mjs", "remind.mjs", "mark.mjs"]) {
        const result = spawnSync(process.execPath, [join(HOOKS, name)], { input: "not json", encoding: "utf8" });
        assert.equal(result.status, 0);
        assert.equal(result.stdout, "");
    }
});

test("typing /ballerina counts as loading the skill", () => {
    assert.equal(runHook("prompt-nudge.mjs", { session_id: "s1", prompt: "/ballerina write a service", cwd: stateDir }), "");
    const write = { session_id: "s1", tool_name: "Write", tool_input: { file_path: "main.bal" } };
    assert.match(reminderOf(runHook("remind.mjs", write)), /code-rules\.md/);
});

test("reading the code rules through Bash counts", () => {
    runHook("mark.mjs", { session_id: "s1", tool_name: "Skill", tool_input: { skill: "ballerina:ballerina" } });
    runHook("mark.mjs", { session_id: "s1", tool_name: "Bash", tool_input: { command: "cat /p/skills/ballerina/code-rules.md" } });
    assert.equal(runHook("remind.mjs", { session_id: "s1", tool_name: "Write", tool_input: { file_path: "main.bal" } }), "");
});

test("a MultiEdit of a .bal file and a command on Ballerina.toml both remind", () => {
    assert.ok(reminderOf(runHook("remind.mjs", { session_id: "s1", tool_name: "MultiEdit", tool_input: { file_path: "a.bal" } })));
    assert.ok(reminderOf(runHook("remind.mjs", { session_id: "s2", tool_name: "Bash", tool_input: { command: "cat Ballerina.toml" } })));
});

test("session end removes the session state", () => {
    runHook("mark.mjs", { session_id: "s1", tool_name: "Skill", tool_input: { skill: "ballerina" } });
    assert.ok(existsSync(join(stateDir, "ballerina-skill-s1.json")));
    runHook("session-end.mjs", { session_id: "s1" });
    assert.ok(!existsSync(join(stateDir, "ballerina-skill-s1.json")));
});
