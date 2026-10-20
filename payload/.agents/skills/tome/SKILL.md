---
name: tome
description: Maintain durable project intent and searchable architecture, module, interface and data knowledge while coding with an Agent. Use for onboarding, resuming work, recording decisions, knowledge queries and incremental pre-commit documentation. Skip unrelated questions.
---

# Project Tome

Recover what the user wants, why the design exists, and how the implementation
works from canonical project documents. Each fact has one owner. Latest human
direction can revise earlier decisions; preserve the reason and superseded premise.
Code establishes observed behavior, not the user's intended goal.

## Start with relevant context

Read the installed configuration and manifest, then the closest intent and module
owners. Use tome-project.mjs --project . --query "terms" or --modules IDs to
select context; read those owners and relevant code. Follow refs for necessary
context and inspect gaps before relying on claims. Do not load the whole knowledge
base on every task. In the Project Tome source repository use its AGENTS.md and canonical
product/architecture instead of installing Project Tome into itself.

## Remember during work

Record material needs, terminology, constraints, non-goals, decisions, reasons and
unresolved choices when they emerge. Keep active goals and unfinished work sufficient
for another Agent to resume. Update the canonical owner and link it from the short
continuity entry; avoid transcripts and duplicate specifications. Preserve the
original goal across follow-up questions unless the user replaces it.

Use Confirmed decision:, Proposal:, Assumption: and Open question:. Only human
direction confirms intent. Choose equivalent internals autonomously; ask when a
missing choice changes behavior, contract, data meaning or scope. See
[project-memory.md](references/project-memory.md) for evolving requirements.

## Maintain implementation knowledge

First index the whole repository, explain important modules, and declare the rest
as historical gaps: [knowledge-acquisition.md](references/knowledge-acquisition.md).
For methods, interfaces, fields and database definitions use
[project-knowledge.md](references/project-knowledge.md). Keep intended design and
observed implementation distinct. Update only facts affected by the work.

## Before a commit

Follow [commit-knowledge.md](references/commit-knowledge.md): reconcile this staged
change against HEAD, intent and actual consumers; complete affected knowledge and
stage it with the code. Unrelated historical gaps remain progressive. Missing or
stale affected knowledge blocks readiness. A hash is a freshness check, never a
substitute for reading meaning. Testing is chosen by the Agent and native project
requirements; Project Tome defines no test workflow, risk levels or change contracts.
Commits and external actions follow user authorization and native project rules.

## Other operations

- Adoption and updates: [adoption-and-update.md](references/adoption-and-update.md).
- Query or targeted refresh: [knowledge-query-and-refresh.md](references/knowledge-query-and-refresh.md).
- Writing and ownership: [documentation-writing.md](references/documentation-writing.md).
- Optional source-free handoff: [knowledge-delivery.md](references/knowledge-delivery.md).

Helpers are local, dependency-free Node scripts under scripts/. They print results
unless documented otherwise. Hook installation is opt-in; export writes an explicit
delivery directory. Generated documents and passing checks do not prove semantic
completeness or deployed behavior.
