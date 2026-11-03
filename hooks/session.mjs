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

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export function loadState(sessionId) {
    try {
        return JSON.parse(readFileSync(statePath(sessionId), "utf8"));
    } catch {
        return { skill: false, rules: false, nudged: false, reminders: 0, rulesReminded: false };
    }
}

export function saveState(sessionId, state) {
    try {
        writeFileSync(statePath(sessionId), JSON.stringify(state));
    } catch {
        // A hook must never block the agent; losing the state only means an extra reminder.
    }
}

export function isBallerinaSkill(name) {
    return name === "ballerina" || String(name).endsWith(":ballerina");
}
