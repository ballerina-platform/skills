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

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadState, readInput, saveState } from "./session.mjs";

const PROMPT_TERMS = /\bballerina\b|\.bal\b|ballerina\.toml|\bbal\s+(new|build|run|test|add|pull|push)\b/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "target", ".venv", "dist", "build"]);

function hasBallerinaFiles(dir, depth) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true }).slice(0, 300);
    } catch {
        return false;
    }
    if (entries.some((entry) => entry.isFile() && (entry.name === "Ballerina.toml" || entry.name.endsWith(".bal")))) {
        return true;
    }
    return depth > 0 && entries.some((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name)
        && !entry.name.startsWith(".") && hasBallerinaFiles(join(dir, entry.name), depth - 1));
}

const input = readInput();
if (input.session_id) {
    const state = loadState(input.session_id);
    if (/^\s*\/(ballerina:)?ballerina\b/.test(String(input.prompt ?? ""))) {
        state.skill = true;
        saveState(input.session_id, state);
    } else if (!state.skill && !state.nudged
        && (PROMPT_TERMS.test(String(input.prompt ?? "")) || hasBallerinaFiles(input.cwd ?? process.cwd(), 1))) {
        state.nudged = true;
        saveState(input.session_id, state);
        process.stdout.write("If this task involves Ballerina code, a Ballerina project or the `bal` tool, load the `ballerina` skill before you start.\n");
    }
}
