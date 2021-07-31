#!/usr/bin/env node
"use strict";

import { readdir, stat } from "fs/promises";
import child_process from "child_process";
import { promisify } from "util";
import { basename, dirname, join } from "path";
import AutoMap from "auto-creating-map";
import table from "@dwbinns/terminal/table";
import { grey, red, green, cyan, yellow, blue, magenta } from "@dwbinns/terminal/colour";
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
        return "!";
    }
}

async function git(cwd, ...args) {
    return await (await execFile("git", args, { cwd })).stdout.trim();
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

async function getBranchName(repository) {
    return (await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repository }))
        .stdout.trim();
}

async function getRemoteDefault(repository) {
    return (await execFile("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], { cwd: repository }))
        .stdout.trim();
}

async function status() {
    let header = [
        "directory",
        "#A",
        "#M",
        "#D",
        "repository",
        "branch",
        "⇵",
        "↓",
        "↑",
        "↘",
        "↖",
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

        let branch = await getBranchName(cwd).catch((e) => "");

        let repo = (
            await execFile("git", ["config", "--get", "remote.origin.url"], {
                cwd,
            }).catch((e) => e)
        ).stdout.trim();

        commonRepositoryPrefix = commonPrefix(commonRepositoryPrefix ?? repo, repo);

        let fetchStatus = await execFile("git", ["fetch"], { cwd }).then(() => "✓").catch(e => "✕");

        let behind = branch ? await gitLogCount(cwd, "HEAD", "@{u}") : ""
        let ahead = branch ? await gitLogCount(cwd, "@{u}", "HEAD") : "";

        let originDefault = await getRemoteDefault(cwd).catch(e => "");

        let behindDefault = originDefault ? await gitLogCount(cwd, "HEAD", originDefault) : "?";
        let aheadDefault = originDefault ? await gitLogCount(cwd, originDefault, "HEAD") : "?";

        let action = local ? 'commit'
            : ahead > 0 && behind > 0 ? "resolve"
                : behind > 0 ? "pull"
                    : ahead > 0 ? "push"
                        : behindDefault > 0 ? "merge"
                            : aheadDefault > 0 ? "pr"
                                : "ok";

        let detailedAction = {
            commit: `Local files have been modified, run ${cyan("git commit")} to save or ${cyan("git reset --hard")} to lose them`,
            resolve: `The local branch and the remote tracking branch have diverged.
- Merge: ${cyan(`git merge origin/${branch}`)} if commits from both local and remote should be integrated
- Rebase ${cyan(`git rebase origin/${branch}`)} if no-one else is working on this branch
- Force push ${cyan(`git push --force`)} if a local rebase should overwrite the remote commits
- Run ${cyan(`git reset origin/${branch}`)} if you want to replace local commits with the remote commits`,
            pull: `The remote tracking branch has commits which are not present locally. Run ${cyan("git pull")}`,
            push: `The local branch has commits not present in the remote branch. Run ${cyan("git push --follow-tags")}`,
            merge: `The default branch has commits not present in the local branch
- Run ${cyan(`git merge ${originDefault}`)} to merge changes from ${originDefault} into ${branch}
- Run ${cyan(`git rebase ${originDefault}`)} to rebase local commits onto latest changes from ${originDefault}`,
            pr: `Create a PR to merge this branch into the default branch`,
            ok: '',
        }[action];

        let colour = {
            commit: blue,
            resolve: red,
            pull: cyan,
            push: yellow,
            merge: magenta,
            pr: green,
        }[action];

        return [
            name,
            newCount,
            modifiedCount,
            deletedCount,
            repo,
            branch,
            fetchStatus,
            behind,
            ahead,
            behindDefault,
            aheadDefault,
            colour ? colour(action) : action,
            detailedAction
        ];
    });

    rows = rows.flatMap(([
        name,
        newCount,
        modifiedCount,
        deletedCount,
        repo,
        branch,
        fetchStatus,
        behind,
        ahead,
        behindDefault,
        aheadDefault,
        action,
        detailedAction]) => [[
            name,
            newCount,
            modifiedCount,
            deletedCount,
            repo.slice(commonRepositoryPrefix.length),
            branch,
            fetchStatus,
            behind,
            ahead,
            behindDefault,
            aheadDefault,
            action,
        ], [grey(detailedAction)]]
    );

    console.log(table([header, ...rows], {header: 'underline'}));
    console.log(grey(`
Number of local files: #A = added, #M = modified, #D = deleted; ⇵ = fetch status
Number of commits compared with remote branch: ↓ = to pull; ↑ = to push.
Number of commits compared with default branch: ↖ = to merge into default branch; ↘ = to merge into your branch
Repository prefix: ${blue(commonRepositoryPrefix)}
    `));
    return 0;
}

status.help = `
Show status including recommended action for each repository.
`;

async function outputEachRepo(callback) {
    let results = await forEachRepo(async (name, cwd) =>
        underline(cyan(name)) + "\n" + await callback(name, cwd)
    );

    console.log(results.join("\n"));
}

async function run(command, ...args) {
    return await outputEachRepo(async (name, cwd) =>
        (await execFile(command, args, { cwd })).stdout.trim()
    );
}

run.command = "<command> <args> ...";
run.help = `
Run a command in each git directory, eg:
all-git run jq .version package.json
`;


async function branch(branchName) {
    await run("git", "checkout", "-b", branchName);
    await run("git", "push", "-u", "origin", "HEAD");
}

branch.command = "<new-branch-name>";
branch.help = `
Create a new branch in each git directory,
configure tracking and push to same named branch in origin remote
`;
async function checkout(branchName) {
    await outputEachRepo(async (name, cwd) =>
        await git(cwd, "checkout", branchName || (await getRemoteDefault(cwd)).replace(/^[^/]*\//, ''))
    );

}

checkout.command = "<existing-branch-name>";
checkout.help = `
Create an existing branch in each git directory.
`;

async function push() {
    await run("git", "push");
}

async function pull() {
    await run("git", "pull");
}

async function commit(message) {
    await run("git", "add", "-u");
    await run("git", "commit", "-m", message);
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

let commands = { status, run, commit, branch, checkout, pull, push, help };

(async (command, ...args) => {
    return await (commands[command] || help)(...args) ?? 0;
})(...process.argv.slice(2))
    .catch(console.error)
    .then((code = 1) => (process.exitCode = code));
