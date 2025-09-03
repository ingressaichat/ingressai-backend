import fs from "fs";
import path from "path";

export function log(event, data = {}) {
  try {
    console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }));
  } catch {
    console.log(`[${new Date().toISOString()}] ${event}`, data);
  }
}

const DATA_DIR = "/app/data";
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

export async function readStore(name) {
  const p = path.join(DATA_DIR, `${name}.json`);
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return []; }
}
export async function writeStore(name, arr) {
  const p = path.join(DATA_DIR, `${name}.json`);
  try { fs.writeFileSync(p, JSON.stringify(arr, null, 2)); } catch {}
}
