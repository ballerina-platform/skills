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
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";

const LOOKUP = fileURLToPath(new URL("../skills/ballerina/scripts/lookup.mjs", import.meta.url));
let skillDir, balHome;

function write(path, text) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
}

function example(slug, code, description, body, base = slug.replaceAll("-", "_")) {
    write(join(balHome, "examples", slug, `${base}.bal`), code);
    write(join(balHome, "examples", slug, `${base}.metatags`), `description: This BBE demonstrates ${description}.\nkeywords: ballerina, bbe\n`);
    write(join(balHome, "examples", slug, `${base}.md`), `# ${slug}\n\n${body}\n\n::: code ${base}.bal :::\n`);
}

before(() => {
    const root = mkdtempSync(join(tmpdir(), "bal-lookup-"));
    skillDir = join(root, "skill");
    balHome = join(root, "ballerina-2201.14.0");
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    copyFileSync(LOOKUP, join(skillDir, "scripts", "lookup.mjs"));
    write(join(skillDir, "SKILL.md"), "# Ballerina\n\n## Running\n\nRun the program with bal run.\n");
    write(join(skillDir, "troubleshooting", "compiler.md"), "# Compiler\n\n## Common errors\n\n| `invalid record constructor: duplicate key 'X'` | Use the let form |\n");
    example("xmlns-declarations", "xmlns \"http://example.com\" as eg;\n", "xmlns declarations", "Bind a prefix to a namespace URL.");
    example("records", "type Person record {| string name; |};\n", "records", "A record has named fields.");
    example("strings", "string csv = string:'join(\",\", \"a\", \"b\");\n", "string functions", "Strings are immutable.");
    example("grpc-service-headers", "service \"Greeter\" on new grpc:Listener(9090) {}\n", "a gRPC service that reads headers",
        "Headers travel with each call.", "grpc_simple_with_headers_service");
});

function lookupWith(env, ...args) {
    const result = spawnSync(process.execPath, [join(skillDir, "scripts", "lookup.mjs"), ...args],
        { encoding: "utf8", env: { ...process.env, BAL_LOOKUP_HOME: balHome, ...env } });
    return { code: result.status, out: result.stdout, err: result.stderr };
}

function lookup(...args) {
    return lookupWith({}, ...args);
}

function examplesPart(out) {
    return out.split("== examples")[1];
}

test("finds the skill section that names an error, with its line", () => {
    const { code, out } = lookup("duplicate", "key");
    assert.equal(code, 0);
    assert.match(out, /troubleshooting\/compiler\.md:5 {2}\[Common errors\]/);
});

test("finds an example through its explanation text, not only its title", () => {
    const { out } = lookup("namespace");
    assert.match(out.split("== examples")[1], /^xmlns-declarations: xmlns declarations\.$/m);
});

test("a multi-word query needs two matching words", () => {
    const { out } = lookup("records", "kafka");
    assert.doesNotMatch(out.split("== examples")[1], /records:/);
});

test("prints one example's code, and its notes without the page directives", () => {
    assert.equal(lookup("example", "records").out, "type Person record {| string name; |};\n");
    const explained = lookup("example", "records", "--explain").out;
    assert.match(explained, /A record has named fields\./);
    assert.doesNotMatch(explained, /:::/);
});

test("usage errors exit non-zero", () => {
    assert.equal(lookup().code, 2);
    assert.equal(lookup("example").code, 2);
});

test("finds and prints an example whose files are not named after its folder", () => {
    assert.match(examplesPart(lookup("grpc", "headers").out), /^grpc-service-headers: /m);
    assert.match(lookup("example", "grpc-service-headers").out, /grpc:Listener/);
});

test("searches example code, so an API name finds its example", () => {
    assert.match(examplesPart(lookup("join").out), /^strings: /m);
});

test("ignores stop words", () => {
    assert.match(examplesPart(lookup("how", "to", "use", "records").out), /^records: /m);
});

test("leaves SKILL.md out of the results: it is already loaded", () => {
    assert.doesNotMatch(lookup("program", "run").out, /SKILL\.md/);
});

test("a missing example with no local Ballerina and no network fails in one line", () => {
    const { code, err } = lookupWith({ BAL_LOOKUP_HOME: join(skillDir, "missing"), BAL_LOOKUP_REPO: "http://127.0.0.1:9/x" }, "example", "records");
    assert.equal(code, 1);
    assert.equal(err.trim().split("\n").length, 1);
});
