// ================================================
// File: src/routes/webhook.mjs (ATUALIZADO)
// - Adiciona parseDateInputToISO para aceitar "dd/mm/aaaa hh:mm" e ISO
// - Usa o parser no fluxo admin de criação de evento
// ================================================
import express, { Router } from "express";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "../utils.mjs";
import { listEvents, findEvent, updateEvent, deleteEvent, pureEventName } from "../db.mjs";

const router = Router();

/* ========================= ENV ========================= */
const VERIFY_TOKEN   = process.env.VERIFY_TOKEN || "ingressai123";
const BRAND          = process.env.BRAND_NAME || "IngressAI";
const BASE_URL       = (process.env.BASE_URL || "").replace(/\/$/, "");
const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION  = process.env.GRAPH_API_VERSION || "v23.0";
const PHONE_ID       = process.env.PHONE_NUMBER_ID || process.env.PUBLIC_WABA || "";
const TOKEN          = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
const APP_SECRET     = process.env.APP_SECRET || "";
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || BASE_URL).replace(/\/$/, "");
const ALLOW_IMAGE_UPLOADS = String(process.env.ALLOW_IMAGE_UPLOADS || "1") === "1";
const ADMIN_PHONES   = (process.env.ADMIN_PHONES || "")
  .split(",").map(s=>s.replace(/\D/g,"")).filter(Boolean);

// Não derrubar o processo se faltar env:
const WABA_ENABLED = Boolean(PHONE_ID && TOKEN);

/* ========================= STATE ========================= */
const sessions = new Map();
const dedupe   = new Set();

/* ========================= HELPERS ========================= */
const isAdmin        = (wa) => ADMIN_PHONES.includes(String(wa||"").replace(/\D/g,""));
const normalizePhone = (s) => String(s||"").replace(/\D/g,"");
const safeProfileName = (contacts) => { try { return String(contacts?.[0]?.profile?.name || "").trim(); } catch { return ""; } };

const appProof = (token) => (APP_SECRET && token)
  ? crypto.createHmac("sha256", APP_SECRET).update(token).digest("hex")
  : null;

const waParams = () => {
  const p = { access_token: TOKEN };
  const proof = appProof(TOKEN);
  if (proof) p.appsecret_proof = proof;
  return p;
};

const graph = axios.create({
  baseURL: `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}`,
  timeout: 15000
});

async function send(payload) {
  if (!WABA_ENABLED) { log("waba.disabled"); return { disabled: true }; }
  const res = await graph.post("/messages", payload, {
    params: waParams(),
    headers: { "Content-Type": "application/json" }
  });
  return res.data;
}

const sendText = (to, body) =>
  send({ messaging_product: "whatsapp", to, type: "text",
         text: { body: String(body).slice(0,4096), preview_url: false } });

const sendButtons = (to, { body, buttons }) => {
  const rows = buttons.slice(0,3).map((b,i)=>({ type:"reply", reply:{ id:b.id||`btn_${i+1}`, title:b.title.slice(0,20)}}));
  return send({ messaging_product:"whatsapp", to, type:"interactive",
    interactive:{ type:"button", body:{ text: body }, action:{ buttons: rows } }});
};

const sendInteractiveList = (to, { header, body, footer, rows, title="Eventos" }) =>
  send({
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: {
      type: "list",
      header: header ? { type:"text", text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: { button: "Ver opções", sections: [{ title, rows: rows.slice(0,10) }] }
    }
  });

async function markRead(message_id) {
  try { await send({ messaging_product:"whatsapp", status:"read", message_id }); } catch {}
}

/* ============= PARSE DE DATA (BR -> ISO) ============= */
function parseDateInputToISO(input) {
  const s = String(input || "").trim();

  // ISO direto? (YYYY-MM-DD[THH:mm[:ss]][.sss][Z|±hh:mm])
  const isoRx = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?$/i;
  if (isoRx.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // dd/mm/aaaa [hh:mm]
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = "0", mi = "0"] = m;
    const y = Number(yyyy), mon = Number(mm) - 1, day = Number(dd);
    const H = Number(hh), M = Number(mi);
    if (mon < 0 || mon > 11 || day < 1 || day > 31 || H < 0 || H > 23 || M < 0 || M > 59) return null;

    // Interpreta como horário local de São Paulo (UTC-3)
    const utcMs = Date.UTC(y, mon, day, H + 3, M, 0, 0);
    return new Date(utcMs).toISOString();
  }

  return null;
}

/* ========================= UPLOADS (admin banner) ========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads");
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

async function downloadMediaToUploads(mediaId) {
  if (!ALLOW_IMAGE_UPLOADS) throw new Error("Uploads desabilitados");
  // meta
  const meta = await axios.get(`${GRAPH_API_BASE}/${GRAPH_VERSION}/${mediaId}`, { params: waParams(), timeout: 10000 });
  const url  = meta.data?.url;
  const mime = meta.data?.mime_type || "image/jpeg";
  const ext  = (mime.split("/")[1] || "jpg").split(";")[0];
  if (!url) throw new Error("URL vazia");
  // conteúdo
  const r = await axios.get(url, { responseType: "arraybuffer", headers:{ Authorization:`Bearer ${TOKEN}` }, timeout: 20000 });
  const file = `${mediaId}.${ext}`;
  const dest = path.join(UPLOADS_DIR, file);
  fs.writeFileSync(dest, r.data);
  return `${MEDIA_BASE_URL}/uploads/${encodeURIComponent(file)}`;
}

/* ========================= UX BOT ========================= */
async function greet(to, profileName="") {
  const hi = profileName ? `Fala, ${profileName.split(" ")[0]}!` : "Fala aí!";
  await sendText(to, `${hi} Eu sou o bot da ${BRAND}. Vendo ingressos aqui no WhatsApp. 🚀`);
  const admin = isAdmin(to);
  await sendButtons(to, {
    body: `Como posso te ajudar?\n\n• Ver eventos\n• Meus ingressos\n• Suporte${admin ? "\n• Admin" : ""}`,
    buttons: [
      { id: "menu_ver_eventos", title: "Ver eventos" },
      { id: "menu_meus_ing",    title: "Meus ing." },
      { id: admin ? "menu_admin" : "menu_suporte", title: admin ? "Admin" : "Suporte" }
    ]
  });
}

function rowFromEvent(ev) {
  const sub = [ev.city, new Date(ev.date).toLocaleString("pt-BR")].filter(Boolean).join(" • ");
  return { id: `ev:${ev.id}`, title: pureEventName(ev), description: sub.slice(0,72) };
}

async function showEventsList(to) {
  const items = listEvents();
  if (!items.length) return sendText(to, "Ainda não publicamos eventos. ✨");
  const rows = items.map(rowFromEvent);
  await sendInteractiveList(to, { header: "Vitrine", body: "Escolha um evento:", rows });
}

async function finalizePurchase(to, evId, name) {
  try {
    const res  = await axios.get(`${BASE_URL}/purchase/start`, { params: { ev: evId, to, name, qty: 1 }, timeout: 20000 });
    const data = res.data;
    if (data?.ok) {
      const sess = sessions.get(to) || {};
      sessions.set(to, { ...sess, state:"idle", lastOrderId: data.code, lastPdfUrl: data.pdfUrl, buyerName: name });
      await sendText(to, `✅ Compra confirmada!\nNome: ${name}\nTe mandei o PDF aqui (se não aparecer, posso reenviar em “Meus ing.”).`);
      await sendButtons(to, { body: "Quer mais alguma coisa?", buttons: [
        { id:"menu_ver_eventos", title:"Ver eventos" },
        { id:"menu_meus_ing",    title:"Meus ing." }
      ]});
    } else {
      throw new Error(data?.error || "Falha ao emitir");
    }
  } catch (e) {
    log("purchase.start.fail", e?.response?.data || e.message);
    await sendText(to, "Não consegui emitir agora 😓. Tenta de novo em instantes.");
  }
}

async function handleMeusIngressos(to) {
  const sess = sessions.get(to);
  if (!sess?.lastOrderId) return sendText(to, "Ainda não vi compras por este número. Manda **“Ver eventos”** para começar. 😉");
  try {
    await axios.post(`${BASE_URL}/tickets/issue`, { orderId: sess.lastOrderId, to }, {
      headers: { "Content-Type": "application/json" }, timeout: 15000
    });
    await sendText(to, "Reenviei seu ingresso aqui no chat. 📩");
  } catch {
    await sendText(to, "Tentei reenviar mas falhou agora. Tenta novamente.");
  }
}

async function handleStartWithEvent({ from, profileName, evId, maybeName }) {
  const ev = findEvent(evId);
  if (!ev) return sendText(from, "Não encontrei o evento. Manda “Ver eventos”.");
  const sess = sessions.get(from) || {};
  sessions.set(from, { ...sess, pendingEventId: ev.id, state: "awaiting_name" });
  const guessed = (maybeName || profileName || "").trim();
  if (guessed) {
    await sendButtons(from, {
      body: `Comprar **${pureEventName(ev)}**?\nPosso usar este nome no ingresso:\n• ${guessed}`,
      buttons: [{ id:"confirm_name_yes", title:"Sim" }, { id:"confirm_name_no", title:"Outro nome" }]
    });
    sessions.set(from, { ...sessions.get(from), candidateName: guessed });
  } else {
    await sendText(from, `Como devo escrever **seu nome** no ingresso do ${pureEventName(ev)}?`);
  }
}

/* ========================= ADMIN ========================= */
async function adminMenu(to) {
  await sendButtons(to, { body: "Painel Admin", buttons: [
    { id:"admin_criar",   title:"Criar evento" },
    { id:"admin_midia",   title:"Definir mídia" },
    { id:"admin_excluir", title:"Excluir" }
  ]});
  await sendButtons(to, { body: "Mais opções", buttons: [
    { id:"menu_ver_eventos", title:"Vitrine" }
  ]});
}

async function adminStartCreate(to) {
  const s = sessions.get(to) || {};
  sessions.set(to, { ...s, state:"adm_create_title", adminDraft:{} });
  await sendText(to, "Vamos criar um evento.\nQual **título**?");
}

async function adminHandleCreation(to, txt) {
  const s = sessions.get(to) || {};
  const d = s.adminDraft || {};
  if (s.state === "adm_create_title") {
    d.title = txt; sessions.set(to, { ...s, state:"adm_create_city", adminDraft:d });
    return sendText(to, "Qual **cidade**?");
  }
  if (s.state === "adm_create_city") {
    d.city = txt; sessions.set(to, { ...s, state:"adm_create_date", adminDraft:d });
    return sendText(to, "Data e hora? Formato `dd/mm/aaaa hh:mm` ou ISO.");
  }
  if (s.state === "adm_create_date") {
    const isoStr = parseDateInputToISO(txt);
    if (!isoStr) return sendText(to, "Não entendi a data. Tenta `15/09/2025 23:00` ou `2025-09-15T23:00`.");
    const id = Math.random().toString(36).slice(2,10);
    const ev = { id, title:d.title, city:d.city, date: isoStr, venue:"", statusLabel:"Em breve", imageUrl:"" };
    const { DB } = await import("../db.mjs"); DB.EVENTS.set(id, ev);
    sessions.set(to, { ...s, state:"adm_post_create", pendingEventId:id, adminDraft:{} });
    await sendText(to, `Evento criado ✅\n• ${ev.title}\n• ${ev.city}, ${new Date(ev.date).toLocaleString("pt-BR")}\nID: ${id}`);
    return sendButtons(to, { body:"Definir mídia agora?", buttons:[
      { id:"admin_set_media_now", title:"Definir mídia" },
      { id:"menu_ver_eventos",    title:"Ver vitrine" }
    ]});
  }
}

async function adminSelectEventForMedia(to) {
  const rows = listEvents().slice(0,10).map(ev=>({ id:`adm_media:${ev.id}`, title: pureEventName(ev), description: `${ev.city} • ${new Date(ev.date).toLocaleString("pt-BR")}` }));
  await sendInteractiveList(to, { header:"Definir mídia", body:"Escolha o evento. Depois envie a imagem.", rows, title:"Eventos (mídia)" });
}
async function adminSelectEventForDelete(to) {
  const rows = listEvents().slice(0,10).map(ev=>({ id:`adm_del:${ev.id}`, title:`🗑 ${pureEventName(ev)}`, description: `${ev.city} • ${new Date(ev.date).toLocaleString("pt-BR")}` }));
  await sendInteractiveList(to, { header:"Excluir evento", body:"Qual evento deseja remover?", rows, title:"Remover" });
}

/* ========================= DISPATCHER ========================= */
function norm(s){ return String(s||"").replace(/\s+/g," ").trim(); }

async function handleUserMessage({ from, message, contacts }) {
  const profileName = safeProfileName(contacts);
  const admin = isAdmin(from);
  const sess  = sessions.get(from) || {};
  sessions.set(from, { ...sess });

  const type = message.type;

  // interactive
  if (type === "interactive") {
    const kind = message.interactive?.type;
    if (kind === "button_reply") {
      const id = message.interactive?.button_reply?.id || "";
      if (id === "menu_ver_eventos") return showEventsList(from);
      if (id === "menu_meus_ing")   return handleMeusIngressos(from);
      if (id === "menu_suporte")    return sendText(from, `Fale com o suporte: https://wa.me/${process.env.PUBLIC_WHATSAPP || "5534999992747"}`);
      if (id === "confirm_name_yes") {
        const name = sess.candidateName || profileName || "Participante";
        const evId = sess.pendingEventId;
        if (!evId) return sendText(from, "Vamos lá! Manda “Ver eventos”.");
        return finalizePurchase(from, evId, name);
      }
      if (id === "confirm_name_no") {
        sessions.set(from, { ...sess, state:"awaiting_name" });
        return sendText(from, "Sem problema! Qual nome devo colocar no ingresso?");
      }
      if (admin && id === "menu_admin")       return adminMenu(from);
      if (admin && id === "admin_criar")      return adminStartCreate(from);
      if (admin && id === "admin_midia")      return adminSelectEventForMedia(from);
      if (admin && id === "admin_excluir")    return adminSelectEventForDelete(from);
      if (admin && id === "admin_set_media_now") {
        const s = sessions.get(from) || {};
        if (!s.pendingEventId) return adminSelectEventForMedia(from);
        sessions.set(from, { ...s, state:"adm_wait_media" });
        return sendText(from, "Envie a imagem do evento (banner).");
      }
    }
    if (kind === "list_reply") {
      const id = message.interactive?.list_reply?.id || "";
      if (id.startsWith("ev:"))        return handleStartWithEvent({ from, profileName, evId: id.slice(3) });
      if (admin && id.startsWith("adm_media:")) {
        const evId = id.split(":")[1];
        const s = sessions.get(from) || {};
        sessions.set(from, { ...s, state:"adm_wait_media", pendingEventId: evId });
        return sendText(from, "Agora **envie a imagem** do evento.");
      }
      if (admin && id.startsWith("adm_del:")) {
        const evId = id.split(":")[1];
        const ok = deleteEvent(evId);
        return sendText(from, ok ? "Evento removido ✅" : "Não achei esse evento.");
      }
    }
  }

  // media — admin define banner
  if (type === "image" && admin) {
    const s = sessions.get(from) || {};
    if (s.state === "adm_wait_media") {
      try {
        const mediaId = message.image?.id;
        if (!mediaId) throw new Error("image.id ausente");
        const url = await downloadMediaToUploads(mediaId);
        updateEvent(s.pendingEventId, { imageUrl: url });
        await sendText(from, `Banner salvo ✅\n${url}`);
        sessions.set(from, { ...s, state:"idle" });
      } catch (e) {
        log("admin.media.error", e?.response?.data || e.message);
        await sendText(from, "Não consegui salvar a imagem agora. Tenta novamente.");
      }
      return;
    }
  }

  // texto / estados
  let text = "";
  if (type === "text") text = message.text?.body || "";
  text = norm(text);

  if (sess.state === "awaiting_name" && sess.pendingEventId) {
    const name = text || profileName || "Participante";
    return finalizePurchase(from, sess.pendingEventId, name);
  }

  const t = text.toLowerCase();
  if (["oi","olá","ola","bom dia","boa tarde","boa noite","/start","menu"].includes(t)) return greet(from, profileName);
  if (!admin && (t.includes("ver eventos") || t === "eventos" || t === "vitrine")) return showEventsList(from);
  if (!admin && (t.includes("meus ingressos") || t === "meus ing." || t === "ingresso")) return handleMeusIngressos(from);
  if (!admin && (t.includes("suporte") || t.includes("ajuda"))) return sendText(from, `Pode chamar: https://wa.me/${process.env.PUBLIC_WHATSAPP || "5534999992747"}`);
  if (admin && (t === "admin" || t === "/admin")) return adminMenu(from);

  // fallback
  if (admin) return adminMenu(from);
  return sendButtons(from, {
    body: "Posso te ajudar com:",
    buttons: [
      { id:"menu_ver_eventos", title:"Ver eventos" },
      { id:"menu_meus_ing",    title:"Meus ing." },
      { id:"menu_suporte",     title:"Suporte" }
    ]
  });
}

/* ========================= ROUTES ========================= */

// GET /webhook (verify)
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// POST /webhook (mensagens)
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    // verificação de assinatura
    if (APP_SECRET) {
      const hdr = String(req.get("x-hub-signature-256") || "");
      const mac = crypto.createHmac("sha256", APP_SECRET).update(req.body).digest("hex");
      const mine = "sha256=" + mac;
      if (hdr && hdr !== mine) log("webhook.signature_mismatch", { hdr, mine });
    }

    const data = JSON.parse(req.body.toString("utf8") || "{}");
    res.status(200).send("OK"); // ACK cedo

    const entries = data?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value    = change?.value || {};
        const statuses = value?.statuses || [];
        const messages = value?.messages || [];
        for (const st of statuses) log("WA status", { id: st.id, status: st.status, timestamp: st.timestamp, recipient_id: st.recipient_id });
        for (const msg of messages) {
          const mid  = msg.id;
          const from = normalizePhone(msg.from || "");
          if (!from) continue;
          if (dedupe.has(mid)) continue;
          dedupe.add(mid); setTimeout(()=>dedupe.delete(mid), 10*60*1000);
          try { await markRead(mid); } catch {}
          try {
            // Admin flow de criação (estados de texto)
            const s = sessions.get(from) || {};
            if (s.state?.startsWith("adm_create_") && msg.type === "text") {
              await adminHandleCreation(from, msg.text?.body || "");
            } else {
              await handleUserMessage({ from, message: msg, contacts: value?.contacts });
            }
          } catch (e) {
            log("webhook.handle_error", e?.response?.data || e.message);
            try { await sendText(from, "Deu ruim aqui 😵‍💫. Manda “Ver eventos” que eu me encontro."); } catch {}
          }
        }
      }
    }
  } catch (e) {
    log("webhook.error", e?.response?.data || e.message);
    if (!res.headersSent) res.status(200).send("OK");
  }
});

export default router;


// ================================================
// File: src/routes/events.mjs (ATUALIZADO – adiciona POST /events)
// - Permite criar eventos via API (com parse BR -> ISO)
// - Requer admin (checkAdmin) para POST
// ================================================
import { Router as RouterEvents } from "express";
import { listEvents, findEvent, pureEventName } from "../db.mjs";
import { checkAdmin } from "../config.mjs";

export const eventsRouter = RouterEvents();

// Helper de parse (mesmo do webhook)
function parseDateInputToISO(input) {
  const s = String(input || "").trim();
  const isoRx = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?$/i;
  if (isoRx.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = "0", mi = "0"] = m;
    const y = Number(yyyy), mon = Number(mm) - 1, day = Number(dd);
    const H = Number(hh), M = Number(mi);
    const utcMs = Date.UTC(y, mon, day, H + 3, M, 0, 0); // BRT -> UTC
    return new Date(utcMs).toISOString();
  }
  return null;
}

// GETs existentes
eventsRouter.get("/events", (_req, res) => {
  res.json({ ok:true, events: listEvents() });
});

eventsRouter.get("/events/:id", (req, res) => {
  const ev = findEvent(req.params.id);
  if (!ev) return res.status(404).json({ ok:false, error:"not_found" });
  res.json({ ok:true, event: ev });
});

// NOVO: criar evento
eventsRouter.post("/events", async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ ok:false, error: "unauthorized" });
  const { title, city, date, venue = "", statusLabel = "Em breve", imageUrl = "" } = req.body || {};
  if (!title || !city || !date) return res.status(400).json({ ok:false, error:"missing_fields", required:["title","city","date"] });

  const iso = parseDateInputToISO(date);
  if (!iso) return res.status(400).json({ ok:false, error:"invalid_date", hint:"Use dd/mm/aaaa hh:mm ou ISO 8601" });

  const id = Math.random().toString(36).slice(2,10);
  const ev = { id, title, city, date: iso, venue, statusLabel, imageUrl };
  const { DB } = await import("../db.mjs");
  DB.EVENTS.set(id, ev);

  res.json({ ok:true, event: ev });
});
