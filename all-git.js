#!/usr/bin/env node
"use strict";

import { readdir, stat } from "fs/promises";
import child_process from "child_process";
import { promisify } from "util";
import { basename, dirname, join } from "path";
import AutoMap from "auto-creating-map";
import table from "@dwbinns/terminal/table";
import { red, green, cyan, yellow, blue } from "@dwbinns/terminal/colour";
import { underline } from "@dwbinns/terminal/format";

const execFile = promisify(child_process.execFile);
const { max } = Math;

function commonPrefix(a, b) {
    let index = 0;
    while (index < a.length && index < b.length) {
        if (a[index] != b[index]) break;
        index++;
    }
    return a.slice(0, index);
}

async function gitLogCount(cwd, from, to) {
    try {
        return (
            (
                await execFile("git", ["log", "--oneline", `${from}..${to}`], { cwd })
            ).stdout.split("\n").length - 1
        );
    } catch (e) {
        return "";
    }
}


async function findGit(path) {
    if (basename(path) == ".git") return [dirname(path)];

    let directories = await readdir(join(path), { withFileTypes: true });

    return (
        await Promise.all(
            directories
                .filter((dirEnt) => dirEnt.isDirectory())
                .map((dirEnt) => findGit(join(path, dirEnt.name)))
        )
    ).flat();
}

const forEachRepo = async (action) => {
    let gitDirectories = await findGit(".");

    return await Promise.all(
        gitDirectories.map(async (path) => {
            try {
                return await action(path, path);
            } catch (e) {
                console.error(path, e.message);
            }
        })
    );
};

async function status() {
    let header = [
        "directory",
        "#A",
        "#M",
        "#D",
        "repository",
        "branch",
        "↓",
        "↑",
        "action",
    ];


    let commonRepositoryPrefix = null;

    let rows = await forEachRepo(async (name, cwd) => {
        let fileStatusCount = new AutoMap(() => 0);

        (await execFile("git", ["status", "-z", "--porcelain=v1"], { cwd })).stdout
            .split("\0")
            .filter((line) => line.length > 2)
            .map((line) => [line.slice(0, 2), line.slice(3)])
            .forEach(([key]) =>
                fileStatusCount.set(key, fileStatusCount.get(key) + 1)
            );

        let local = fileStatusCount.size > 0;

        let newCount = fileStatusCount.get("??");
        let modifiedCount = fileStatusCount.get(" M");
        let deletedCount = fileStatusCount.get(" D");

        let branch = (
            await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
                cwd,
            }).catch((e) => e)
        ).stdout.trim();

        let repo = (
            await execFile("git", ["config", "--get", "remote.origin.url"], {
                cwd,
            }).catch((e) => e)
        ).stdout.trim();

        commonRepositoryPrefix = commonPrefix(commonRepositoryPrefix ?? repo, repo);

        try {
            await execFile("git", ["fetch"], { cwd });

            let behind = await gitLogCount(cwd, "HEAD", "@{u}");
            let ahead = await gitLogCount(cwd, "@{u}", "HEAD");

            let action = local ? blue("commit")
                : ahead > 0 && behind > 0 ? red("merge")
                    : behind > 0 ? cyan("pull")
                        : ahead > 0 ? yellow("push")
                            : green("ok");

            return [
                name,
                newCount,
                modifiedCount,
                deletedCount,
                repo,
                branch,
                behind,
                ahead,
                action,
            ];
        } catch (e) {
            return [name, newCount, modifiedCount, repo, branch];
        }
    });

    rows = rows.map(([name, newCount, modifiedCount, deletedCount, repo, ...others]) => [
        name,
        newCount,
        modifiedCount,
        deletedCount,
        repo.slice(commonRepositoryPrefix.length),
        ...others]
    );

    console.log(table([header, ...rows]));
    console.log();
    console.log("Number of local files: #A = added, #M = modified, #D = deleted; Number of commits: ↓ = to pull; ↑ = to push");
    console.log("Repository prefix:", commonRepositoryPrefix);
    return 0;
}

async function run(command, ...args) {
    let results = await forEachRepo(async (name, cwd) => {
        let output = (await execFile(command, args, { cwd })).stdout.trim();

        return underline(cyan(name)) + "\n" + output;
    });

    console.log(results.join("\n"));
}

run.command = "<command> <args> ...";
run.help = `
Run a command in each git directory, eg:
all-git run jq .version package.json
`;


async function branch(branchName) {
    await run(
        "git",
        "checkout",
        "-b",
        branchName,
        "--track",
        `origin/${branchName}`
    );
}

branch.command = "<new-branch-name>";
branch.help = `
Create a new branch in each git directory,
and configure tracking to same named branch in origin remote.
`;


async function push() {
    await run("git", "push");
}


function help(commandName) {
    if (commandName) {
        let command = commands[commandName];
        if (command) {
            console.log(`all-git ${commandName} ${command.command || ''}`);
            console.log(command.help || '');
        } else {
            console.log("Subcommand not known");
        }
    } else {
        Object.entries(commands).forEach(([name, { command }]) =>
            console.log(`all-git ${name} ${command || ""}`)
        );
    }
}

help.command = `[<subcommand>]`;
help.help = 'Get help on subcommand. Omit for a summary of all commands';

let commands = { status, run, branch, push, help };

(async (command, ...args) => {
    return await (commands[command] || help)(...args) ?? 0;
})(...process.argv.slice(2))
    .catch(console.error)
    .then((code = 1) => (process.exitCode = code));
