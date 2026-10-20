# Incremental pre-commit knowledge

1. Inspect HEAD, status and staged diff including renames/deletions. With no HEAD,
   use the initial index. Stage code and matching knowledge; do not incorporate
   unstaged code into committed documentation.
2. Read affected intent/module owners; inspect actual callers, imports, shared
   data/configuration and dynamic boundaries. Dependency candidates are hints.
   Include actually affected consumers with --modules. Reconcile needs, decisions,
   architecture, methods, interfaces and database definitions where applicable.
3. Complete affected gaps and conflicts. Keep unrelated historical gaps. Do not
   rebuild everything or create a change-control record. If explanation remains
   correct after source changes, record the actual semantic review basis instead
   of manufacturing prose edits.
4. After reading meaning, generate candidate review hashes/observations:

       node .agents/skills/tome/scripts/tome-project.mjs --project . --modules IDS --review --staged

   Use --documents IDs for standalone owners. Record candidates only after semantic
   review, with an honest basis; stage metadata and run:

       node .agents/skills/tome/scripts/tome-validate.mjs --project . --scope commit

   Add --modules IDs for affected consumers. This cannot remove direct owners.
   Reads use the index without worktree fallback. Missing/stale affected knowledge
   and exact contract drift block readiness. Repeat after staging changes. Tests
   are chosen by the Agent/project, never by this checker.
5. Commit under the user's authorization/native rules; report observed checks and
   limits. Hashes do not establish semantic completeness.

## Local hook

The shipped .tome/hooks/pre-commit runs the staged check. Activate explicitly:

    node .agents/skills/tome/scripts/tome-hook.mjs --project . --install

Setup refuses existing hooks/configuration: integrate the validator call into the
existing hook and preserve its commands. Copying files does not activate hooks.
Git can bypass hooks; Agent semantic reconciliation remains required. For affected
consumers, an existing hook can append --modules to the reviewed validator call.
