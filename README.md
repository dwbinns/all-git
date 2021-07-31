# Multiple git repository management

A command line tool for managing multiple git repositories

# Installation

```
npm install -g @dwbinns/all-git
```

# Commands

## Status

Summarize status across multiple repositories:

```
> all-git status
        directory #A #M #D   repository branch ↓ ↑ action
                .  1  1  0  all-git.git master 0 0 commit
packages/terminal  0  0  0 terminal.git   main 0 0     ok

Number of local files: #A = added, #M = modified, #D = deleted; Number of commits: ↓ = to pull; ↑ = to push
Repository prefix: git@github.com:dwbinns/
```

## Create branch

Create a tracking branch:

```
> all-git status my-branch-name
```

## Switch branch

Checkout an existing branch:

```
> all-git checkout my-branch-name
```


## Help

Overview help for all commands:

```
> all-git help
all-git status
all-git run <command> <args> ...
all-git branch <new-branch-name>
all-git push
all-git help [<subcommand>]
```

Help for an individual command:
```
all-git help run
all-git run <command> <args> ...

Run a command in each git directory, eg:
all-git run jq .version package.json
```