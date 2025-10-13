import { APP_SECRET, GRAPH_VERSION, WHATSAPP_TOKEN, WA_PHONE_NUMBER_ID, BRAND_NAME, ADMIN_PHONES } from "../config.mjs";
import { toProof, onlyDigits, dbg } from "../utils.mjs";

const API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TOKEN = WHATSAPP_TOKEN;
const PHONE_ID = WA_PHONE_NUMBER_ID;

function qs(params){ return new URLSearchParams(params).toString(); }

async function callWA(body){
  if(!TOKEN || !APP_SECRET || !PHONE_ID) throw new Error("wa_config_missing");
  const proof = toProof(TOKEN, APP_SECRET);
  const url = `${API_BASE}/${PHONE_ID}/messages?${qs({ access_token:TOKEN, appsecret_proof:proof })}`;
  dbg("wa","POST", url, JSON.stringify(body));
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(()=> ({}));
  if(!res.ok){
    console.error("[WA] send %s %s", res.status, JSON.stringify(j));
    const e = new Error(`send_failed_${res.status}`); e.response = j; throw e;
  }
  return j;
}

export async function sendText(to, text){
  const phone = onlyDigits(to);
  return callWA({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { preview_url: false, body: text }
  });
}

export async function sendList(to, { header=BRAND_NAME, body, button="Abrir", sections=[] }){
  const phone = onlyDigits(to);
  return callWA({
    messaging_product: "whatsapp",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body: { text: body },
      footer: { text: "IngressAI" },
      action: {
        button,
        sections // [{ title, rows:[{id,title,description}] }]
      }
    }
  });
}

export async function sendButtons(to, { header=BRAND_NAME, body, buttons=[] }){
  const phone = onlyDigits(to);
  return callWA({
    messaging_product: "whatsapp",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: header },
      body: { text: body },
      footer: { text: "IngressAI" },
      action: { buttons } // [{ type:"reply", reply:{ id, title } }]
    }
  });
}

// link de documento (PDF)
export async function sendDocumentLink(to, { link, filename="ingresso.pdf", caption="" }){
  const phone = onlyDigits(to);
  return callWA({
    messaging_product: "whatsapp",
    to: phone,
    type: "document",
    document: { link, filename, caption }
  });
}

// ack leitura (no WA Cloud, marca como lida via /messages/{id} status? Ficaremos no no-op/log)
export async function markRead(_wamid){ dbg("wa","markRead", _wamid); }
export async function typingOn(_to){ dbg("wa","typingOn", _to); }
export async function typingOff(_to){ dbg("wa","typingOff", _to); }

export async function notifyAdmin(text){
  const targets = ADMIN_PHONES || [];
  for(const p of targets){ try{ await sendText(p, `🔔 ${BRAND_NAME}: ${text}`); }catch(e){ console.error("[WA] notifyAdmin failed for %s", p, e); } }
}
