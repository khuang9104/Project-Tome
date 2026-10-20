#!/usr/bin/env node
// Read-only exact-contract inspection. No network, subprocesses or file writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const LIMITS = Object.freeze({ bytes: 1024 * 1024, depth: 64, nodes: 20000, output: 2 * 1024 * 1024 });
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const escapePointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const pointerOf = parts => '#' + parts.map(part => '/' + escapePointer(part)).join('');

function restricted(relative) {
  const normalized = relative.toLowerCase().replaceAll('\\', '/');
  return normalized.split('/').some(part => ['.git', '.tome', '.agents', 'node_modules', 'vendor'].includes(part) ||
    /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/.test(part)) ||
    /^\.github\/skills(?:\/|$)/.test(normalized) ||
    /^\.env(?:\.|$)/.test(path.posix.basename(normalized)) || /\.(?:pem|key|p12|pfx)$/.test(normalized);
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
}

export function safeContractPath(project, relative) {
  if (typeof relative !== 'string' || !relative || /[\\:\x00-\x1f]/.test(relative) ||
      path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative ||
      relative === '.' || relative === '..' || relative.startsWith('../')) {
    throw new Error('Contract path must be a normalized project-relative path.');
  }
  if (restricted(relative)) {
    throw new Error('Contract path is a control-plane, dependency or secret source.');
  }
  const root = fs.realpathSync(project);
  const file = fs.realpathSync(path.join(root, ...relative.split('/')));
  const distance = path.relative(root, file);
  if (!distance || distance === '..' || distance.startsWith('..' + path.sep) || path.isAbsolute(distance)) {
    throw new Error('Contract path escapes the project.');
  }
  if (restricted(distance)) throw new Error('Contract target resolves to a control-plane, dependency or secret source.');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > LIMITS.bytes) throw new Error('Contract must be a regular file within the byte budget.');
  return file;
}

function resolvePointer(document, reference) {
  if (reference === '#') return document;
  if (!reference.startsWith('#/')) return undefined;
  let current = document;
  let parts;
  try { parts = decodeURIComponent(reference.slice(2)).split('/'); } catch { return undefined; }
  for (const encoded of parts) {
    if (/~(?:[^01]|$)/.test(encoded)) return undefined;
    const part = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if ((!object(current) && !Array.isArray(current)) || !own(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

// JSON.parse silently collapses duplicate keys and rounds some numeric literals.
// Refuse those inputs rather than certifying two different declarations as equal.
function checkLosslessJson(text) {
  const stack = [];
  function decimal(token) {
    const [mantissa, exponent = '0'] = token.toLowerCase().split('e');
    if (exponent.replace(/^[+-]/, '').length > 8) throw new Error('Numeric exponent exceeds the exact-inspection budget.');
    const sign = mantissa.startsWith('-') ? '-' : '';
    const unsigned = mantissa.replace(/^-/, '');
    const fraction = unsigned.includes('.') ? unsigned.length - unsigned.indexOf('.') - 1 : 0;
    let digits = unsigned.replace('.', '').replace(/^0+/, '');
    if (!digits) return sign + '0';
    let scale = Number(exponent) - fraction;
    const zeros = digits.match(/0+$/)?.[0].length || 0;
    digits = zeros ? digits.slice(0, -zeros) : digits;
    scale += zeros;
    return sign + digits + 'e' + scale;
  }
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|[{}\[\]:,]|true|false|null/g)) {
    const token = match[0];
    const top = stack.at(-1);
    if (token === '{' || token === '[') {
      if (stack.length > LIMITS.depth) throw new Error('Contract exceeds the structural budget.');
      stack.push({ object: token === '{', keys: new Set(), expectsKey: token === '{' });
    }
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ':' && top) top.expectsKey = false;
    else if (token === ',' && top?.object) top.expectsKey = true;
    else if (token.startsWith('"') && top?.object && top.expectsKey) {
      const key = JSON.parse(token);
      if (top.keys.has(key)) throw new Error('Duplicate JSON object keys are not valid exact-contract evidence.');
      top.keys.add(key);
    } else if (match[1] && (!Number.isFinite(Number(token)) || decimal(token) !== decimal(JSON.stringify(Number(token))))) {
      throw new Error('Numeric literal loses precision in this reader; use a lossless format-specific inspection.');
    }
  }
}

export function parseExactJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > LIMITS.bytes) {
    throw new Error('Contract exceeds the byte budget.');
  }
  let document;
  try { document = JSON.parse(text); } catch { throw new Error('Contract must be valid JSON; YAML and executable source are not parsed by this reader.'); }
  checkLosslessJson(text);
  const pending = [{ value: document, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (++visited > LIMITS.nodes || depth > LIMITS.depth) throw new Error('JSON exceeds the structural budget.');
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
    }
  }
  return document;
}

export function inspectContract(text, format) {
  if (!['json-schema', 'openapi-json'].includes(format)) {
    throw new Error('Unsupported contract format: ' + format + '. Supported formats: json-schema, openapi-json. Inspect other formats with an approved method; do not report complete extraction.');
  }
  const document = parseExactJson(text);
  if (format === 'json-schema' && !object(document) && typeof document !== 'boolean') {
    throw new Error('JSON Schema must be an object or boolean.');
  }
  if (format === 'openapi-json' && (!object(document) ||
      !/^3\.[01]\.\d+$/.test(document.openapi || '') || !object(document.info) ||
      (!object(document.paths) && !object(document.webhooks)))) {
    throw new Error('Expected an OpenAPI 3.0/3.1 JSON document with info and paths or webhooks.');
  }
  const facts = [];
  const containers = [];
  const fields = [];
  const enums = [];
  const operations = [];
  const gaps = [];
  let visited = 0;
  function walk(value, parts, depth) {
    if (++visited > LIMITS.nodes || depth > LIMITS.depth) throw new Error('Contract exceeds the structural budget; split by a declared boundary.');
    const pointer = pointerOf(parts);
    if (value === null || typeof value !== 'object') {
      facts.push({ pointer, value });
      return;
    }
    const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value).sort();
    containers.push({ pointer, type: Array.isArray(value) ? 'array' : 'object' });
    if (!keys.length) facts.push({ pointer, value });
    if (object(value)) {
      if (parts.length && own(value, '$id')) gaps.push({ pointer, reason: 'Nested schema resource scope is not resolved; inspect its references separately.' });
      for (const keyword of ['$ref', '$dynamicRef', '$recursiveRef']) {
        if (!own(value, keyword)) continue;
        const reference = value[keyword];
        if (typeof reference !== 'string') {
          gaps.push({ pointer, reason: 'Invalid reference value.' });
        } else if (keyword !== '$ref') {
          gaps.push({ pointer, reason: 'Dynamic/recursive reference resolution is not supported; inspect its scope separately.' });
        } else if (!reference.startsWith('#')) {
          gaps.push({ pointer, reason: 'External reference is not loaded; register and inspect that contract separately.', reference });
        } else if (resolvePointer(document, reference) === undefined) {
          gaps.push({ pointer, reason: 'Local reference or anchor could not be resolved.', reference });
        }
      }
      if (object(value.properties)) {
        for (const name of Object.keys(value.properties).sort()) {
          const schema = value.properties[name];
          fields.push({
            pointer: pointerOf([...parts, 'properties', name]), name,
            required: Array.isArray(value.required) && value.required.includes(name),
            type: object(schema) ? schema.type ?? null : null,
            constraints: schema
          });
        }
      }
      if (Array.isArray(value.enum)) enums.push({ pointer: pointerOf([...parts, 'enum']), values: value.enum });
    }
    for (const key of keys) walk(value[key], [...parts, key], depth + 1);
  }
  walk(document, [], 0);
  if (format === 'openapi-json') {
    for (const surface of ['paths', 'webhooks']) {
      for (const [name, item] of Object.entries(document[surface] || {})) {
        if (!object(item)) continue;
        for (const method of Object.keys(item).sort()) {
          if (!METHODS.has(method) || !object(item[method])) continue;
          const operation = item[method];
          const parameters = new Map();
          for (const parameter of [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
            const key = object(parameter) ? parameter.$ref ?? JSON.stringify([parameter.in, parameter.name]) : JSON.stringify(parameter);
            parameters.set(key, parameter);
          }
          operations.push({
            pointer: pointerOf([surface, name, method]), method: method.toUpperCase(), path: name,
            operation_id: operation.operationId ?? null,
            parameters: [...parameters.values()],
            responses: operation.responses ?? null,
            security: operation.security ?? document.security ?? [],
            request_body: operation.requestBody ?? null
          });
        }
      }
    }
  }
  const canonical = JSON.stringify(ordered(document));
  return {
    schema_version: '1.0', format, status: gaps.length ? 'partial' : 'inspected',
    digest: crypto.createHash('sha256').update(canonical).digest('hex'),
    document: ordered(document), facts, containers, inventory: { fields, enums, operations }, gaps,
    limits: LIMITS,
    limitations: [
      'Inspection preserves declared exact facts; it is not a JSON Schema/OpenAPI validator.',
      'It does not prove project-wide coverage, database/runtime conformance, user approval or reconstructability.',
      'Referenced files are never fetched, executed or followed automatically.'
    ]
  };
}

export function compareContracts(expected, documented) {
  if (expected.format !== documented.format) throw new Error('Cannot compare different contract formats.');
  const left = new Map(expected.facts.map(fact => [fact.pointer, fact.value]));
  const right = new Map(documented.facts.map(fact => [fact.pointer, fact.value]));
  const differences = [];
  const leftContainers = new Map(expected.containers.map(entry => [entry.pointer, entry.type]));
  const rightContainers = new Map(documented.containers.map(entry => [entry.pointer, entry.type]));
  for (const pointer of [...new Set([...leftContainers.keys(), ...rightContainers.keys()])].sort()) {
    if (leftContainers.get(pointer) !== rightContainers.get(pointer)) {
      differences.push({ pointer, kind: 'container-changed', expected: leftContainers.get(pointer) ?? null, actual: rightContainers.get(pointer) ?? null });
    }
  }
  for (const pointer of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    if (!left.has(pointer)) differences.push({ pointer, kind: 'unexpected', actual: right.get(pointer) });
    else if (!right.has(pointer)) differences.push({ pointer, kind: 'missing', expected: left.get(pointer) });
    else if (JSON.stringify(left.get(pointer)) !== JSON.stringify(right.get(pointer))) {
      differences.push({ pointer, kind: 'changed', expected: left.get(pointer), actual: right.get(pointer) });
    }
  }
  return {
    equal: differences.length === 0, differences,
    reference_gaps: [...expected.gaps, ...documented.gaps],
    status: differences.length ? 'mismatch' : expected.gaps.length || documented.gaps.length ? 'partial' : 'matched',
    claim: 'Exact declared-contract comparison only; not semantic acceptance or project coverage.'
  };
}

function cell(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;').replaceAll('`', '&#96;').replaceAll('\r', '&#13;').replaceAll('\n', '&#10;');
}

export function renderContractReference(inspection) {
  const lines = [
    '# Exact contract reference', '',
    'Generated from a declared contract. Business meaning, runtime behavior and approval require separate review.', '',
    'Format: ' + inspection.format + '. Inspection: ' + inspection.status + '.', '',
    '## Declared facts', '',
    '| JSON pointer | Exact value |', '| --- | --- |',
    ...inspection.facts.map(fact => '| ' + cell(fact.pointer) + ' | ' + cell(JSON.stringify(fact.value)) + ' |'),
    '', '## Unresolved references', '',
    ...(inspection.gaps.length ? inspection.gaps.map(gap => '- ' + cell(gap.pointer + ': ' + gap.reason)) : ['No unresolved references were found in this declared document.']),
    '', '## Limits', '', ...inspection.limitations.map(item => '- ' + item), ''
  ];
  const output = lines.join('\n');
  if (Buffer.byteLength(output, 'utf8') > LIMITS.output) throw new Error('Contract reference exceeds the output budget.');
  return output;
}

export function readProjectContract(project, relative, format) {
  const file = safeContractPath(project, relative);
  return { source: relative, ...inspectContract(fs.readFileSync(file, 'utf8'), format) };
}

export function main(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--project', '--source', '--format', '--compare', '--view'].includes(key) ||
        own(values, key) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Usage: tome-contracts.mjs --project <root> --source <relative> --format <json-schema|openapi-json> [--compare <relative>] [--view json|markdown]');
    }
    values[key] = args[index + 1];
  }
  if (!values['--project'] || !values['--source'] || !values['--format']) throw new Error('Project, source and format are required.');
  if (values['--view'] && !['json', 'markdown'].includes(values['--view'])) throw new Error('Unknown view.');
  if (values['--compare'] && values['--view'] === 'markdown') throw new Error('Comparison uses JSON output.');
  const inspection = readProjectContract(values['--project'], values['--source'], values['--format']);
  const result = values['--compare']
    ? compareContracts(inspection, readProjectContract(values['--project'], values['--compare'], values['--format']))
    : inspection;
  const output = values['--view'] === 'markdown' ? renderContractReference(inspection) : JSON.stringify(result, null, 2);
  if (Buffer.byteLength(output, 'utf8') > LIMITS.output) throw new Error('Contract output exceeds the output budget.');
  console.log(output);
  return result.status === 'mismatch' ? 1 : result.status === 'partial' ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
