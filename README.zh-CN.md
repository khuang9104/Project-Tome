# Project Tome

[English](README.md) · [简体中文](README.zh-CN.md)

**面向 Coding Agent 的项目记忆与持续维护的技术知识库。**

Project Tome 把项目要做什么、为什么这样设计、代码如何运作，保存为随项目版本管理的文档。
它持续记录需求和设计理由，维护架构、模块、方法、接口与数据定义，让 Agent 在后续会话中
找回相关上下文，也让开发者能够快速查询、维护和交接项目。

适用于 **Codex 和 VS Code 中的 GitHub Copilot**，通过仓库内的共享指令、项目文档与
轻量 Node.js 工具运行，支持本地离线使用。

[核心能力](#核心能力) · [快速开始](#快速开始) · [工作方式](#工作方式) · [文档](#文档)

## 核心能力

| 能力 | 维护内容 | 带来的帮助 |
| --- | --- | --- |
| **项目记忆** | 需求、业务术语、约束、决策及理由、重要纠正和未完成工作。 | 后续会话能够续接，减少重复解释。 |
| **实现知识** | 架构、模块运作、方法与参数、返回与错误、接口字段、枚举及数据库定义。 | 方便理解代码、维护集成与交接开发。 |
| **相关上下文** | 权威文档位置、源码引用、模块关系、术语别名和可检索的解释。 | 按当前任务找到需要的知识。 |
| **增量维护** | 开发过程中及待提交快照所影响的文档。 | 保持本次变动的知识完整，无关历史缺口逐步补齐。 |

每个事实只有一个权威来源，优先复用现有项目文档。首次接入先索引全部维护模块，再详解
重要模块，其余细节明确标记缺口。数据库知识依据设计与仓库内的 ORM、schema、迁移定义，
已有监控脚本和记录可以补充说明。

## 快速开始

准备 Git、Node.js，以及能够读取项目文件和运行命令的 Coding Agent。
在 Codex 或 Copilot Agent 模式中打开目标项目，提供分发目录，然后请求：

```text
请从我提供的分发目录为当前项目安装或更新 Project Tome。
保留已有文档、项目身份、自定义 Skill 和原有 Agent 指令。
索引全部维护模块，优先详解重要模块，明确其余历史缺口。
工作中及时记录需求和设计决定；commit 前补齐本次暂存变更影响的知识。
按同一来源的 CONFIGURE_WITH_AGENT.md 操作并验证结果。
```

完整操作见[安装与更新指南](CONFIGURE_WITH_AGENT.md)。
当前版本为 **0.12.0**；使用固定来源提交并通过包校验的分发目录，匹配的本地副本可离线使用。

## 工作方式

1. **找回上下文**：先读相关需求、设计和模块文档，通过简短续接入口找回目标与未完成事项。
2. **及时记录结论**：在讨论和编程中维护重要需求、纠正与设计理由，区分已确认决定和假设。
3. **解释实现细节**：依据设计、实际代码和项目原生工具，记录方法、接口与数据规则并链接来源。
4. **提交前增量核对**：比较 HEAD 与暂存快照，检查实际受影响的消费者，补齐相关知识。
   缺失或过期的受影响知识会阻止就绪，无关历史缺口无需全量重建。

测试由 Agent 和项目自身规则决定。机械检查验证文档新鲜度及支持格式的精确契约，说明的
含义与实际影响仍由 Agent 审阅。文件索引并不是通用 AST 提取器。

## 查询与维护项目知识

在已接入 Project Tome 的项目中，可以查询方法或字段，并检查知识覆盖情况：

```sh
node .agents/skills/tome/scripts/tome-project.mjs --project . --query "方法或字段"
node .agents/skills/tome/scripts/tome-validate.mjs --project . --scope knowledge
```

语义审阅、暂存及增量提交检查见[提交前维护流程](payload/.agents/skills/tome/references/commit-knowledge.md)。
检查使用 index 中的内容，不混入未暂存代码。本地 Git 钩子需要显式启用或整合已有钩子，
Git 本身可以绕过本地钩子。

## 文档

| 文档 | 适合查阅的内容 |
| --- | --- |
| [安装与更新](CONFIGURE_WITH_AGENT.md) | 在保留项目内容的前提下接入或合并 Project Tome。 |
| [共享 Skill](payload/.agents/skills/tome/SKILL.md) | 支持的 Agent 共用的维护流程。 |
| [项目记忆](payload/.agents/skills/tome/references/project-memory.md) | 持续记录需求、决策及续接上下文。 |
| [详细知识](payload/.agents/skills/tome/references/project-knowledge.md) | 模块、方法、接口字段及数据库定义。 |
| [知识检索](payload/.agents/skills/tome/references/knowledge-query-and-refresh.md) | 选择相关上下文、刷新受影响文档。 |
| [知识交付](payload/.agents/skills/tome/references/knowledge-delivery.md) | 按需导出不含应用源码的交接知识集。 |

## 分发内容

payload/ 包含可复制的运行文件、知识模板与 Agent 入口块；RELEASE.json 和 SHA256SUMS
标识包内文件。配置版本为 **1.0**，知识版本为 **2.0**。Project Tome 更新保留已有知识 ID、
文档路径与引用关系。

包校验不能证明文档含义完整或上线行为已验证。数据库知识可直接依据仓库定义维护，
不要求现场连接。可选 [Copilot 接入插件](plugins/project-tome/README.md) 使用完整提交和包摘要
锁定已核验的分发；插件更新和目标项目更新分别执行。

运行配置位于 `.tome/tome.yaml`，工具使用 `tome-*`，共享 Skill 为 `tome`，接入 Skill 为
`tome-project`。旧名称、旧路径及旧格式均不受支持，不提供兼容别名或自动迁移。

## 许可证

[MIT](LICENSE)。保留的第三方来源沿用其原有版权与许可声明。
本项目独立维护，与 GitHub 无隶属或背书关系。
