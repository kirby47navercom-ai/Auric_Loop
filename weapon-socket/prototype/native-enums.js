import {nativeTypeSnapshot,indexedNativeEnum} from './native-type-index.js';
// Reflected enum declarations use a bounded integer expression parser. User
// C++/JavaScript expressions are never evaluated by the editor.
const identifier = value => typeof value==='string' && /^[A-Za-z_]\w*$/.test(value);
const qualified = value => typeof value === 'string' && value.split('::').every(identifier);
const I32 = 2147483647n, U32 = 4294967295n;
const limits = {int: [32, false], signed: [32, false], 'signed int': [32, false], unsigned: [32, true], 'unsigned int': [32, true],
  int8_t: [8, false], uint8_t: [8, true], int16_t: [16, false], uint16_t: [16, true], int32_t: [32, false], uint32_t: [32, true],
  'signed char': [8, false], 'unsigned char': [8, true], short: [16, false], 'short int': [16, false], 'unsigned short': [16, true], 'unsigned short int': [16, true]};
const fail = message => { throw Error('C++ enum: ' + message); };
const enabled = (map, key) => map.has(key) && ![false, 'false', '0'].includes(map.get(key));
function label(map, key, fallback = '') { const value = map.get(key); if (value === undefined) return fallback; if (typeof value !== 'string') fail(key + '에는 문자열이 필요해요.'); return value; }
function tokens(source) {
  const out = []; let at = 0;
  while (at < source.length) {
    const start = at, rest = source.slice(at);
    if (/\s/.test(source[at])) { at++; continue; }
    if (rest.startsWith('//')) { at = source.indexOf('\n', at); if (at < 0) break; continue; }
    if (rest.startsWith('/*')) { const end = source.indexOf('*/', at + 2); if (end < 0) fail('닫는 주석이 없어요.'); at = end + 2; continue; }
    if (source[at] === '#') { do { const end = source.indexOf('\n', at); if (end < 0) { at = source.length; break; } const continued = source.slice(at, end).trimEnd().endsWith('\\'); at = end + 1; if (!continued) break; } while (at < source.length); continue; }
    const raw = rest.match(/^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(/);
    if (raw) { const end = source.indexOf(')' + raw[1] + '"', at + raw[0].length); if (end < 0) fail('닫는 raw string이 없어요.'); at = end + raw[1].length + 2; out.push({kind: 'string', text: source.slice(start, at), start, end: at}); continue; }
    const quote = rest.match(/^(?:u8|u|U|L)?(["'])/);
    if (quote) { at += quote[0].length; let closed = false; while (at < source.length) { const c = source[at++]; if (c === '\\') at++; else if (c === quote[1]) { closed = true; break; } } if (!closed) fail('닫는 문자열이 없어요.'); out.push({kind: quote[1] === '"' ? 'string' : 'character', text: source.slice(start, at), start, end: at}); continue; }
    const name = rest.match(/^[A-Za-z_]\w*/), number = rest.match(/^(?:0[xX][\da-fA-F']+|0[bB][01']+|\d[\d']*)[uUlL]*/);
    if (name || number) { const text = (name || number)[0]; at += text.length; out.push({kind: name ? 'id' : 'number', text, start, end: at}); continue; }
    const pair = ['::', '<<', '>>'].find(value => rest.startsWith(value)); at += pair ? 2 : 1; out.push({kind: 'punct', text: pair || source[start], start, end: at});
  }
  return out;
}
function closeIndex(list, start, left = '(', right = ')') {
  let depth = 0; for (let i = start; i < list.length; i++) { if (list[i].text === left) depth++; if (list[i].text === right && --depth === 0) return i; }
  fail('닫는 ' + right + '가 없어요.');
}
function parts(list) {
  const result = []; let from = 0, depth = 0;
  for (let i = 0; i < list.length; i++) { if (['(', '[', '{'].includes(list[i].text)) depth++; if ([')', ']', '}'].includes(list[i].text)) depth--; if (list[i].text === ',' && depth === 0) { result.push(list.slice(from, i)); from = i + 1; } }
  if (from < list.length) result.push(list.slice(from)); return result.filter(value => value.length);
}
function stringValue(token) {
  if (token?.kind !== 'string') fail('메타데이터 문자열을 확인하세요.');
  const raw = token.text.match(/^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(([\s\S]*)\)\1"$/); if (raw) return raw[2];
  try { return JSON.parse(token.text.replace(/^(?:u8|u|U|L)(?=")/, '')); } catch { fail('메타데이터에는 JSON 호환 문자열 이스케이프를 사용하세요.'); }
}
function metadata(list, result = new Map()) {
  for (const field of parts(list)) {
    const key = field[0]?.text.toLowerCase(); if (!identifier(field[0]?.text || '')) fail('메타데이터 이름을 확인하세요.');
    if (key === 'meta' && field[1]?.text === '=' && field[2]?.text === '(' && field.at(-1)?.text === ')') { metadata(field.slice(3, -1), result); continue; }
    const value = field.length === 1 ? true : field.length === 3 && field[1].text === '=' ? field[2].kind === 'string' ? stringValue(field[2]) : field[2].text : undefined;
    if (value === undefined) fail('메타데이터 값을 확인하세요.'); result.set(key, value);
  }
  return result;
}
const numeric = (value, unsigned = false, bits = 32) => ({value, unsigned, bits});
function literal(text) {
  const match = text.replaceAll("'", '').match(/^(0[xX][\da-fA-F]+|0[bB][01]+|\d+)([uUlL]*)$/); if (!match) fail('정수 리터럴을 확인하세요.');
  const suffix = match[2].toLowerCase(); if (!['', 'u', 'll', 'ull', 'llu'].includes(suffix)) fail('이식 가능한 enum 값에는 U/LL/ULL 접미사를 사용하세요.');
  let digits = match[1]; if (/^0\d/.test(digits)) { if (!/^0[0-7]+$/.test(digits)) fail('8진수 리터럴을 확인하세요.'); digits = '0o' + digits.slice(1); }
  const value = BigInt(digits), unsigned = suffix.includes('u'), explicit64 = suffix.includes('ll'), nondecimal = /^0[xXbBoO]/.test(digits);
  let bits = explicit64 || value > (unsigned || nondecimal ? U32 : I32) ? 64 : 32;
  let sign = unsigned || !explicit64 && nondecimal && value > I32 && value <= U32;
  if (value > (sign ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n)) { if (!nondecimal || bits === 32) fail('64비트 정수 리터럴 범위를 넘었어요.'); sign = true; if (value > (1n << 64n) - 1n) fail('64비트 정수 리터럴 범위를 넘었어요.'); }
  return numeric(value, sign, bits);
}
function arithmetic(value, unsigned, bits, bitwise = false) {
  if (unsigned) return numeric(BigInt.asUintN(bits, value), true, bits);
  if (bitwise) return numeric(BigInt.asIntN(bits, value), false, bits);
  if (value < -(1n << BigInt(bits - 1)) || value > (1n << BigInt(bits - 1)) - 1n) fail('부호 있는 정수 표현식이 넘쳤어요.'); return numeric(value, false, bits);
}
function common(a, b) { const bits = Math.max(a.bits, b.bits), unsigned = a.bits === b.bits ? a.unsigned || b.unsigned : (a.bits > b.bits ? a : b).unsigned; return {bits, unsigned}; }
const precedence = {'|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6};
function expression(list, lookup) {
  if (!list.length || list.length > 4096) fail('값 표현식의 크기를 확인하세요.'); let at = 0;
  const parse = (level = 0, depth = 0) => {
    if (depth > 64) fail('값 표현식의 괄호 깊이를 확인하세요.'); let value, token = list[at++];
    if (!token) fail('값 표현식이 비어 있어요.');
    if (['+', '-', '~'].includes(token.text)) { const next = parse(7, depth + 1); value = token.text === '+' ? next : arithmetic(token.text === '-' ? -next.value : ~next.value, next.unsigned, next.bits, token.text === '~'); }
    else if (token.text === '(') { value = parse(0, depth + 1); if (list[at++]?.text !== ')') fail('값 표현식의 괄호를 확인하세요.'); }
    else if (token.kind === 'number') value = literal(token.text);
    else if (token.kind === 'id') { let name = token.text; while (list[at]?.text === '::') { if (list[at + 1]?.kind !== 'id') fail('상수의 범위를 확인하세요.'); name += '::' + list[at + 1].text; at += 2; } value = lookup.get(name); if (!value) fail('지원하지 않는 정수 상수: ' + name); }
    else fail('지원하지 않는 값 표현식: ' + token.text);
    while (at < list.length) {
      const op = list[at].text, rank = precedence[op]; if (rank === undefined || rank < level) break; at++; const right = parse(rank + 1, depth + 1);
      if (op === '<<' || op === '>>') { if (right.value < 0 || right.value >= BigInt(value.bits) || op === '<<' && !value.unsigned && value.value < 0) fail('시프트 횟수·부호를 확인하세요.'); value = arithmetic(op === '<<' ? value.value << right.value : value.value >> right.value, value.unsigned, value.bits, true); continue; }
      const type = common(value, right), a = type.unsigned ? BigInt.asUintN(type.bits, value.value) : value.value, b = type.unsigned ? BigInt.asUintN(type.bits, right.value) : right.value;
      if ((op === '/' || op === '%') && (b === 0n || !type.unsigned && a === -(1n << BigInt(type.bits - 1)) && b === -1n)) fail('정수 나눗셈 범위를 확인하세요.');
      const next = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : op === '%' ? a % b : op === '|' ? a | b : op === '&' ? a & b : a ^ b;
      value = arithmetic(next, type.unsigned, type.bits, ['|', '&', '^'].includes(op));
    }
    return value;
  };
  const result = parse(); if (at !== list.length) fail('값 뒤의 지원하지 않는 표현식을 확인하세요.'); return result;
}
function scopesFor(list) {
  const opens = new Map();
  for (let i = 0; i < list.length; i++) {
    if (list[i].text === 'namespace') { let j = i + 1, names = []; while (list[j]?.kind === 'id' || list[j]?.text === '::') { if (list[j].kind === 'id') names.push(list[j].text); j++; } if (list[j]?.text === '{') opens.set(j, {kind: 'namespace', names, anonymous: !names.length}); }
    if (['class', 'struct'].includes(list[i].text) && list[i - 1]?.text !== 'enum' && list[i + 1]?.kind === 'id' && ['{', ':', 'final'].includes(list[i + 2]?.text)) { let j = i + 2; while (j < list.length && !['{', ';'].includes(list[j].text)) j++; if (list[j]?.text === '{') opens.set(j, {kind: 'class', names: [list[i + 1].text]}); }
  }
  return opens;
}
function wireValue(value, underlying) {
  const min = underlying.unsigned ? 0n : -2147483648n, max = underlying.unsigned === null ? U32 : underlying.unsigned ? (1n << BigInt(underlying.bits)) - 1n : (1n << BigInt(underlying.bits - 1)) - 1n;
  const low = underlying.unsigned === false ? -(1n << BigInt(underlying.bits - 1)) : min;
  if (value < low || value > max) fail('공개 enum의 32비트 저장 범위를 넘었어요.'); return Number(BigInt.asIntN(32, value));
}
export function parseNativeEnums(source, {sourcePath = ''} = {}) {
  if (typeof source !== 'string' || source.length > 1000000) fail('헤더 크기를 확인하세요.'); if (!source.includes('HB_ENUM')) return [];
  if (typeof sourcePath !== 'string' || sourcePath.length > 2000) fail('선언 소스 경로를 확인하세요.');
  const list = tokens(source), opens = scopesFor(list), scope = [], result = [], names = new Set(), known = new Map(), lines = [0]; for (let i = 0; i < source.length; i++) if (source[i] === '\n') lines.push(i + 1);
  const lineAt = offset => { let low = 0, high = lines.length; while (low < high) { const middle = low + high >>> 1; if (lines[middle] <= offset) low = middle + 1; else high = middle; } return low; };
  for (let i = 0; i < list.length; i++) {
    const token = list[i]; if (token.text === '{') { scope.push(opens.get(i) || {kind: 'local', names: []}); continue; } if (token.text === '}') { scope.pop(); continue; }
    if (token.text !== 'HB_ENUM') continue; if (scope.some(item => item.kind === 'local' || item.anonymous)) fail('공개 enum은 이름 있는 namespace·class 또는 전역에 선언하세요.');
    if (list[i + 1]?.text !== '(') fail('HB_ENUM 괄호를 확인하세요.'); const metaEnd = closeIndex(list, i + 1), flags = metadata(list.slice(i + 2, metaEnd)); let at = metaEnd + 1;
    if (list[at++]?.text !== 'enum') fail('HB_ENUM 뒤에 enum 선언이 필요해요.'); const scoped = ['class', 'struct'].includes(list[at]?.text); if (scoped) at++; if (list[at]?.kind !== 'id') fail('enum 이름을 확인하세요.');
    const shortName = list[at++].text, name = [...scope.flatMap(item => item.names), shortName].join('::'); if (names.has(name)) fail('중복된 enum: ' + name); names.add(name);
    let raw = ''; if (list[at]?.text === ':') { at++; while (at < list.length && list[at].text !== '{') { if (list[at].text === ';') fail('공개 enum에는 정의가 필요해요.'); raw += (raw && list[at].kind === 'id' && list[at - 1]?.kind === 'id' ? ' ' : '') + list[at++].text; } }
    const base = raw.replace(/^(?:std|hb)::/, ''), info = raw ? limits[base] : scoped ? limits.int : [32, null]; if (!info) fail('공개 enum 기반형은 8/16/32비트 고정 정수형을 사용하세요: ' + raw);
    if (list[at]?.text !== '{') fail('enum 정의의 중괄호를 확인하세요.'); const end = closeIndex(list, at, '{', '}'), underlying = {cpp: raw || (scoped ? 'int' : ''), bits: info[0], unsigned: info[1]}, lookup = new Map(known), entries = [], entryNames = new Set(); let previous = -1n;
    for (const field of parts(list.slice(at + 1, end))) {
      if (field[0]?.kind !== 'id') fail('enum 항목 이름을 확인하세요.'); const entryName = field[0].text; if (entryNames.has(entryName)) fail('중복된 enum 항목: ' + entryName); entryNames.add(entryName);
      const clean = [field[0]], entryFlags = new Map(); for (let j = 1; j < field.length; j++) { if (['HB_ENUM_VALUE', 'HB_META'].includes(field[j].text)) { if (field[j + 1]?.text !== '(') fail('항목 메타데이터 괄호를 확인하세요.'); const last = closeIndex(field, j + 1); metadata(field.slice(j + 2, last), entryFlags); j = last; } else clean.push(field[j]); }
      const computed = clean.length === 1 ? numeric(previous + 1n, underlying.unsigned === true && underlying.bits === 32) : clean[1].text === '=' ? expression(clean.slice(2), lookup) : fail('enum 항목의 대입을 확인하세요.');
      const value = wireValue(computed.value, underlying), entry = {name: entryName, label: label(entryFlags, 'displayname', entryName), tooltip: label(entryFlags, 'tooltip'), value, numericValue: Number(computed.value), hidden: enabled(entryFlags, 'hidden'), line: lineAt(field[0].start)}; previous = computed.value; entries.push(entry);
      const promoted = numeric(computed.value, underlying.unsigned === true && underlying.bits === 32 || underlying.unsigned === null && computed.unsigned, Math.max(32, underlying.bits)); lookup.set(entryName, promoted); lookup.set(shortName + '::' + entryName, promoted); lookup.set(name + '::' + entryName, promoted); known.set(name + '::' + entryName, promoted);
    }
    if (!entries.length || underlying.unsigned === null && entries.some(entry => entry.numericValue < 0) && entries.some(entry => entry.numericValue > Number(I32))) fail('하나의 32비트 기반형으로 표현할 수 없는 enum이에요.');
    const cppNamespace=scope.filter(item=>item.kind==='namespace').flatMap(item=>item.names);
    result.push({name, sourcePath,...scope.some(item=>item.kind==='class')&&cppNamespace.length?{cppNamespace}:{}, label: label(flags, 'displayname', shortName), tooltip: label(flags, 'tooltip'), scoped, blueprintType: enabled(flags, 'blueprinttype'), flags: enabled(flags, 'bitflags'), maskValues: enabled(flags, 'useenumvaluesasmaskvaluesineditor'), underlying, entries, line: lineAt(token.start)}); i = end;
  }
  return result;
}
export function validNativeEnum(value) {
  try {
    return !!(value && (value.cppNamespace===undefined||Array.isArray(value.cppNamespace)&&value.cppNamespace.length<=32&&value.cppNamespace.every(identifier)) && qualified(value.name) && typeof value.sourcePath === 'string' && value.sourcePath.length <= 2000 && typeof value.label === 'string' && typeof value.tooltip === 'string' && typeof value.scoped === 'boolean' && typeof value.blueprintType === 'boolean' && typeof value.flags === 'boolean' && typeof value.maskValues === 'boolean' && typeof value.underlying?.cpp === 'string' && [8, 16, 32].includes(value.underlying.bits) && [true, false, null].includes(value.underlying.unsigned) && (value.underlying.unsigned!==null||value.underlying.bits===32&&!value.underlying.cpp) && Array.isArray(value.entries) && value.entries.length > 0 && new Set(value.entries.map(entry => entry?.name)).size === value.entries.length && !(value.underlying.unsigned === null && value.entries.some(entry => entry?.numericValue < 0) && value.entries.some(entry => entry?.numericValue > Number(I32))) && value.entries.every(entry => entry && identifier(entry.name) && typeof entry.label === 'string' && typeof entry.hidden === 'boolean' && Number.isInteger(entry.value) && entry.value >= -2147483648 && entry.value <= 2147483647 && Number.isInteger(entry.numericValue) && entry.numericValue >= -2147483648 && entry.numericValue <= 4294967295 && wireValue(BigInt(entry.numericValue), value.underlying) === entry.value));
  } catch { return false; }
}
export function nativeEnumDefinition(metadata, pin) { if(nativeTypeSnapshot(metadata))return indexedNativeEnum(metadata,pin?.enumName,pin?.enumSource);let match=null;for(const value of metadata?.enums||[]){if(value.name!==pin?.enumName||pin.enumSource!==undefined&&value.sourcePath!==pin.enumSource)continue;if(match)return null;match=value;}return match; }
export function validNativeEnumValue(definition, value) {
  if(!definition)return false;
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) return false;
  const {bits, unsigned} = definition.underlying;
  if (bits === 32) return true;
  return unsigned ? value >= 0 && value < 2 ** bits : value >= -(2 ** (bits - 1)) && value < 2 ** (bits - 1);
}
export function validNativeEnumPin(metadata,pin,value,{deferred=false,runtime=false}={}) {
  if(pin.maskEnumName!==undefined){const mask=nativeEnumDefinition(metadata,{enumName:pin.maskEnumName});if(pin.type!=='int'||!qualified(pin.maskEnumName)||(!mask?!deferred:!mask.flags))return false;}
  if(pin.enumName===undefined)return pin.enumSource===undefined;
  if(pin.type!=='int'||!qualified(pin.enumName))return false;
  const definition=nativeEnumDefinition(metadata,pin);
  if(!definition)return deferred;
  const array=pin.array||pin.container==='array';
  return array?Array.isArray(value)&&value.length<=(runtime?100000:128)&&value.every(value=>validNativeEnumValue(definition,value)):validNativeEnumValue(definition,value);
}
export const nativeEnumMask=(definition,entry)=>definition.maskValues?entry.value>>>0:entry.value>=0&&entry.value<32?(1<<entry.value)>>>0:0;
export function nativeEnumInitializer(text, definition, array = false) {
  const lookup = new Map(); for (const entry of definition.entries) { const value = numeric(BigInt(entry.numericValue), definition.underlying.unsigned === true && definition.underlying.bits === 32); for (const name of [entry.name, definition.name + '::' + entry.name, definition.name.split('::').at(-1) + '::' + entry.name]) lookup.set(name, value); }
  const read = list => { if (list[0]?.text === '{' && closeIndex(list, 0, '{', '}') === list.length - 1) list = list.slice(1, -1); if (!list.length) return 0; return wireValue(expression(list, lookup).value, definition.underlying); };
  let list = tokens(text); if (list[0]?.kind === 'id') { let i = 1; while (list[i]?.text === '::' && list[i + 1]?.kind === 'id') i += 2; const name = list.slice(0, i).map(token => token.text).join(''); if ([definition.name, definition.name.split('::').at(-1)].includes(name) && list[i]?.text === '{') list = list.slice(i); }
  if (!array) return read(list); if (list[0]?.text !== '{' || closeIndex(list, 0, '{', '}') !== list.length - 1) fail('enum 배열 기본값은 중괄호 목록으로 작성하세요.'); return parts(list.slice(1, -1)).map(read);
}
// Shared, bounded declaration lexing for the other reflected value types. This
// remains a metadata parser; the native compiler checks the actual C++ layout.
export const nativeReflectionSyntax=Object.freeze({tokens,metadata,closeIndex,parts,scopesFor,stringValue});
