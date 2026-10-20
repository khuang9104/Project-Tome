# Project Tome

[English](README.md) · [简体中文](README.zh-CN.md)

**Project memory and living technical knowledge for coding agents.**

Project Tome preserves what your project is meant to do, why its design decisions were
made, and how the implementation works. It keeps requirements, decisions,
architecture, methods, interfaces and data definitions in versioned project
documents, so an Agent can resume work with relevant context and people can look
up, maintain or hand over the project.

Built for **Codex and GitHub Copilot in VS Code**. Repository-local files, shared
Agent instructions and lightweight Node.js helpers support local and offline work.

[Features](#features) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Documentation](#documentation)

## Features

| Capability | What is maintained | What it helps with |
| --- | --- | --- |
| **Project memory** | Needs, business terms, constraints, decisions and reasons, corrections and unfinished work. | Resume work without repeatedly explaining the project. |
| **Implementation knowledge** | Architecture, module behavior, methods and parameters, results and errors, interface fields, enums and database definitions. | Understand the code, maintain integrations and hand over the project. |
| **Relevant context** | Canonical document owners, source links, module relationships, aliases and searchable explanations. | Find the context needed for the current task. |
| **Incremental maintenance** | Documents affected by development and the proposed commit snapshot. | Keep changed knowledge current while unrelated historical gaps remain progressive. |

Each fact has one canonical owner. Existing documents can stay in place. First
adoption indexes all maintained modules, explains important ones first and marks
remaining detail gaps explicitly. Database knowledge follows design and repository
ORM/schema/migrations, with existing monitoring records as supporting sources.

## Quick start

You need Git, Node.js and a coding Agent with access to the target project.
Open that project in Codex or Copilot Agent mode, supply the distribution directory,
and ask:

```text
Set up or update Project Tome in this project from the supplied distribution.
Preserve existing documents, project identity, custom Skills and Agent instructions.
Index all maintained modules, explain the important ones and mark historical gaps.
Record needs and design decisions during work; before a commit, complete knowledge
affected by the staged changes. Follow CONFIGURE_WITH_AGENT.md and verify the result.
```

Follow the [setup and update guide](CONFIGURE_WITH_AGENT.md) for the complete procedure.
Current version: **0.12.0**. Use a verified distribution at an exact source commit;
a matching local checkout works offline.

## How it works

1. **Recover context.** Read the relevant intent, design and module documents before
   interpreting a task. A short continuity entry links the current goal and unfinished work.
2. **Record conclusions.** Maintain material needs, corrections and design reasons
   during discussion and coding, keeping confirmed decisions distinct from assumptions.
3. **Explain implementation.** Use design, actual code and native project tools to
   maintain methods, interfaces and data rules with source references.
4. **Reconcile before commit.** Compare HEAD with the staged snapshot, inspect actual
   consumers and complete affected knowledge. Missing or stale affected knowledge
   blocks readiness; unrelated historical gaps do not require a full rebuild.

Testing follows the Agent's judgment and native project rules. Mechanical checks
verify document freshness and supported exact contracts; the Agent still reviews
meaning and actual impact. The file inventory is not a universal AST extractor.

## Working with project knowledge

In an adopted project, query a method or field and check knowledge coverage:

```sh
node .agents/skills/accord/scripts/accord-project.mjs --project . --query "method or field"
node .agents/skills/accord/scripts/accord-validate.mjs --project . --scope knowledge
```

For semantic review, staging and incremental commit checks, follow the installed
[commit procedure](payload/.agents/skills/accord/references/commit-knowledge.md).
It uses index contents without mixing in unstaged code. Local Git hook activation
is explicit and preserves existing hooks; Git can bypass local hooks.

## Documentation

| Read this | For |
| --- | --- |
| [Setup and updates](CONFIGURE_WITH_AGENT.md) | Install or merge Project Tome while preserving project content. |
| [Shared Skill](payload/.agents/skills/accord/SKILL.md) | The common workflow for supported Agents. |
| [Project memory](payload/.agents/skills/accord/references/project-memory.md) | Record evolving needs, decisions and continuity. |
| [Detailed knowledge](payload/.agents/skills/accord/references/project-knowledge.md) | Modules, methods, interface fields and database definitions. |
| [Knowledge retrieval](payload/.agents/skills/accord/references/knowledge-query-and-refresh.md) | Select relevant context and refresh affected owners. |
| [Knowledge delivery](payload/.agents/skills/accord/references/knowledge-delivery.md) | Optional source-free exports for handoff. |

## Package

The payload/ directory contains copyable runtime files, knowledge seeds and marked
Agent entry blocks. RELEASE.json and SHA256SUMS identify its file set. Schema versions
are configuration **1.0** and knowledge **2.0**. Existing knowledge IDs, document paths
and refs are preserved by the migration proposal.

Package checks do not establish document meaning or deployed behavior. Database
knowledge can be maintained from repository definitions without live access.
The optional [Copilot setup plugin](plugins/project-tome/README.md) pins its verified
distribution by full commit and package digest. Plugin updates and project updates
are separate operations.

For upgrade compatibility, `.accord` paths, `accord-*` helpers and the `accord`
and `accord-project` Skill names remain stable. Historical installation commits
and checksums stay intact; the new plugin ID is `project-tome`.

## License

[MIT](LICENSE). Retained third-party sources keep their upstream notices.
Independent project; not affiliated with or endorsed by GitHub.
