// Bounded CSV and standard single-sheet XLSX support, using Node built-ins only.
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { AdminContentError, importHeaders } from './admin-content-validation';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 500;
function fail(message: string): never {
  throw new AdminContentError(400, 'INVALID_FILE', message);
}
const utf8 = (b: Buffer) =>
  new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^\uFEFF/, '');
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) fail('Malformed CSV quoting.');
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
      closed = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      closed = false;
      if (rows.length > MAX_ROWS + 2) fail('Maximum 500 question rows.');
    } else {
      if (closed) fail('Unexpected text after a quoted CSV field.');
      cell += c;
    }
  }
  if (quoted) fail('Unclosed CSV quote.');
  if (cell || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipEntries(entries: Record<string, string>, compress = true): Buffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name),
      raw = Buffer.from(value),
      data = compress ? deflateRawSync(raw) : raw,
      crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(compress ? 8 : 0, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(compress ? 8 : 0, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, filename, data);
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function unzip(buffer: Buffer): Map<string, string> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) fail('Invalid XLSX ZIP directory.');
  if (buffer.readUInt16LE(eocd + 4) || buffer.readUInt16LE(eocd + 6))
    fail('Multi-disk archives are unsupported.');
  const count = buffer.readUInt16LE(eocd + 10);
  if (count > 128) fail('Too many workbook parts.');
  let offset = buffer.readUInt32LE(eocd + 16),
    total = 0;
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) fail('Malformed XLSX directory.');
    const flags = buffer.readUInt16LE(offset + 8),
      method = buffer.readUInt16LE(offset + 10),
      crc = buffer.readUInt32LE(offset + 16),
      size = buffer.readUInt32LE(offset + 20),
      expanded = buffer.readUInt32LE(offset + 24),
      length = buffer.readUInt16LE(offset + 28),
      extra = buffer.readUInt16LE(offset + 30),
      comment = buffer.readUInt16LE(offset + 32),
      start = buffer.readUInt32LE(offset + 42);
    if (flags & 1 || ![0, 8].includes(method)) fail('Encrypted or unsupported XLSX compression.');
    total += expanded;
    if (expanded > 8 * 1024 * 1024 || total > 20 * 1024 * 1024)
      fail('Workbook expands beyond the safe size limit.');
    const name = utf8(buffer.subarray(offset + 46, offset + 46 + length));
    if (
      !name ||
      name.includes('..') ||
      name.startsWith('/') ||
      name.includes('\\') ||
      files.has(name) ||
      name.endsWith('.bin')
    )
      fail('Unsafe, duplicate, or macro workbook part.');
    if (buffer.readUInt32LE(start) !== 0x04034b50) fail('Malformed XLSX entry.');
    const dataStart =
      start + 30 + buffer.readUInt16LE(start + 26) + buffer.readUInt16LE(start + 28);
    if (dataStart + size > buffer.length) fail('Truncated XLSX entry.');
    const data = buffer.subarray(dataStart, dataStart + size),
      raw = method === 8 ? inflateRawSync(data, { maxOutputLength: 8 * 1024 * 1024 }) : data;
    if (raw.length !== expanded || crc32(raw) !== crc) fail('Workbook checksum/length mismatch.');
    if (name.endsWith('.xml') || name.endsWith('.rels')) files.set(name, utf8(raw));
    else files.set(name, '');
    offset += 46 + length + extra + comment;
  }
  return files;
}
type Xml = { name: string; attrs: Record<string, string>; children: Xml[]; text: string };
function unescapeXml(value: string): string {
  return value.replace(/&([^&;<]{1,16});|&/g, (entity: string, key: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[key] !== undefined) return named[key];
    if (/^#(?:x[0-9a-f]+|[0-9]+)$/i.test(key ?? '')) {
      const n =
        key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff))
      )
        return String.fromCodePoint(n);
    }
    return fail(`Unsupported XML entity ${entity}.`);
  });
}
function xml(value: string): Xml {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) fail('DTD/entity declarations are unsupported.');
  const root: Xml = { name: 'root', attrs: {}, children: [], text: '' },
    stack = [root];
  let count = 0;
  const tokens: string[] = [];
  for (let position = 0; position < value.length;) {
    if (value[position] !== '<') {
      const next = value.indexOf('<', position);
      const end = next < 0 ? value.length : next;
      tokens.push(value.slice(position, end));
      position = end;
      continue;
    }
    const terminator = value.startsWith('<!--', position)
      ? '-->'
      : value.startsWith('<?', position)
        ? '?>'
        : value.startsWith('<![CDATA[', position)
          ? ']]>'
          : '>';
    const close = value.indexOf(terminator, position + 1);
    if (close < 0 || (terminator === '>' && close - position > 8192))
      fail('Malformed or oversized worksheet XML tag.');
    const end = close + terminator.length;
    tokens.push(value.slice(position, end));
    position = end;
  }
  for (const token of tokens) {
    const parent = stack.at(-1)!;
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;
    if (token.startsWith('<![CDATA[')) {
      parent.text += token.slice(9, -3);
      continue;
    }
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim().split(':').at(-1);
      if (stack.length < 2 || parent.name !== name) fail('Unbalanced worksheet XML.');
      stack.pop();
    } else if (token.startsWith('<')) {
      const match = token.match(/^<([\w:.-]+)([\s\S]*?)(\/?)>$/);
      if (!match) fail('Invalid worksheet XML tag.');
      const attrs: Record<string, string> = Object.create(null);
      const rest = match[2]!.replace(
        /([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g,
        (_s, key: string, v: string) => {
          if (attrs[key] !== undefined) fail('Duplicate XML attribute.');
          attrs[key] = unescapeXml(v.slice(1, -1));
          return '';
        },
      );
      if (rest.trim()) fail('Invalid XML attributes.');
      const child: Xml = { name: match[1]!.split(':').at(-1)!, attrs, children: [], text: '' };
      parent.children.push(child);
      if (++count > 100000 || stack.length > 32) fail('Worksheet XML exceeds limits.');
      if (!match[3]) stack.push(child);
    } else parent.text += unescapeXml(token);
  }
  if (stack.length !== 1) fail('Unclosed worksheet XML.');
  return root;
}
function descendants(node: Xml, name: string): Xml[] {
  return node.children.flatMap((c) => [...(c.name === name ? [c] : []), ...descendants(c, name)]);
}
function strings(node: Xml) {
  return descendants(node, 't')
    .map((n) => n.text)
    .join('');
}
function xlsxRows(buffer: Buffer): string[][] {
  const parts = unzip(buffer);
  const part = (name: string) => {
    const content = parts.get(name);
    if (!content) fail(`Missing workbook part: ${name}`);
    return xml(content);
  };
  const workbook = part('xl/workbook.xml'),
    sheets = descendants(workbook, 'sheet');
  if (sheets.length !== 1) fail('Use one worksheet per import; remove other sheets.');
  const relationships = descendants(part('xl/_rels/workbook.xml.rels'), 'Relationship');
  if (relationships.some((r) => r.attrs.TargetMode === 'External'))
    fail('External workbook links are unsupported.');
  const relationship = relationships.find((r) => r.attrs.Id === sheets[0]!.attrs['r:id']);
  if (!relationship) fail('Worksheet relationship is missing.');
  const target = relationship.attrs.Target ?? '';
  const filename = target.startsWith('/xl/') ? target.slice(1) : `xl/${target}`;
  if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(filename)) fail('Unsupported worksheet path.');
  const worksheet = part(filename);
  if (descendants(worksheet, 'f').length || descendants(worksheet, 'mergeCells').length)
    fail('Remove formulas and merged cells before import.');
  const shared = parts.has('xl/sharedStrings.xml')
    ? descendants(part('xl/sharedStrings.xml'), 'si').map(strings)
    : [];
  const output: string[][] = [];
  const used = new Set<string>();
  for (const row of descendants(worksheet, 'row')) {
    const number = Number(row.attrs.r);
    if (!Number.isInteger(number) || number < 1 || number > MAX_ROWS + 1)
      fail('Maximum 500 question rows.');
    if (output[number - 1]) fail('Duplicate worksheet row.');
    const values: string[] = [];
    for (const cell of row.children.filter((c) => c.name === 'c')) {
      const ref = cell.attrs.r ?? '',
        match = ref.match(/^([A-Z]+)([1-9][0-9]*)$/);
      if (!match || Number(match[2]) !== number || used.has(ref)) fail('Invalid cell reference.');
      used.add(ref);
      let col = 0;
      for (const letter of match[1]!) col = col * 26 + letter.charCodeAt(0) - 64;
      if (col > 50) fail('Too many columns.');
      const value = cell.children.find((c) => c.name === 'v')?.text ?? '';
      if (cell.attrs.t === 's') {
        const index = Number(value);
        if (!/^\d+$/.test(value) || !Number.isInteger(index) || shared[index] === undefined)
          fail('Invalid shared string.');
        values[col - 1] = shared[index]!;
      } else if (cell.attrs.t === 'inlineStr') values[col - 1] = strings(cell);
      else if (!cell.attrs.t || ['n', 'str', 'b'].includes(cell.attrs.t)) values[col - 1] = value;
      else fail('Unsupported cell value; use plain text.');
    }
    output[number - 1] = values;
  }
  return Array.from({ length: output.length }, (_, i) =>
    Array.from({ length: output[i]?.length ?? 0 }, (_, j) => output[i]?.[j] ?? ''),
  );
}
export function parseQuestionFile(filename: string, buffer: Buffer): Record<string, string>[] {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES)
    fail('Upload a non-empty file no larger than 2 MiB.');
  let rows: string[][];
  try {
    if (/\.csv$/i.test(filename)) rows = csvRows(utf8(buffer));
    else if (/\.xlsx$/i.test(filename)) rows = xlsxRows(buffer);
    else return fail('Use a CSV or XLSX file.');
  } catch (error) {
    if (error instanceof AdminContentError) throw error;
    return fail('Malformed or unsupported spreadsheet file.');
  }
  while (rows.length && rows.at(-1)!.every((v) => !v.trim())) rows.pop();
  if (rows.length < 2 || rows.length > MAX_ROWS + 1)
    fail('Include between 1 and 500 question rows.');
  const headers = rows[0]!.map((h) => h.trim());
  if (new Set(headers).size !== headers.length || headers.some((h) => !importHeaders.includes(h)))
    fail('Use unique column headers from the template.');
  if(!headers.includes('chapterCode')&&!headers.includes('topicId')) fail('Missing chapterCode or topicId column.');
  for (const required of [ 'text', 'difficulty', 'optionA', 'optionB', 'correctOption'])
    if (!headers.includes(required)) fail(`Missing column: ${required}`);
  return rows.slice(1).map((row) => {
    if (row.length > headers.length) fail('A row contains more cells than the header.');
    return Object.fromEntries(headers.map((header, i) => [header, row[i] ?? '']));
  });
}
const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function column(n: number): string {
  let s = '';
  for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function xlsxTemplate(rows: string[][] = [importHeaders]): Buffer {
  const worksheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((cell, j) => `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zipEntries({
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': worksheet,
  });
}
