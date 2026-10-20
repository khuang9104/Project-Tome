# Project knowledge model

Configuration 1.0 selects a knowledge 2.0 manifest and documentation policy.
JSON-compatible YAML needs no dependency. Reuse existing documents in place.
Register each canonical owner once; refs point to stable IDs. No fixed document
pack is required per module or change.

## Registry

A manifest contains schema_version 2.0, structure tome-project-knowledge,
knowledge_root, status draft/current, module_files, documents, optional exact_contracts.
A module has id, parent (or null), kinds, literal source_paths, depends_on, status
draft/current, gaps, not_applicable and documents. Longest source prefix wins;
children may refine a parent directory. Duplicate ownership/cycles are invalid.

A document has id, path, topics, refs, requirements, audience, status, sensitivity.
Status is draft, approved-target, observed, gap or retired, independent of freshness.
Optional aliases support project vocabulary. Optional sources bind shared documents
to code; optional gaps declare missing coverage. A review has sha256, substantive
basis, and observation when sources are declared. Module observation binds reviewed
source paths. The --review command prints candidate hashes; inspect meaning before
recording them. Status approved-target never substitutes for human confirmation.

Topics locate meaning, not templates. Combine responsibility, contracts and
source-map when useful. A not_applicable entry requires topic and reason. Policy
can vary by module kind; topic labels do not prove prose complete or true.

## Required depth

Index all maintained modules/source responsibilities, including ordinary internals
not yet explained. Important and affected modules explain execution, dependencies,
all relevant methods/functions, parameter name/type/required/default/range, returns,
errors, side effects and source symbols. Mark remaining coverage gaps explicitly;
never call a partial list complete. Use native language/type/documentation tools
where available and inspect behavior for meaning and dynamic dispatch. Inventory
finds files/categories; it is not a universal AST or complete method extractor.

For interfaces explain protocol/endpoint, direction, inputs/outputs, field types,
optionality/nullability/defaults, enum meanings, ranges, units, errors and compatibility.
Exact executable definitions stay in schemas/types; explanations link them. The
contract helper compares JSON Schema/OpenAPI JSON; unsupported/external refs
remain gaps. Exact comparison does not establish runtime conformance.

For databases start with requirements/design and repository ORM, schema, DDL and
migrations. Explain tables, fields, keys, relationships, indexes, defaults/nullability,
enums, ranges and business meaning. Link existing monitoring scripts and dated
results where useful. Separate target design, code definitions and deployment
observations. No live connection or database introspection is required.

## Coverage

First index all maintained files/modules; explain critical ones and declare specific
historical gaps elsewhere. Update needs/design when conclusions change. At commit
complete affected detail; unrelated gaps stay progressive. Module source observations
and document hashes detect different drift; neither proves semantic completeness.
