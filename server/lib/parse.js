// 解析證交所／櫃買各種格式回應的共用工具。欄位一律「依標題找」，不依位置

export function clean(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\s　]+/g, '')
    .trim();
}

export function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v)
    .replace(/<[^>]*>/g, '')
    .replace(/[,\s　]/g, '')
    .replace(/^\+/, '');
  if (s === '' || /^(-{1,3}|X|N\/A|NA|除權息|除權|除息)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 找欄位索引。每個候選可以是字串或「全部都要包含」的關鍵字陣列，依序嘗試
 * findCol(fields, ['投信', '買賣超'], '投信買賣超')
 */
export function findCol(fields, ...candidates) {
  if (!fields) return -1;
  const cleaned = fields.map(clean);
  for (const cand of candidates) {
    const kws = Array.isArray(cand) ? cand : [cand];
    const i = cleaned.findIndex((f) => kws.every((k) => f.includes(k)));
    if (i >= 0) return i;
  }
  return -1;
}

// 把各種 JSON 包裝（tables[] / fields+data / fields9+data9 / aaData）統一成 [{fields, data}]
export function extractTables(json) {
  const out = [];
  if (!json || typeof json !== 'object') return out;
  if (Array.isArray(json.tables)) {
    for (const t of json.tables) {
      if (t && Array.isArray(t.data)) out.push({ title: t.title, fields: t.fields?.map(clean) ?? null, data: t.data });
    }
  }
  if (Array.isArray(json.data) && Array.isArray(json.fields)) out.push({ fields: json.fields.map(clean), data: json.data });
  for (let i = 1; i <= 12; i++) {
    const f = json[`fields${i}`];
    const d = json[`data${i}`];
    if (Array.isArray(f) && Array.isArray(d)) out.push({ fields: f.map(clean), data: d });
  }
  if (Array.isArray(json.aaData)) out.push({ fields: null, data: json.aaData });
  return out;
}

export function pickTable(tables, ...mustHave) {
  return tables.find((t) => t.fields && mustHave.every((k) => findCol(t.fields, k) >= 0)) ?? null;
}

// 只留一般普通股：四碼、首碼 1–9（排除 ETF 00xx、權證、特別股）
export const isCommonStock = (code) => /^[1-9]\d{3}$/.test(code);

// 物件型（OpenAPI）資料：用關鍵字找 key
export function findKey(obj, ...candidates) {
  const keys = Object.keys(obj ?? {});
  for (const cand of candidates) {
    if (cand instanceof RegExp) {
      const k = keys.find((x) => cand.test(x));
      if (k) return k;
      continue;
    }
    const kws = Array.isArray(cand) ? cand : [cand];
    const k = keys.find((x) => kws.every((w) => x.includes(w)));
    if (k) return k;
  }
  return null;
}

// 極簡 CSV 解析（支援引號）
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}
