// 以 JSON 檔累積資料。每個資料集一個資料夾、每個日期/月份/季一個檔
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const cache = new Map();

const full = (rel) => path.join(DATA_DIR, rel);

export async function readJSON(rel, fallback = null) {
  if (cache.has(rel)) return cache.get(rel);
  try {
    const data = JSON.parse(await fs.readFile(full(rel), 'utf8'));
    cache.set(rel, data);
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeJSON(rel, data) {
  const p = full(rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, p);
  cache.set(rel, data);
}

export async function exists(rel) {
  if (cache.has(rel)) return true;
  try {
    await fs.access(full(rel));
    return true;
  } catch {
    return false;
  }
}

// 列出資料夾內的 key（檔名去掉 .json），由舊到新排序
export async function listKeys(dir) {
  try {
    const files = await fs.readdir(full(dir));
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export function clearCache() {
  cache.clear();
}
