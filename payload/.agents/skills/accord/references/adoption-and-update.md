# Adoption and update

Use a separate official distribution at an observed full commit, or an offline
package. Inspect guide/scripts, then accord-adoption.mjs --mode verify-package
--package DIR. Checksums bind files, not publisher identity. Report dirty/unknown
provenance. Never seed another adopted project's identity/facts.

Inspect target Git, entries, identity, knowledge and runtime customizations. The
read-only --mode plan --project DIR --package DIR accepts --previous-package DIR
when the actual recorded old package exists. Preserve project docs and surrounding
Agent instructions. JSON arrays are atomic; local runtime conflicts need review.
Apply authorized changes, preserving unrelated Skills/business files. Downgrades
need a decision. Do not repeat approval for an already authorized scope.

Run accord-migrate.mjs --project DIR for old schemas. Its read-only proposal preserves
IDs, owners, refs and files. Reconcile durable decisions from retired work/V&V/
governance records into canonical memory before retiring controls. Keep history;
old evidence never becomes automatic semantic approval.

Update only marked AGENTS/Copilot blocks. First adoption indexes all maintained
code, explains critical modules and declares historical gaps. Record actual source
commit/package/worktree with --mode record; write printed record after merging.
Run --mode verify-installation against that same package and accord-validate
--scope installation. Refresh affected knowledge separately. Retired paths are
review candidates; the planner never deletes them automatically.

Hook activation is explicit; see commit-knowledge.md. No service, GitHub or live
database is required. Same-project clones retain identity and knowledge.
