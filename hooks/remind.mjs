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

import { join } from "node:path";
import { loadState, readInput, saveState } from "./session.mjs";

const MAX_SKILL_REMINDERS = 3;
const BAL_COMMAND = /(^|[\s;&|(])bal\s+(new|build|run|test|add|pull|push|format|pack)\b/;

const input = readInput();
const toolInput = input.tool_input ?? {};
const filePath = String(toolInput.file_path ?? "");
const command = String(toolInput.command ?? "");
const writesBal = ["Write", "Edit", "MultiEdit"].includes(input.tool_name) ? filePath.endsWith(".bal")
    : input.tool_name === "Bash" && /\.bal\b/.test(command) && /(>|\btee\b)/.test(command);
const touchesBallerina = writesBal || (input.tool_name === "Bash" && (BAL_COMMAND.test(command) || /Ballerina\.toml/.test(command)));

if (input.session_id && touchesBallerina) {
    const state = loadState(input.session_id);
    let reminder;
    if (!state.skill && state.reminders < MAX_SKILL_REMINDERS) {
        state.reminders += 1;
        reminder = "This task touches Ballerina code. Load the `ballerina` skill now; it holds the Ballerina code rules.";
    } else if (state.skill && !state.rules && writesBal && !state.rulesReminded) {
        state.rulesReminded = true;
        const rules = join(process.env.CLAUDE_PLUGIN_ROOT ?? "", "skills", "ballerina", "code-rules.md");
        reminder = `Before writing \`.bal\` code, read the skill's code rules: ${rules}`;
    }
    if (reminder) {
        saveState(input.session_id, state);
        process.stdout.write(JSON.stringify({
            suppressOutput: true,
            hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: reminder },
        }));
    }
}
