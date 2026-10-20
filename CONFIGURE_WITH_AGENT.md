# Install or update Project Tome with an Agent

[English](#english) · [中文](#中文)

## English

Open the target project; use the prompt in [README.md](README.md#quick-start).
For 0.12.0 select a verified source commit or the matching local distribution.
The helper commands below print results; they do not copy files or grant authority.
Replace path/ID examples with inspected values and quote paths containing spaces.

1. Inspect this source's actual full Git revision and clean/dirty state, release
   metadata, guide and scripts. Verify the same package:

   ```sh
   node <distribution>/payload/.agents/skills/tome/scripts/tome-adoption.mjs --mode verify-package --package <distribution>
   ```

2. Inspect target Git, identity, existing docs/Skills and Agent entries. Only current
   Project Tome paths and schemas are supported. Plan:

   ```sh
   node <distribution>/payload/.agents/skills/tome/scripts/tome-adoption.mjs --mode plan --project <target> --package <distribution>
   ```

   Add --previous-package ACTUAL_OLD_PACKAGE for a known three-way baseline.
   Apply authorized merges; preserve project documents and local customizations.
   Change only marked Project Tome blocks in AGENTS.md and Copilot instructions. Downgrade
   or unknown transitions need a decision. Resolve conflicts before recording.
3. Set project identity in .tome/tome.yaml. Register existing knowledge owners,
   replacing draft seed prompts with actual project facts where used. Index all
   maintained modules/source responsibilities; explain important ones and keep
   unrelated historical detail gaps explicit. Preserve durable needs/decisions in
   canonical project documents. Do not convert historical evidence
   into approval or reset unrelated project files/Skills.
4. Generate an installation record with observed source values:

   ```sh
   node <distribution>/payload/.agents/skills/tome/scripts/tome-adoption.mjs --mode record --project <target> --package <distribution> --revision <observed-full-source-commit> --worktree <clean-or-dirty-or-unknown>
   ```

   After success/review write the printed JSON to .tome/installation.json.
   Do not redirect a failed command over an existing record. Source revision means
   distribution commit, not target HEAD. Dirty packages remain dirty provenance.
   Local runtime differences need actual hashes/bases via --local-changes <file>.
5. Verify against that exact package, then inspect knowledge separately:

   ```sh
   node <distribution>/payload/.agents/skills/tome/scripts/tome-adoption.mjs --mode verify-installation --project <target> --package <distribution>
   node <target>/.agents/skills/tome/scripts/tome-validate.mjs --project <target> --scope installation
   node <target>/.agents/skills/tome/scripts/tome-validate.mjs --project <target> --scope knowledge
   ```

   Installation checks do not claim semantic completeness. Knowledge audit can
   remain partial for unrelated historical gaps; affected commit scope cannot.
6. For local hook integration review .tome/hooks/pre-commit, then explicitly run
   tome-hook.mjs --project TARGET --install. Existing hooks/configuration are
   refused: preserve them and integrate the validator call manually. Git can bypass
   hooks; Agent semantic reconciliation before commit is still required.

Follow the installed [shared Skill](payload/.agents/skills/tome/SKILL.md) and
[adoption procedure](payload/.agents/skills/tome/references/adoption-and-update.md).
No hosted service, GitHub account, live database or mandatory testing workflow is
required. Same-project clones retain identity and knowledge. Package hashes prove
file identity, not publisher authenticity or document meaning.

## 中文

在目标项目打开 Agent，提供已核验的 0.12.0 分发目录绝对路径和真实来源提交。
匹配的本地副本可离线使用；复制/构建不会发布版本。以上命令仅输出结果，实际写入按已授权范围执行。

1. 检查同一份来源的真实完整 Git 提交、工作区状态、指南及脚本，用 verify-package
   核对包内容；不把 dirty 的工作区记成 clean，不伪造来源。
2. 检查目标项目已有配置、文档、Skill、Git 和 Agent 指令。使用当前 Project Tome 路径和格式后再 plan，旧版不提供自动迁移。只有确切的旧包才能作为 previous-package；保留项目内容与入口块外的指令，
   处理实际冲突，降级或未知版本转换需要用户决策。
3. 设置项目身份，复用现有文档，建立全部维护源码/模块的索引，详解重要模块，保留无关
   历史细节缺口。保留已撰写的目标、理由和未完成事项，整理进项目记忆。
4. 合并成功后，record 使用真实来源提交和状态生成 JSON；审阅后写入 installation.json。
   不用失败命令覆盖旧记录。已审阅的运行文件定制需提供准确哈希和理由。
5. 针对同一包运行 verify-installation 和 installation 范围检查；knowledge 检查单独报告
   结构与覆盖。历史缺口可保持渐进状态，但本次提交影响的缺口必须补齐。
6. 如需 Git 钩子，先审阅再显式 install；已有钩子需保留并手动整合相同检查。钩子可被
   Git 绕过，Agent 仍要在 commit 前对照暂存快照审阅真实含义和实际消费者。

详情见同一载荷的共享 Skill。数据库主要读设计与仓库定义，不要求在线连接。
测试由 Agent/项目自身规则决定；安装完整性与哈希不等于语义正确或上线行为已验证。
