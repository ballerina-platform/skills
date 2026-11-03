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

// node lookup.mjs <words...>                  search this skill and the Ballerina by Example (BBE) examples
// node lookup.mjs example <slug> [--explain]  print one example's code (and its explanation)

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const LIMIT = 10;
const BBE_REPO = process.env.BAL_LOOKUP_REPO ?? "https://github.com/ballerina-platform/ballerina-distribution";
const RAW_REPO = BBE_REPO.replace("https://github.com/", "https://raw.githubusercontent.com/");
const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how",
    "i", "in", "into", "is", "it", "my", "of", "on", "or", "the", "to", "use", "using", "what", "when", "where", "which",
    "with", "you"]);

function hasExamples(home) {
    return Boolean(home) && existsSync(join(home, "examples"));
}

function balHome() {
    if (process.env.BAL_LOOKUP_HOME !== undefined) {
        return hasExamples(process.env.BAL_LOOKUP_HOME) ? process.env.BAL_LOOKUP_HOME : undefined;
    }
    const result = spawnSync("bal", ["home"], { encoding: "utf8", shell: process.platform === "win32", timeout: 20000 });
    const home = (result.stdout ?? "").trim().split(/\r?\n/).pop();
    return hasExamples(home) ? home : undefined;
}

function versionOf(home) {
    return home?.match(/ballerina-(\d+\.\d+\.\d+)/)?.[1];
}

function scorer(words) {
    const phrase = words.join(" ");
    const need = words.length > 1 ? 2 : 1;
    return (text) => {
        const lower = text.toLowerCase();
        const matched = words.filter((word) => lower.includes(word)).length;
        return { matched, score: matched + (words.length > 1 && lower.includes(phrase) ? words.length : 0), need };
    };
}

function markdownFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return markdownFiles(path);
        }
        return entry.name.endsWith(".md") ? [path] : [];
    });
}

function searchSkill(words) {
    const score = scorer(words);
    const best = new Map();
    for (const file of markdownFiles(SKILL_DIR)) {
        const name = relative(SKILL_DIR, file).split(sep).join("/");
        if (name === "SKILL.md") {
            continue;
        }
        let heading = "(top)";
        readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
            if (/^#+ /.test(line)) {
                heading = line.replace(/^#+ /, "");
            }
            const result = score(line);
            const key = `${name}\u0000${heading}`;
            if (result.matched >= result.need && result.score > (best.get(key)?.score ?? 0)) {
                const text = line.replace(/^[\s|#*`-]+/, "");
                best.set(key, { score: result.score, line: `${name}:${index + 1}  [${heading}]  ${clip(text, 90)}` });
            }
        });
    }
    return ranked([...best.values()]);
}

function filesOf(dir, extension) {
    try {
        return readdirSync(dir).filter((name) => name.endsWith(extension)).sort();
    } catch {
        return [];
    }
}

function withoutDirectives(markdown) {
    return markdown.split(/\r?\n/).filter((line) => !line.startsWith(":::")).join("\n");
}

function readExample(home, slug) {
    const dir = join(home, "examples", slug);
    const read = (name) => readFileSync(join(dir, name), "utf8");
    const metaFile = filesOf(dir, ".metatags")[0];
    const meta = read(metaFile);
    const description = (meta.match(/^description: (.*)$/m)?.[1] ?? "")
        .replace(/^This (BBE|example) (demonstrates|shows|is on) (how to )?/, "");
    const notes = filesOf(dir, ".md").map((name) => withoutDirectives(read(name))).join("\n");
    const code = filesOf(dir, ".bal").map((name) => read(name)).join("\n");
    return { description, meta: `${slug} ${meta}`, notes, code };
}

function searchLocalExamples(home, words) {
    const score = scorer(words);
    const hits = [];
    for (const slug of readdirSync(join(home, "examples"))) {
        const dir = join(home, "examples", slug);
        if (filesOf(dir, ".metatags").length === 0 || filesOf(dir, ".bal").length === 0) {
            continue;
        }
        const example = readExample(home, slug);
        const meta = score(example.meta);
        const body = score(`${example.notes}\n${example.code}`);
        if (Math.max(meta.matched, body.matched) >= meta.need) {
            hits.push({ score: 2 * meta.score + body.score, line: `${slug}: ${clip(example.description, 100)}` });
        }
    }
    return ranked(hits);
}

async function searchRemoteExamples(words) {
    const score = scorer(words);
    const response = await fetch(`${RAW_REPO}/master/examples/index.json`);
    const groups = await response.json();
    const hits = groups.flatMap((group) => group.samples ?? []).flatMap((sample) => {
        const result = score(`${sample.url} ${sample.name}`);
        return result.matched >= result.need ? [{ score: result.score, line: `${sample.url}: ${sample.name}` }] : [];
    });
    return ranked(hits);
}

function ranked(hits) {
    return hits.sort((a, b) => b.score - a.score || a.line.localeCompare(b.line)).slice(0, LIMIT).map((hit) => hit.line);
}

function clip(text, length) {
    return text.length > length ? `${text.slice(0, length)}...` : text;
}

function printCode(files) {
    const labelled = files.length > 1;
    for (const { name, text } of files) {
        process.stdout.write(labelled ? `// ${name}\n${text}\n` : text);
    }
}

async function remoteFiles(slug, ref) {
    const listing = await fetch(`${BBE_REPO.replace("https://github.com/", "https://api.github.com/repos/")}/contents/examples/${slug}?ref=${ref}`);
    if (!listing.ok) {
        return [];
    }
    const names = (await listing.json()).map((entry) => entry.name);
    return Promise.all(names.filter((name) => /\.(bal|md)$/.test(name)).sort().map(async (name) =>
        ({ name, text: await (await fetch(`${RAW_REPO}/${ref}/examples/${slug}/${name}`)).text() })));
}

async function printExample(slug, explain) {
    const home = balHome();
    const dir = home ? join(home, "examples", slug) : undefined;
    let files;
    if (dir && filesOf(dir, ".bal").length > 0) {
        files = [...filesOf(dir, ".bal"), ...filesOf(dir, ".md")].map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
    } else {
        const version = versionOf(home);
        try {
            files = await remoteFiles(slug, version ? `v${version}` : "master");
        } catch {
            console.error(`No local example '${slug}' and no network. Search with: node lookup.mjs <words>`);
            process.exitCode = 1;
            return;
        }
    }
    const code = files.filter((file) => file.name.endsWith(".bal"));
    if (code.length === 0) {
        console.error(`No example '${slug}'. Search with: node lookup.mjs <words>`);
        process.exitCode = 1;
        return;
    }
    printCode(code);
    if (explain) {
        const notes = files.filter((file) => file.name.endsWith(".md")).map((file) => withoutDirectives(file.text));
        process.stdout.write(`\n${notes.join("\n")}\n`);
    }
}

async function main(args) {
    if (args[0] === "example") {
        if (!args[1]) {
            console.error("Usage: node lookup.mjs example <slug> [--explain]");
            process.exitCode = 2;
            return;
        }
        await printExample(basename(args[1]), args.includes("--explain"));
        return;
    }
    const words = args.join(" ").toLowerCase().split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
    if (words.length === 0) {
        console.error("Usage: node lookup.mjs <words...> | node lookup.mjs example <slug> [--explain]");
        process.exitCode = 2;
        return;
    }
    console.log("== this skill (open one: read <file> from <line>, about 40 lines)");
    console.log(searchSkill(words).join("\n") || "(no match)");
    console.log("\n== examples (print one: node lookup.mjs example <slug>)");
    const home = balHome();
    if (home) {
        console.log(searchLocalExamples(home, words).join("\n") || "(no match)");
        return;
    }
    try {
        console.log((await searchRemoteExamples(words)).join("\n") || "(no match)");
    } catch {
        console.log("(no local Ballerina and no network: see https://ballerina.io/learn/by-example/)");
    }
}

await main(process.argv.slice(2));
