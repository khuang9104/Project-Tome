---
name: tome-project
description: Set up Project Tome in a project, inspect its installed version, or update its project intent and implementation knowledge workflow. Use when the user asks to adopt, configure, check or upgrade Project Tome; everyday development uses the project's installed Project Tome skill.
---

# Project Tome project setup and updates

Project Tome keeps durable user needs, design decisions, implementation explanations and
project knowledge connected. This plugin supplies the setup entry; the project's
installed Project Tome supplies the engineering workflow. Installing or updating this
plugin does not initialize or update any project.

## Inspect the request

Identify the target project from the user's workspace, not this plugin's cache.
For a version/status question, inspect the target's `.tome/installation.json`
and `.tome/release.json`. If available, use its installed read-only
`tome-adoption.mjs --mode status --project <target>`. Report missing or partial
installation. A status request neither fetches a release nor authorizes writes.

For ordinary development in an adopted project, read its Agent entry files and
`.agents/skills/tome/SKILL.md`; follow its configured knowledge workflow.
Do not introduce a second requirements, documentation or approval system.

## Select one distribution

Read [the distribution lock](references/distribution.json). It records this
plugin's tested framework version, full source commit and SHA256SUMS digest.
Use that distribution for setup/update unless the user specifies another version.
Do not silently switch to `main`, upgrade to an unreviewed release, or downgrade
a newer project just because this plugin carries an older lock.

Use a separate checkout of the lock's official repository at exactly its commit.
Network access is needed to fetch it. An existing local copy of that same source
is also usable offline. Inspect source Git revision and worktree state; verify
the SHA-256 of `SHA256SUMS` against the lock before running package code. Read
`CONFIGURE_WITH_AGENT.md` from the same checkout and inspect the referenced
scripts. Check the complete package using its read-only command:

```text
node <source>/payload/.agents/skills/tome/scripts/tome-adoption.mjs --mode verify-package --package <source>
```

Replace placeholders with inspected, quoted absolute paths. Compare the returned
release version and package digest with the lock. A mismatch stops adoption.
Hashes verify content, not publisher identity or authorization. Missing source
provenance or offline files must be reported, never invented.

If the user explicitly requests a different/latest version, resolve the requested
official source to a full commit, inspect its guide and package, and report that
it differs from this plugin's tested lock. Preserve that exact source throughout
the operation; do not claim it was tested with this plugin.

## Apply the shared procedure

Follow the selected checkout's `CONFIGURE_WITH_AGENT.md` and its referenced
adoption procedure. A setup/update request can authorize conflict-free Project Tome
file merges. Retain user content, custom skills, project identity, engineering
records and entry text outside this framework. Bring only unresolved material choices or
actions outside the user's authorization back to the user. Do not treat plugin
installation as permission for target Git operations or dependency installation.

Use the selected source's plan to account for every managed file. Preserve the
old installation record until the merge and pre-record checks succeed. Record
the actual distribution commit, not the plugin commit or target project's HEAD.
Run that source's `verify-installation` and installation-scope validator; reconcile
partial updates, local exceptions and retired paths before claiming completion.

Report plugin version, requested/installed framework versions, distribution
commit, file verification and unresolved decisions separately. Mechanical checks
do not approve user requirements, generated knowledge or semantic completeness.

## Subsequent updates

Updating the plugin refreshes its entry and distribution lock only. Updating a
project is a separate, user-requested preservative merge with the same postflight
checks. Project version and provenance remain in its installation record.
Removing this plugin leaves adopted project files and history intact; removing
Project Tome from a project is a separate scoped request.

The framework and this plugin lock are committed separately: verify the committed
distribution first, then generate its exact lock. An explicit local package selection
reports its observed revision and dirty state; never invent a new commit lock.

Only current Project Tome identities, `.tome` paths and schemas are supported.
There is no old-name alias or automatic migration adapter.
