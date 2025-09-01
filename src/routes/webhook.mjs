import express, { Router } from "express";
import axios from "axios";
import crypto from "crypto";
import { log } from "../utils.mjs";
import { listEvents, findEvent, updateEvent, deleteEvent, pureEventName } from "./events.mjs";

export const webhookRouter = Router();

// ===== ENV =====
const VERIFY_TOKEN   = process.env.VERIFY_TOKEN || "ingressai123";
const BRAND          = process.env.BRAND_NAME || "IngressAI";
const BASE_URL       = (process.env.BASE_URL || "").replace(/\/$/,"");
const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION  = process.env.GRAPH_API_VERSION || "v23.0";
const PHONE_ID       = process.env.PHONE_NUMBER_ID || process.env.PUBLIC_WABA || "";
const TOKEN          = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
const APP_SECRET     = process.env.APP_SECRET || "";
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || "").replace(/\/$/,"");
const ALLOW_IMAGE_UPLOADS = String(process.env.ALLOW_IMAGE_UPLOADS || "1") === "1";
const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map(s=>s.replace(/\D/g,"")).filter(Boolean);

// ===== STATE =====
const sessions = new Map();
const dedupe = new Set();

// ===== helpers =====
const isAdmin = (wa) => ADMIN_PHONES.includes(String(wa||"").replace(/\D/g,""));
const normalizePhone = (s) => String(s||"").replace(/\D/g,"");
const safeProfileName = (contacts) => {
  try { return String(contacts?.[0]?.profile?.name || "").trim(); } catch { return ""; }
};

function appProof(token) {
  if (!APP_SECRET || !token) return null;
  return crypto.createHmac("sha256", APP_SECRET).update(token).digest("hex");
}
const waParams = () => {
  const p = { access_token: TOKEN };
  const proof = appProof(TOKEN);
  if (proof) p.appsecret_proof = proof;
  return p;
};

// ==== Graph client ====
const graph = axios.create({
  baseURL: `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}`,
  timeout: 15000
});
async function send(payload) {
  if (!PHONE_ID || !TOKEN) throw new Error("WABA não configurada");
  const res = await graph.post("/messages", payload, {
    params: waParams(),
    headers: { "Content-Type": "application/json" }
  });
  return res.data;
}
const sendText = (to, body) =>
  send({ messaging_product: "whatsapp", to, type: "text", text: { body: String(body).slice(0,4096), preview_url: false } });

const sendButtons = (to, { body, buttons }) => {
  const rows = buttons.slice(0,3).map((b,i)=>({ type:"reply", reply:{ id:b.id||`btn_${i+1}`, title:b.title.slice(0,20)}}));
  return send({ messaging_product:"whatsapp", to, type:"interactive", interactive:{ type:"button", body:{ text: body }, action:{ buttons: rows } }});
};
const sendInteractiveList = (to, { header, body, footer, rows, title="Eventos" }) =>
  send({
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: {
      type: "list",
      header: header ? { type:"text", text: header } : undefined,
      body: { text: body }, footer: footer ? { text: footer } : undefined,
      action: { button: "Ver opções", sections: [{ title, rows: rows.slice(0,10) }] }
    }
  });

async function markRead(message_id) { try { await send({ messaging_product:"whatsapp", status:"read", message_id }); } catch {} }

// ===== Media upload via Graph (admin banner) =====
import fs from "fs";
import path from "path";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}
async function downloadMediaToUploads(mediaId) {
  if (!ALLOW_IMAGE_UPLOADS) throw new Error("Uploads desabilitados");
  // 1) meta
  const meta = await axios.get(`${GRAPH_API_BASE}/${GRAPH_VERSION}/${mediaId}`, { params: waParams(), timeout: 10000 });
  const url = meta.data?.url;
  const mime = meta.data?.mime_type || "image/jpeg";
  const ext = (mime.split("/")[1] || "jpg").split(";")[0];
  if (!url) throw new Error("URL vazia");
  // 2) conteúdo
  const r = await axios.get(url, { responseType: "arraybuffer", headers:{ Authorization:`Bearer ${TOKEN}` }, timeout: 20000 });
  const file = `${mediaId}.${ext}`;
  const dest = path.join(UPLOADS_DIR, file);
  fs.writeFileSync(dest, r.data);
  return `${MEDIA_BASE_URL}/${encodeURIComponent(file)}`;
}

// ===== UX =====
async function greet(to, profileName="") {
  const hi = profileName ? `Fala, ${profileName.split(" ")[0]}!` : "Fala aí!";
  await sendText(to, `${hi} Eu sou o bot da ${BRAND}. Vendo ingressos direto aqui no WhatsApp, com QR Code. 🚀`);
  const admin = isAdmin(to);
  await sendButtons(to, {
    body: `Como posso te ajudar?\n\n• Ver eventos\n• Meus ingressos\n• Suporte${admin ? "\n• Admin" : ""}`,
    buttons: [
      { id: "menu_ver_eventos", title: "Ver eventos" },
      { id: "menu_meus_ing", title: "Meus ing." },
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
  if (!items.length) return sendText(to, "Ainda não publicamos eventos. Volte em breve ✨");
  const rows = items.map(rowFromEvent);
  await sendInteractiveList(to, { header: "Vitrine", body: "Escolha um evento:", rows });
}

async function finalizePurchase(to, evId, name) {
  try {
    const res = await axios.get(`${BASE_URL}/purchase/start`, { params: { ev: evId, to, name, qty: 1 }, timeout: 20000 });
    const data = res.data;
    if (data?.ok) {
      const sess = sessions.get(to) || {};
      sessions.set(to, { ...sess, state:"idle", lastOrderId: data.code, lastPdfUrl: data.pdfUrl, buyerName: name });
      await sendText(to, `✅ Compra confirmada!\nNome: ${name}\nTe mandei o PDF aqui (se não aparecer, posso reenviar em “Meus ing.”).`);
      await sendButtons(to, { body: "Quer mais alguma coisa?", buttons: [
        { id:"menu_ver_eventos", title:"Ver eventos" },
        { id:"menu_meus_ing", title:"Meus ing." }
      ]});
    } else {
      throw new Error(data?.error || "Falha ao emitir");
    }
  } catch (e) {
    log("purchase.start.fail", e?.response?.data || e.message);
    await sendText(to, "Não consegui emitir agora 😓. Tenta de novo em instantes ou toca em “Meus ing.” para reenviar.");
  }
}

async function handleMeusIngressos(to) {
  const sess = sessions.get(to);
  if (!sess?.lastOrderId) return sendText(to, "Ainda não vi compras por este número. Manda **“Ver eventos”** para começar. 😉");
  try {
    await axios.post(`${BASE_URL}/tickets/issue`, { orderId: sess.lastOrderId }, {
      headers: { "Content-Type": "application/json" }, timeout: 15000
    });
    await sendText(to, "Prontinho! Reenviei seu ingresso aqui no chat. 📩");
  } catch {
    await sendText(to, "Tentei reenviar mas falhou agora. Tenta novamente em instantes.");
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

// ===== admin mini-painel =====
async function adminMenu(to) {
  await sendButtons(to, { body: "Painel Admin", buttons: [
    { id:"admin_criar", title:"Criar evento" },
    { id:"admin_midia", title:"Definir mídia" },
    { id:"admin_excluir", title:"Excluir" }
  ]});
  await sendButtons(to, { body: "Mais opções", buttons: [
    { id:"admin_broadcast", title:"Broadcast" },
    { id:"menu_ver_eventos", title:"Vitrine" }
  ]});
}

async function adminStartCreate(to) {
  const s = sessions.get(to) || {};
  sessions.set(to, { ...s, state:"adm_create_title", adminDraft:{} });
  await sendText(to, "Vamos criar um evento.\nQual **título**? (ex.: *Hello World — Uberaba*)");
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
    const iso = new Date(txt); if (isNaN(iso.getTime())) return sendText(to, "Não entendi a data. Tenta `15/09/2025 23:00`.");
    const id = Math.random().toString(36).slice(2,10);
    const ev = { id, title:d.title, city:d.city, date:iso.toISOString(), venue:"", statusLabel:"Em breve", imageUrl:"" };
    // salva
    const { DB } = await import("../db.mjs");
    DB.EVENTS.set(id, ev);
    sessions.set(to, { ...s, state:"adm_post_create", pendingEventId:id, adminDraft:{} });
    await sendText(to, `Evento criado ✅\n• ${ev.title}\n• ${ev.city}, ${new Date(ev.date).toLocaleString("pt-BR")}\nID: ${id}`);
    return sendButtons(to, { body:"Definir mídia agora?", buttons:[
      { id:"admin_set_media_now", title:"Definir mídia" },
      { id:"menu_ver_eventos", title:"Ver vitrine" }
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
async function adminBroadcastStart(to) {
  const s = sessions.get(to) || {};
  sessions.set(to, { ...s, state:"adm_broadcast_msg" });
  await sendText(to, "Qual mensagem devo enviar para os contatos recentes?");
}
async function adminBroadcastSend(to, body) {
  const targets = [...sessions.keys()].filter(id => id && !isAdmin(id));
  let ok=0, fail=0;
  for (const dst of targets) {
    try { await sendText(dst, body); ok++; } catch { fail++; }
  }
  await sendText(to, `Broadcast concluído: ✅ ${ok} • ❌ ${fail}`);
  const s = sessions.get(to) || {};
  sessions.set(to, { ...s, state:"idle" });
}

// ===== dispatcher =====
function norm(s){ return String(s||"").replace(/\s+/g," ").trim(); }

async function handleUserMessage({ from, message, contacts }) {
  const profileName = safeProfileName(contacts);
  const admin = isAdmin(from);
  const sess = sessions.get(from) || {};
  sessions.set(from, { ...sess });

  const type = message.type;

  // interactive
  if (type === "interactive") {
    const kind = message.interactive?.type;
    if (kind === "button_reply") {
      const id = message.interactive?.button_reply?.id || "";
      if (id === "menu_ver_eventos") return showEventsList(from);
      if (id === "menu_meus_ing")   return handleMeusIngressos(from);
      if (id === "menu_suporte")    return sendText(from, `Fale com o suporte: https://wa.me/5534999992747`);
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
      if (admin && id === "admin_broadcast")  return adminBroadcastStart(from);
      if (admin && id === "admin_set_media_now") {
        const s = sessions.get(from) || {};
        if (!s.pendingEventId) return adminSelectEventForMedia(from);
        sessions.set(from, { ...s, state:"adm_wait_media" });
        return sendText(from, "Envie a imagem do evento (foto/banner).");
      }
    }
    if (kind === "list_reply") {
      const id = message.interactive?.list_reply?.id || "";
      if (id.startsWith("ev:")) {
        const evId = id.slice(3);
        return handleStartWithEvent({ from, profileName, evId });
      }
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

  // texto livre / estados
  let text = "";
  if (type === "text") text = message.text?.body || "";
  text = norm(text);
  if (text) log("WA incoming", { from, type, text, admin });

  if (sess.state === "awaiting_name" && sess.pendingEventId) {
    const name = text || profileName || "Participante";
    return finalizePurchase(from, sess.pendingEventId, name);
  }
  if (admin && ["adm_create_title","adm_create_city","adm_create_date","adm_broadcast_msg"].includes(sess.state)) {
    if (sess.state === "adm_broadcast_msg") return adminBroadcastSend(from, text);
    return adminHandleCreation(from, text);
  }

  const t = text.toLowerCase();
  if (["oi","olá","ola","bom dia","boa tarde","boa noite","/start","menu"].includes(t)) return greet(from, profileName);
  if (!admin && (t.includes("ver eventos") || t === "eventos" || t === "vitrine")) return showEventsList(from);
  if (!admin && (t.includes("meus ingressos") || t === "meus ing." || t === "ingresso")) return handleMeusIngressos(from);
  if (!admin && (t.includes("suporte") || t.includes("ajuda"))) return sendText(from, `Pode chamar: https://wa.me/5534999992747`);
  if (admin && (t === "admin" || t === "/admin")) return adminMenu(from);

  // fallback
  if (admin) return adminMenu(from);
  return sendButtons(from, {
    body: "Posso te ajudar com:",
    buttons: [
      { id:"menu_ver_eventos", title:"Ver eventos" },
      { id:"menu_meus_ing", title:"Meus ing." },
      { id:"menu_suporte", title:"Suporte" }
    ]
  });
}

// ===== Routes =====
webhookRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

webhookRouter.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    // assinatura
    if (APP_SECRET) {
      const hdr = String(req.get("x-hub-signature-256") || "");
      const mac = crypto.createHmac("sha256", APP_SECRET).update(req.body).digest("hex");
      const mine = "sha256=" + mac;
      if (hdr && hdr !== mine) log("webhook.signature_mismatch", { hdr, mine });
    }

    const data = JSON.parse(req.body.toString("utf8") || "{}");
    res.status(200).send("OK"); // ack cedo

    const entries = data?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value || {};
        const statuses = value?.statuses || [];
        const messages = value?.messages || [];
        for (const st of statuses) log("WA status", {
          id: st.id, status: st.status, timestamp: st.timestamp, recipient_id: st.recipient_id,
          conversation: st.conversation, pricing: st.pricing
        });
        for (const msg of messages) {
          const mid = msg.id;
          const from = normalizePhone(msg.from || "");
          if (!from) continue;
          if (dedupe.has(mid)) continue;
          dedupe.add(mid); setTimeout(()=>dedupe.delete(mid), 10*60*1000);
          try { await markRead(mid); } catch {}
          try { await handleUserMessage({ from, message: msg, contacts: value?.contacts }); }
          catch (e) {
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

export default webhookRouter;
