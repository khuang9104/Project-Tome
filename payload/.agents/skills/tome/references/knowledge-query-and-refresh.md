# Query and refresh

Use tome-project.mjs --project . --query "business term, method or field" for
registered metadata, aliases and bounded body search. Use --modules IDs for direct
context; --impact adds reverse dependency candidates. Results contain owner paths,
match excerpts, relevant intent, refs and gaps. Read those owners; check freshness.
This is bounded literal search, not semantic/vector retrieval.

When absent/stale, inspect source and intent, update affected canonical owners,
and refresh their review/observation after semantic reconciliation. A query can
produce durable knowledge; a new session does not require unrelated rewrites.
Unrelated backlog stays indexed/progressive, affected knowledge is complete at commit.
