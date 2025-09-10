// src/utils.mjs
// Utilitários compartilhados (log, formatação, parsing, etc) – ESM

/* ========= Log estruturado ========= */
export function log(event, payload = {}) {
  try {
    const ts = new Date().toISOString();
    // Mantém formatinho simples pro Railway
    console.log(`[${ts}] ${event}`, JSON.stringify(payload));
  } catch {
    // se der ruim de serializar, joga simples
    console.log(`[${new Date().toISOString()}] ${event}`, payload);
  }
}

/* ========= Strings & cortes ========= */
export function fit(str, max = 60) {
  const s = String(str ?? "").trim();
  if (!max || s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export function fitDesc(str, max = 72) {
  // descrição de list message no WA é curtinha
  return fit(str, max);
}

/* ========= Datas ========= */
export function fmtDateBR(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // Ex.: 27 de set. de 2025 23:00
    return d.toLocaleString("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

/* ========= Telefones ========= */
export function onlyDigits(s) {
  return String(s ?? "").replace(/\D+/g, "");
}

export function maskPhone(s) {
  const d = onlyDigits(s);
  // tenta formato +55 (34) 99999-9999, cai pra genérico se tamanho diferente
  if (d.length >= 12 && d.startsWith("55")) {
    const pais = "+55";
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `${pais} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `${pais} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `${pais} (${ddd}) ${rest}`;
  }
  if (d.length >= 11) {
    const pais = `+${d.slice(0, d.length - 11)}`;
    const ddd = d.slice(-11, -9);
    const rest = d.slice(-9);
    return `${pais} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  return `+${d}`;
}

export function fmtPhoneLabel(s) {
  const d = onlyDigits(s);
  return d ? `+${d}` : String(s ?? "");
}

/* ========= Caption KV parsing =========
 * Exemplo:
 *   "criar: id=party-01; title=Sunset; city=BH; venue=Terraço; date=2025-09-20T20:00:00-03:00; price=R$ 60"
 * parseKVFromCaption(caption, "criar") => { id, title, city, venue, date, price }
 */
export function parseKVFromCaption(caption, actionKey) {
  try {
    const raw = String(caption ?? "");
    const rx = new RegExp(`^\\s*${escapeRegExp(actionKey)}\\s*:\\s*(.+)$`, "i");
    const m = raw.match(rx);
    if (!m) return null;
    const body = m[1]; // "id=...; title=...; ..."
    const parts = body.split(/;\s*/g).map((p) => p.trim()).filter(Boolean);
    const kv = {};
    for (const p of parts) {
      const ix = p.indexOf("=");
      if (ix === -1) continue;
      const k = p.slice(0, ix).trim();
      const v = p.slice(ix + 1).trim();
      if (k) kv[k] = v;
    }
    return kv;
  } catch {
    return null;
  }
}

function escapeRegExp(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ========= Env helpers ========= */
export function getEnv(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

export function assertEnv(names = []) {
  const miss = [];
  for (const n of names) {
    if (!process.env[n] || String(process.env[n]).trim() === "") miss.push(n);
  }
  if (miss.length) {
    const msg = `Faltando variáveis de ambiente: ${miss.join(", ")}`;
    log("env.missing", { miss });
    throw new Error(msg);
  }
}

/* ========= Safe JSON ========= */
export function safeJson(res, status, data) {
  try {
    res.status(status).json(data);
  } catch (e) {
    res.status(500).json({ error: "JSON serialize error" });
  }
}

/* ========= Misc ========= */
export function isTruthyFlag(v) {
  // aceita 1/true/yes/on
  const s = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(s);
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, Number(ms) || 0));
}

export default {
  log,
  fit,
  fitDesc,
  fmtDateBR,
  onlyDigits,
  maskPhone,
  fmtPhoneLabel,
  parseKVFromCaption,
  getEnv,
  assertEnv,
  safeJson,
  isTruthyFlag,
  delay,
};
