import fs from "fs";
import path from "path";
import axios from "axios";

export function log(evt, payload) {
  const ts = new Date().toISOString();
  try {
    // eslint-disable-next-line no-console
    console.log(`[${ts}] ${evt}`, typeof payload === "string" ? payload : JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
  return p;
}

export function env(key, fallback = "") {
  return process.env[key] ?? fallback;
}

/** Chamada simples no Graph API com token */
export async function graph(method, pathOrId, { params = {}, data = null } = {}) {
  const token = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
  if (!token) throw new Error("WABA token ausente");
  const base = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
  const v = process.env.GRAPH_API_VERSION || "v23.0";
  const url = `${base}/${v}/${pathOrId}`.replace(/\/{2,}/g, "/").replace("https:/", "https://");
  const r = await axios({
    method,
    url,
    params: { access_token: token, ...params },
    data
  });
  return r.data;
}

/** Baixa mídia de uma mensagem do WhatsApp e grava no uploads */
export async function downloadMediaToUploads(mediaId, { uploadsDir, mediaBaseUrl }) {
  const token = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
  if (!token) throw new Error("WABA token ausente");

  // 1) pega URL da mídia
  const meta = await graph("GET", mediaId);
  const mediaUrl = meta?.url;
  const mime = meta?.mime_type || "application/octet-stream";
  if (!mediaUrl) throw new Error("media url ausente");

  // 2) baixa binário com token
  const res = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    params: { access_token: token }
  });

  const ext = mime.split("/").pop() || "bin";
  const fname = `wa_${mediaId}.${ext}`;
  ensureDir(uploadsDir);
  const dest = path.join(uploadsDir, fname);
  fs.writeFileSync(dest, Buffer.from(res.data));

  return {
    filename: fname,
    mime,
    localPath: dest,
    publicUrl: `${mediaBaseUrl.replace(/\/$/, "")}/${fname}`
  };
}
