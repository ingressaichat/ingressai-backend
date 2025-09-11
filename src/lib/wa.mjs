cat > src/lib/wa.mjs <<'EOF'
import crypto from "crypto";
import axios from "axios";
import { log } from "../utils.mjs";

const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN || process.env.ACCESS_TOKEN || process.env.WABA_TOKEN || "";
const APP_SECRET = process.env.APP_SECRET || "";
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || "";
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v20.0";

function appsecretProof(token, secret) {
  if (!token || !secret) return null;
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

const meta = axios.create({
  baseURL: `https://graph.facebook.com/${GRAPH_VERSION}`,
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
});

meta.interceptors.request.use((cfg) => {
  const proof = appsecretProof(ACCESS_TOKEN, APP_SECRET);
  if (proof) cfg.params = { ...(cfg.params || {}), appsecret_proof: proof };
  return cfg;
});

export async function sendText(to, text, preview = false) {
  const payload = {
    messaging_product: "whatsapp",
    to: String(to),
    type: "text",
    text: { body: String(text), preview_url: !!preview }
  };
  const { data } = await meta.post(`/${WA_PHONE_NUMBER_ID}/messages`, payload);
  log("wa.sendText", data);
  return data;
}

export async function sendDocument(to, link, filename = "file.pdf") {
  const payload = {
    messaging_product: "whatsapp",
    to: String(to),
    type: "document",
    document: { link: String(link), filename: String(filename) }
  };
  const { data } = await meta.post(`/${WA_PHONE_NUMBER_ID}/messages`, payload);
  log("wa.sendDocument", data);
  return data;
}

// (opcional) menu simples sem "button" inválido
export async function sendMenu(to) {
  const payload = {
    messaging_product: "whatsapp",
    to: String(to),
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "IngressAI" },
      body: { text: "Escolha uma opção" },
      action: {
        button: "Abrir menu",
        sections: [{
          title: "Menu",
          rows: [
            { id: "menu:events", title: "Ver eventos" },
            { id: "menu:setup", title: "Criar evento (Setup)" },
            { id: "admin:panel", title: "Painel do admin" }
          ]
        }]
      }
    }
  };
  const { data } = await meta.post(`/${WA_PHONE_NUMBER_ID}/messages`, payload);
  log("wa.sendMenu", data);
  return data;
}
EOF
