import crypto from "node:crypto";
import axios from "axios";

/* ========= ENV / CONFIG ========= */
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v20.0";
const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN || process.env.META_TOKEN || process.env.ACCESS_TOKEN || "";

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

const APP_SECRET =
  process.env.APP_SECRET || process.env.WHATSAPP_APP_SECRET || "";

// OTP / template
const BRAND = process.env.BRAND_NAME || "IngressAI";
const AUTH_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_AUTH || "verify_code_1";
const AUTH_TEMPLATE_LOCALE = process.env.WHATSAPP_TEMPLATE_LOCALE || "pt_BR";

/* ========= GUARDS ========= */
function ensureEnv() {
  if (!WHATSAPP_TOKEN) throw new Error("WHATSAPP_TOKEN não configurado");
  if (!PHONE_NUMBER_ID) throw new Error("PHONE_NUMBER_ID não configurado");
}

/* ========= HELPERS ========= */
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");

function buildAppSecretProof() {
  if (!APP_SECRET || !WHATSAPP_TOKEN) return null;
  return crypto.createHmac("sha256", APP_SECRET).update(WHATSAPP_TOKEN).digest("hex");
}

function messagesEndpoint() {
  const proof = buildAppSecretProof();
  const base = `${GRAPH_API}/${encodeURIComponent(PHONE_NUMBER_ID)}/messages`;
  return proof ? `${base}?appsecret_proof=${proof}` : base;
}

async function waPost(payload, kind = "text") {
  ensureEnv();
  try {
    const { data } = await axios.post(messagesEndpoint(), {
      messaging_product: "whatsapp",
      ...payload,
    }, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return data;
  } catch (err) {
    const e = err?.response?.data || err?.message || String(err);
    console.log(`[wa.post.error]`, JSON.stringify({ kind, err: e }));
    throw err;
  }
}

/* ========= SENDERS ========= */
export async function sendText(to, text, previewUrl = false) {
  const payload = {
    to: onlyDigits(to),
    type: "text",
    text: { body: String(text), preview_url: !!previewUrl },
  };
  return waPost(payload, "text");
}

export async function sendList(to, { header, body, button, sections, footer }) {
  const payload = {
    to: onlyDigits(to),
    type: "interactive",
    interactive: {
      type: "list",
      ...(header ? { header: { type: "text", text: String(header).slice(0, 60) } } : {}),
      body: { text: String(body || "").slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        button: String(button || "Escolher").slice(0, 20),
        sections: (sections || []).map(sec => ({
          title: String(sec.title || "").slice(0, 24),
          rows: (sec.rows || []).map(r => ({
            id: String(r.id || "").slice(0, 200),
            title: String(r.title || "").slice(0, 24),
            ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
          })),
        })),
      },
    },
  };
  return waPost(payload, "list");
}

export async function sendButtons(to, text, buttons = []) {
  const payload = {
    to: onlyDigits(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: String(text || "").slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: "reply",
          reply: { id: String(b.id).slice(0, 200), title: String(b.title).slice(0, 20) },
        })),
      },
    },
  };
  return waPost(payload, "buttons");
}

export async function sendDocument(to, documentUrl, filename = "document.pdf") {
  const payload = {
    to: onlyDigits(to),
    type: "document",
    document: { link: String(documentUrl), filename: String(filename).slice(0, 240) },
  };
  return waPost(payload, "document");
}

/** ⚠️ Atualizado: sem a chave `category` (deu erro 100 no Graph) */
export async function sendAuthCodeTemplate(to, code, opts = {}) {
  const name = opts.name || AUTH_TEMPLATE_NAME;
  const locale = opts.locale || AUTH_TEMPLATE_LOCALE;
  const payload = {
    to: onlyDigits(to),
    type: "template",
    template: {
      name,
      language: { code: String(locale) },
      components: [
        { type: "body", parameters: [{ type: "text", text: String(code) }] },
        ...(opts.withBrandHeader ? [{ type: "header", parameters: [{ type: "text", text: String(BRAND) }]}] : []),
      ],
    },
  };
  return waPost(payload, "auth_template");
}

export default { sendText, sendList, sendButtons, sendDocument, sendAuthCodeTemplate };
