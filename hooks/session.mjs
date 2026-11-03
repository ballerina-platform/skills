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

import { lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRESH_STATE = { skill: false, rules: false, nudged: false, reminders: 0, rulesReminded: false };

export function readInput() {
    try {
        return JSON.parse(readFileSync(0, "utf8"));
    } catch {
        return {};
    }
}

function statePath(sessionId) {
    return join(tmpdir(), `ballerina-skill-${String(sessionId).replace(/[^\w-]/g, "")}.json`);
}

// The temp dir can be shared (Linux /tmp): trust only a regular file this user owns, never a planted link.
function ownFile(path) {
    try {
        const info = lstatSync(path);
        return info.isFile() && (process.getuid === undefined || info.uid === process.getuid()) ? "own" : "foreign";
    } catch {
        return "absent";
    }
}

export function loadState(sessionId) {
    const path = statePath(sessionId);
    try {
        return ownFile(path) === "own" ? { ...FRESH_STATE, ...JSON.parse(readFileSync(path, "utf8")) } : { ...FRESH_STATE };
    } catch {
        return { ...FRESH_STATE };
    }
}

export function clearState(sessionId) {
    const path = statePath(sessionId);
    if (ownFile(path) === "own") {
        rmSync(path, { force: true });
    }
}

export function saveState(sessionId, state) {
    const path = statePath(sessionId);
    const owner = ownFile(path);
    try {
        if (owner !== "foreign") {
            writeFileSync(path, JSON.stringify(state), { mode: 0o600, flag: owner === "own" ? "w" : "wx" });
        }
    } catch {
        // A hook must never block the agent; losing the state only means an extra reminder.
    }
}

export function isBallerinaSkill(name) {
    return name === "ballerina" || String(name).endsWith(":ballerina");
}
