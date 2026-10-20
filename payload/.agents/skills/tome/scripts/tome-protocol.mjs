// Exact portable contracts; product intent belongs in docs/product.md.
export const CONFIG_SCHEMA = '1.0';
export const PROTOCOL_VERSION = '0.12.0';
export const KNOWLEDGE_SCHEMA = '2.0';
export const VALIDATION_SCOPES = new Set(['installation', 'knowledge', 'commit', 'audit']);
export const RETIRED_CONFIG_FIELDS = ['authority', 'risk', 'gates', 'vv', 'work', 'team',
  'changes', 'records', 'capabilities', 'governance', 'version_control', 'information', 'clarification'];
