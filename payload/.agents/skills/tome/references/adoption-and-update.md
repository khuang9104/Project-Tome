# Adoption and update

Use a separate official distribution at an observed full commit, or an offline
package. Inspect guide/scripts, then tome-adoption.mjs --mode verify-package
--package DIR. Checksums bind files, not publisher identity. Report dirty/unknown
provenance. Never seed another adopted project's identity/facts.

Inspect target Git, entries, identity, knowledge and runtime customizations. The
read-only --mode plan --project DIR --package DIR accepts --previous-package DIR
when the actual recorded old package exists. Preserve project docs and surrounding
Agent instructions. JSON arrays are atomic; local runtime conflicts need review.
Apply authorized changes, preserving unrelated Skills/business files. Downgrades
need a decision. Do not repeat approval for an already authorized scope.

Only current Project Tome identities, paths and schemas are supported. Previous
installations have no automatic importer or alias. Treat a requested replacement
as an explicitly scoped fresh adoption; preserve authored project knowledge and
review existing Agent entries rather than running an old migration procedure.

Update only marked AGENTS/Copilot blocks. First adoption indexes all maintained
code, explains critical modules and declares historical gaps. Record actual source
commit/package/worktree with --mode record; write printed record after merging.
Run --mode verify-installation against that same package and tome-validate
--scope installation. Refresh affected knowledge separately. Retired paths are
review candidates; the planner never deletes them automatically.

Hook activation is explicit; see commit-knowledge.md. No service, GitHub or live
database is required. Same-project clones retain identity and knowledge.
