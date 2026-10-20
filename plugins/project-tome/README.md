# Project Tome for Copilot

Set up, inspect or update the repository-local Project Tome workflow from Copilot.
The plugin provides one `tome-project` skill. After setup, the project retains
its own intent, design decisions, implementation knowledge and Project Tome runtime for
use across sessions, machines, Codex and Copilot.

## Install and use

```sh
copilot plugin marketplace add khuang9104/Project-Tome
copilot plugin install project-tome@project-tome
```

Then open your target project and ask:

```text
Use tome-project to set up or update Project Tome in this project with the plugin's
tested distribution. Preserve existing project content and custom rules, resolve
only material conflicts with me, and verify the complete installation.
```

For an inspection without updates:

```text
Use tome-project to report this project's Project Tome version and installation state.
```

Git and Node.js are needed for project adoption. Fetching the pinned distribution
needs network access; an existing matching local checkout works offline. The
plugin does not bundle these prerequisites or install them automatically.

## Updates and boundaries

The plugin has its own version. `skills/tome-project/references/distribution.json`
pins the tested framework release, full commit and package digest. Project
provenance lives in `.tome/installation.json` after adoption.

```sh
copilot plugin marketplace update project-tome
copilot plugin update project-tome
```

This updates only the plugin. Repeat the project setup/update request to merge
the selected release into a project and verify every managed file. There is no
background migration. A newer project is never silently downgraded to the lock.
Users can explicitly select another official release; the Agent reports the
difference from the tested lock.

The plugin contains no hooks, MCP servers or copied third-party skills. It uses
the official distribution's shared procedure.
Uninstalling the plugin leaves adopted projects intact. Instruction adherence
and successful checks do not prove requirement understanding or acceptance.

The marketplace above is maintained in the Project Tome repository. It is not an
Awesome Copilot listing or a claim of upstream approval.

MIT. Independent project; not affiliated with or endorsed by GitHub.

The distribution lock records the exact tested framework commit. Framework updates
are committed and verified first; the plugin lock is then regenerated and committed
separately. A package build alone does not publish a new lock.
