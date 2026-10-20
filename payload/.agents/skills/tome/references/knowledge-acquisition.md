# Acquiring project knowledge

Inspect existing needs, design, docs and Git before adding files. Reuse owners.
Run tome-inventory.mjs --project . for bounded file/category candidates; inspect
truncation and omitted areas. Limits never imply a complete scan. No AST extractor
is provided.

Build the full maintained file-to-module map, hierarchy, responsibilities and known
dependencies. Include configuration, scripts, schemas and migrations. Every exclusion
has a reason. Explain important modules first from actual entry points, call paths,
types and definitions; mark other modules draft with precise remaining gaps.

For a task select relevant intent and implementation owners. Probe callers, data
and dynamic boundaries when the graph is incomplete. Keep source symbols and
observation versions. Record durable findings instead of raw search output. Use
native project tools where useful without introducing a new runtime backend.
