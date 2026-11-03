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

import { isBallerinaSkill, loadState, readInput, saveState } from "./session.mjs";

const input = readInput();
const toolInput = input.tool_input ?? {};
if (input.session_id) {
    const state = loadState(input.session_id);
    if (input.tool_name === "Skill" && isBallerinaSkill(toolInput.skill ?? toolInput.name)) {
        state.skill = true;
    }
    const target = `${toolInput.file_path ?? ""} ${toolInput.command ?? ""}`.replace(/\\/g, "/");
    if (/ballerina\/code-rules\.md\b/.test(target)) {
        state.rules = true;
    }
    saveState(input.session_id, state);
}
