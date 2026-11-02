import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type Cell = string | number | boolean | null;
export type Source = {id: string; name: string; sheet: string; headers: string[]; rows: Cell[][]; mapping: string[]; date1904?: boolean; rowNumbers?: number[]};
export type Settings = {dedup: boolean; keys: string[]; keep: 'first' | 'last'; dateColumns: string[]; dateFormat: 'ISO' | 'DMY' | 'MDY'; moneyColumns: string[]};
export type Issue = {row: number; column: string; message: string; source: string; sheet: string; sourceRow: number; outputRow: number; value: Cell};
export type RowOrigin = {source: string; sheet: string; sourceRow: number; inputRow: number};
export type CleanChange = {column: string; before: Cell; after: Cell; kind: 'date' | 'money'};
export type CleanSummary = {dateConverted: number; dateKept: number; moneyConverted: number; moneyKept: number; samples: CleanChange[]};
export const defaultSettings = (): Settings => ({dedup:false, keys:[], keep:'first', dateColumns:[], dateFormat:'ISO', moneyColumns:[]});

const aliases: Record<string, string> = {
  '고객명':'이름','성명':'이름','고객이름':'이름','구매자':'이름','구매자명':'이름','성함':'이름','name':'이름','customer':'이름','customername':'이름',
  'email':'이메일','e-mail':'이메일','이메일주소':'이메일','메일':'이메일','mail':'이메일',
  'date':'날짜','거래일':'날짜','거래일자':'날짜','주문일':'날짜','결제일':'날짜','일자':'날짜','납기일':'날짜','마감일':'날짜',
  'amount':'금액','총액':'금액','결제금액':'금액','매출액':'금액','판매금액':'금액','단가':'금액','가격':'금액','price':'금액','금액':'금액','금액원':'금액',
  'id':'ID','고객번호':'ID','고객id':'ID','주문번호':'ID',
};

export function fold(value: string) {
  return value.normalize('NFC')
    .replace(/[\u00A0\u202F\u2007\u2009\u3000]/g, ' ')
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/[．。]/g, '.')
    .replace(/／/g, '/')
    .replace(/[－—–―]/g, '-')
    .replace(/\uFFE6/g, '₩')
    .replace(/，/g, ',');
}
export function canonical(s: string) {
  const value = fold(s).trim();
  const key = value.toLowerCase().replace(/\s+/g, '').replace(/[()（）[\]【】]/g, '');
  const candidates = [key];
  const withoutUnit = key.replace(/(원|krw|usd|eur)$/i, '');
  if (withoutUnit && withoutUnit !== key) candidates.push(withoutUnit);
  for (const candidate of candidates) if (Object.hasOwn(aliases, candidate)) return aliases[candidate];
  return value;
}
export function sourceMapping(source: Source) {
  return source.mapping.map(value => fold(String(value ?? '')).trim());
}
export function mappedColumns(sources: Source[]) {
  return [...new Set(sources.flatMap(source => sourceMapping(source).filter(Boolean)))];
}
export function suggestedKind(column: string): 'date' | 'money' | null {
  const name = fold(column).trim();
  if (/(날짜|일자|거래일|거래일자|주문일|결제일|납기일|마감일|date)$/i.test(name) || /날짜|일자/.test(name)) return 'date';
  if (/(금액|총액|매출|단가|가격|결제금액|판매금액|amount|price)/i.test(name)) return 'money';
  return null;
}
export function applySuggestions(settings: Settings, sources: Source[]): Settings {
  const columns = mappedColumns(sources);
  const untouched = settings.dateColumns.length === 0 && settings.moneyColumns.length === 0;
  return {
    ...settings,
    keys: settings.keys.filter(column => columns.includes(column)),
    dateColumns: (untouched ? columns.filter(column => suggestedKind(column) === 'date') : settings.dateColumns).filter(column => columns.includes(column)),
    moneyColumns: (untouched ? columns.filter(column => suggestedKind(column) === 'money') : settings.moneyColumns).filter(column => columns.includes(column)),
  };
}
export function reviewGate(issueCount: number, acknowledged: boolean, approved: boolean): 'review' | 'approve' | 'export' {
  if (issueCount > 0 && !acknowledged) return 'review';
  if (!approved) return 'approve';
  return 'export';
}

function headersFor(row: Cell[]) {
  const seen = new Set<string>();
  return row.map((value, i) => {
    const base = fold(String(value ?? '')).trim() || `열 ${i + 1}`;
    let name = base, k = 2;
    while (seen.has(name)) name = `${base} (${k++})`;
    seen.add(name);
    return name;
  });
}
function filledCount(values: Cell[]) {
  return values.filter(value => value !== null && String(value).trim() !== '').length;
}
function fromMatrix(name: string, sheet: string, matrix: Cell[][], baseRow = 1): Source {
  let nonempty = matrix.map((values, i) => ({values, number: i + baseRow})).filter(row => filledCount(row.values) > 0);
  if (!nonempty.length) throw Error(`${name}: 비어 있는 시트입니다.`);
  if (nonempty.length >= 2 && filledCount(nonempty[0].values) === 1 && filledCount(nonempty[1].values) >= 2) nonempty = nonempty.slice(1);
  let width = 0;
  for (const row of nonempty) width = Math.max(width, row.values.length);
  if (width > 100) throw Error('시트당 최대 100열입니다.');
  const headers = headersFor(Array.from({length: width}, (_, i) => nonempty[0].values[i] ?? ''));
  return {id: crypto.randomUUID(), name, sheet, headers, rows: nonempty.slice(1).map(row => headers.map((_, i) => row.values[i] ?? '')), mapping: headers.map(canonical), rowNumbers: nonempty.slice(1).map(row => row.number)};
}
export function decodeCsvBytes(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { return new TextDecoder('euc-kr').decode(bytes); }
}
export async function readFile(file: File): Promise<Source[]> {
  if (file.size > 10 * 1024 * 1024) throw Error('파일당 최대 10MB입니다.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer())).replace(/^\uFEFF/, '');
    const probe = Papa.parse<string[]>(text, {skipEmptyLines: 'greedy', preview: 10});
    const parsed = Papa.parse<string[]>(text, {skipEmptyLines: false, delimiter: probe.meta.delimiter || ','});
    if (parsed.errors.some(error => error.type === 'Quotes')) throw Error(`${file.name}: CSV 따옴표와 열 구분자를 확인해 주세요. 따옴표로 묶은 값 안의 큰따옴표는 두 번 써야 합니다.`);
    if (parsed.data.length > 100001) throw Error('빈 행을 포함해 최대 100,000행의 CSV를 읽을 수 있습니다.');
    const source = fromMatrix(file.name, 'CSV', parsed.data);
    if (source.rows.length > 50000) throw Error('파일당 최대 50,000개의 데이터 행입니다.');
    return [source];
  }
  if (ext !== 'xlsx') throw Error('CSV 또는 XLSX 파일만 지원합니다.');
  const book = XLSX.read(await file.arrayBuffer(), {type: 'array', cellDates: false, cellNF: true});
  const result: Source[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    if (range.e.r > 100000 || range.e.c > 99) throw Error('빈 행 포함 100,000행·100열을 넘는 시트는 나눠서 추가해 주세요.');
    const matrix = XLSX.utils.sheet_to_json<Cell[]>(sheet, {header: 1, raw: true, defval: '', blankrows: true});
    if (!matrix.some(row => row.some(value => value !== '' && value !== null))) continue;
    const source = fromMatrix(file.name, name, matrix, range.s.r + 1);
    if (source.rows.length > 50000) throw Error('시트당 최대 50,000개의 데이터 행입니다.');
    source.date1904 = !!book.Workbook?.WBProps?.date1904;
    source.headers.forEach((header, column) => {
      if (!/^(ID|.*코드|.*번호|우편번호|전화번호)$/i.test(canonical(header))) return;
      source.rows.forEach((row, i) => {
        const cell = sheet[XLSX.utils.encode_cell({r: (source.rowNumbers?.[i] ?? i + 2) - 1, c: range.s.c + column})];
        if (cell?.t === 'n' && typeof cell.z === 'string' && /^0+$/.test(cell.z) && cell.z.length >= 2) row[column] = XLSX.utils.format_cell(cell);
      });
    });
    result.push(source);
  }
  if (!result.length) throw Error('데이터가 없는 통합 문서입니다.');
  return result;
}
function validYmd(y: number, m: number, d: number) {
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function parseDate(value: Cell, format: Settings['dateFormat'], date1904 = false): string | null {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 19000101 && value <= 99991231) {
      return validYmd(Math.floor(value / 10000), Math.floor((value % 10000) / 100), value % 100);
    }
    if (!Number.isFinite(value) || value < (date1904 ? 0 : 1) || value > 2958465 || !date1904 && Math.floor(value) === 60) return null;
    const days = Math.floor(value);
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    const date = new Date(base + (date1904 ? days : days - (days >= 60 ? 1 : 0)) * 86400000);
    if (date.getUTCFullYear() > 9999) return null;
    return date.toISOString().slice(0, 10);
  }
  const text = fold(String(value ?? '')).trim().replace(/\s*[월화수목금토일]요일$/, '').replace(/[.]+\s*$/, '').trim();
  const time = '(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?';
  const iso = text.match(new RegExp(`^(\\d{4})\\s*[-/.]\\s*(\\d{1,2})\\s*[-/.]\\s*(\\d{1,2})${time}$`));
  const korean = text.match(new RegExp(`^(\\d{4})\\s*년\\s*(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일?${time}$`));
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  let y: number, m: number, d: number;
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (korean) { y = Number(korean[1]); m = Number(korean[2]); d = Number(korean[3]); }
  else if (compact) { y = Number(compact[1]); m = Number(compact[2]); d = Number(compact[3]); }
  else {
    const match = text.match(new RegExp(`^(\\d{1,2})\\s*[-/.]\\s*(\\d{1,2})\\s*[-/.]\\s*(\\d{4})${time}$`));
    if (!match || format === 'ISO') return null;
    const a = Number(match[1]), b = Number(match[2]);
    y = Number(match[3]);
    [d, m] = format === 'DMY' ? [a, b] : [b, a];
  }
  return validYmd(y, m, d);
}
export function parseMoney(value: Cell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = fold(String(value ?? '')).trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1).trim(); }
  text = text.replace(/KRW|USD|EUR|₩|\$|€|원정|원/gi, '').replace(/\s+/g, '');
  if (!text) return null;
  if (text.startsWith('+') || text.startsWith('-')) { if (text.startsWith('-')) negative = !negative; text = text.slice(1); }
  if (text.endsWith('+') || text.endsWith('-')) { if (text.endsWith('-')) negative = !negative; text = text.slice(0, -1); }
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) ? negative ? -Math.abs(number) : number : null;
}
export function configurationError(sources: Source[], settings: Settings): string | null {
  if (!sources.length) return '처리할 파일 또는 시트를 선택해 주세요.';
  const columns = mappedColumns(sources);
  if (!columns.length) return '출력 열을 하나 이상 지정해 주세요.';
  for (const source of sources) {
    const mapped = sourceMapping(source).filter(Boolean);
    if (new Set(mapped).size !== mapped.length) return `${source.name} / ${source.sheet}: 여러 원본 열이 같은 출력 열에 연결됐습니다. 출력 이름을 다르게 지정해 주세요.`;
  }
  if (settings.dedup && !settings.keys.length) return '중복 판단 열을 하나 이상 선택해 주세요.';
  if (settings.dedup && settings.keys.some(key => !columns.includes(key))) return '현재 데이터에 없는 중복 판단 열이 있습니다. 기준 열을 다시 선택해 주세요.';
  if (settings.dateColumns.some(column => settings.moneyColumns.includes(column))) return '같은 열에 날짜와 통화 변환을 동시에 적용할 수 없습니다.';
  return null;
}
function currency(value: Cell) {
  if (typeof value === 'number' || value == null || typeof value === 'boolean') return null;
  const text = fold(String(value)).trim();
  const wonSuffix = /원/.test(text) && /\d/.test(text) && (/원정?\s*\)?\s*$/.test(text) || /^\s*원/.test(text));
  const hits = [
    /KRW|₩/i.test(text) || wonSuffix ? 'KRW' : '',
    /USD|\$/i.test(text) ? 'USD' : '',
    /EUR|€/i.test(text) ? 'EUR' : '',
  ].filter(Boolean);
  if (hits.length > 1) return 'MULTI';
  return hits[0] ?? null;
}
function dedupPart(value: Cell) {
  if (typeof value === 'number') return Number.isFinite(value) ? `n:${value}` : '';
  if (typeof value === 'boolean') return `b:${value}`;
  if (value == null) return '';
  const text = fold(String(value)).trim();
  if (!text) return '';
  if (/^-?\d+(?:\.\d+)?$/.test(text) && !/^0\d/.test(text.replace(/^-/, ''))) return `n:${Number(text)}`;
  return `s:${text}`;
}
export function transform(sources: Source[], settings: Settings) {
  const error = configurationError(sources, settings);
  if (error) throw Error(error);
  if (sources.reduce((count, source) => count + source.rows.length, 0) > 50000) throw Error('전체 합계 최대 50,000행입니다.');
  const columns = mappedColumns(sources);
  const currencies: Record<string, Set<string>> = Object.create(null);
  for (const column of settings.moneyColumns) currencies[column] = new Set();
  for (const source of sources) sourceMapping(source).forEach((column, i) => {
    if (!currencies[column]) return;
    for (const row of source.rows) {
      const code = currency(row[i]);
      if (code === 'MULTI') { currencies[column].add('KRW'); currencies[column].add('USD'); }
      else if (code) currencies[column].add(code);
    }
  });
  let count = 0;
  const entries = sources.flatMap(source => source.rows.map((raw, i) => {
    count++;
    const before: Record<string, Cell> = Object.create(null);
    columns.forEach(column => before[column] = '');
    sourceMapping(source).forEach((target, column) => { if (target) before[target] = raw[column] ?? ''; });
    const after = {...before};
    const origin: RowOrigin = {source: source.name, sheet: source.sheet, sourceRow: source.rowNumbers?.[i] ?? i + 2, inputRow: count};
    const issues: Omit<Issue, 'outputRow'>[] = [];
    function issue(column: string, message: string) { issues.push({row: count, column, message, source: origin.source, sheet: origin.sheet, sourceRow: origin.sourceRow, value: before[column]}); }
    for (const column of settings.dateColumns) {
      if (after[column] === '' || after[column] === null || after[column] === undefined) continue;
      const parsed = parseDate(after[column], settings.dateFormat, source.date1904);
      if (parsed === null) issue(column, '해석할 수 없거나 모호한 날짜 — 원문 유지');
      else after[column] = parsed;
    }
    for (const column of settings.moneyColumns) {
      if (after[column] === '' || after[column] === null || after[column] === undefined) continue;
      if ((currencies[column]?.size ?? 0) > 1) { issue(column, `한 열에 ${[...currencies[column]].join('·')} 통화가 섞여 있습니다. 환율 변환 없이 합칠 수 없어 원문을 유지했습니다.`); continue; }
      const parsed = parseMoney(after[column]);
      if (parsed === null) issue(column, '통화 형식 오류 — 원문 유지');
      else after[column] = parsed;
    }
    return {before, after, origin, issues};
  }));
  let kept = entries;
  if (settings.dedup) {
    const seen = new Set<string>();
    const ordered = settings.keep === 'last' ? [...entries].reverse() : entries;
    kept = ordered.filter(entry => {
      const values = settings.keys.map(column => dedupPart(entry.after[column]));
      if (values.every(value => value === '')) return true;
      const key = JSON.stringify(values);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (settings.keep === 'last') kept.reverse();
  }
  const summary: CleanSummary = {dateConverted: 0, dateKept: 0, moneyConverted: 0, moneyKept: 0, samples: []};
  for (const entry of kept) {
    for (const column of settings.dateColumns) {
      const before = entry.before[column];
      if (before === '' || before == null) continue;
      if (before !== entry.after[column]) {
        summary.dateConverted++;
        if (summary.samples.length < 6) summary.samples.push({column, before, after: entry.after[column], kind: 'date'});
      } else summary.dateKept++;
    }
    for (const column of settings.moneyColumns) {
      const before = entry.before[column];
      if (before === '' || before == null) continue;
      if (before !== entry.after[column]) {
        summary.moneyConverted++;
        if (summary.samples.length < 6) summary.samples.push({column, before, after: entry.after[column], kind: 'money'});
      } else summary.moneyKept++;
    }
  }
  return {columns, rows: kept.map(entry => entry.after), originalRows: kept.map(entry => entry.before), beforeRows: entries.map(entry => entry.before), origins: kept.map(entry => entry.origin), issues: kept.flatMap((entry, i) => entry.issues.map(issue => ({...issue, outputRow: i + 1}))), inputCount: entries.length, removed: entries.length - kept.length, changedCells: kept.reduce((total, entry) => total + columns.filter(column => entry.before[column] !== entry.after[column]).length, 0), summary};
}
export function exportWorkbook(result: ReturnType<typeof transform>, settings: Settings) {
  const matrix: Cell[][] = [result.columns, ...result.rows.map(row => result.columns.map(column => row[column]))];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  for (let r = 1; r < matrix.length; r++) for (let c = 0; c < result.columns.length; c++) {
    const cell = sheet[XLSX.utils.encode_cell({r, c})];
    if (!cell) continue;
    delete cell.f; delete cell.F;
    if (typeof matrix[r][c] === 'string') { cell.t = 's'; cell.v = matrix[r][c]; }
    if (settings.moneyColumns.includes(result.columns[c]) && typeof cell.v === 'number') {
      const fractional = result.rows.some(row => typeof row[result.columns[c]] === 'number' && !Number.isInteger(row[result.columns[c]] as number));
      cell.z = fractional ? '#,##0.00' : '#,##0';
    }
  }
  sheet['!cols'] = result.columns.map(() => ({wch: 22}));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '정리 결과');
  const summaryRows: Cell[][] = [
    ['항목', '값'],
    ['입력 행', result.inputCount],
    ['결과 행', result.rows.length],
    ['중복 제거', result.removed],
    ['날짜를 연-월-일로 변환', result.summary.dateConverted],
    ['날짜 원문 유지', result.summary.dateKept],
    ['통화를 숫자로 변환', result.summary.moneyConverted],
    ['통화 원문·기존 값 유지', result.summary.moneyKept],
    ['바뀐 셀', result.changedCells],
    ['검토 항목', result.issues.length],
  ];
  for (const sample of result.summary.samples) summaryRows.push([`${sample.kind === 'date' ? '날짜' : '통화'} 예시 · ${sample.column}`, `${String(sample.before ?? '')} → ${String(sample.after ?? '')}`]);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summaryRows), '정리 요약');
  if (result.issues.length) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(result.issues.map(issue => ({'파일': issue.source, '시트': issue.sheet, '원본 행': issue.sourceRow, '결과 행': issue.outputRow, '열': issue.column, '원문': issue.value, '확인 사항': issue.message}))), '검토 사항');
  return XLSX.write(book, {bookType: 'xlsx', type: 'array'}) as ArrayBuffer;
}
