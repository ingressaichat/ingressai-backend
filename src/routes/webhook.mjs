import { Router } from "express";
import { APP_SECRET, BRAND_NAME, ENABLE_VALIDATOR } from "../config.mjs";
import { verifyMetaSignature, onlyDigits, dbg } from "../utils.mjs";
import { sendText, sendList, sendButtons, notifyAdmin, markRead, typingOn, typingOff, sendDocumentLink } from "../lib/wa.mjs";
import { getUserSession, setUserState, eventsByOwner, listEvents, validateTicketCode, createTickets, findEvent } from "../lib/db.mjs";
import { buildTicketPDF } from "../lib/pdf.mjs";

const router = Router();

// =============== VERIFY (GET) =================
router.get("/", (req,res)=>{
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if(mode === "subscribe" && token === process.env.VERIFY_TOKEN){
    return res.status(200).send(challenge);
  }
  return res.status(403).send("Forbidden");
});

// =============== RECEIVER (POST) ==============
router.post("/", async (req,res)=>{
  try{
    const signature = req.headers["x-hub-signature-256"];
    const raw = req.rawBody;
    const ok = verifyMetaSignature({ appSecret: APP_SECRET, signatureHeader: signature, rawBody: raw });
    if(!ok){ console.warn("[webhook] assinatura inválida"); }
  }catch(e){ console.warn("[webhook] verify error", e); }

  const body = req.body;
  dbg("webhook","IN", JSON.stringify(body));

  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages || [];
    for(const msg of messages){ await handleMessage(value, msg); }
  } catch(e) {
    console.error("[webhook] handle error", e);
  }

  res.sendStatus(200);
});

// =============== HANDLERS =====================

async function handleMessage(value, msg){
  const from = onlyDigits(msg.from || value?.contacts?.[0]?.wa_id || "");
  if(!from) return;
  await markRead(msg.id);
  await typingOn(from);

  try{
    switch(msg.type){
      case "text":
        await onText(from, msg.text?.body||"");
        break;
      case "interactive":
        await onInteractive(from, msg.interactive);
        break;
      case "button":
        await onButton(from, msg.button);
        break;
      case "image":
      case "document":
      default:
        await sendHome(from, "Envie uma mensagem ou use o menu abaixo 👇");
        break;
    }
  } finally {
    await typingOff(from);
  }
}

// ======= UX helpers (Listas / Menus) =========

async function sendHome(to, prefix=""){
  const events = listEvents({ publishedOnly:true }).slice(0,5); // vitrine
  const rowsMain = [
    { id:"menu:my_events", title:"Meus eventos", description:"Gerencie e publique" },
    { id:"menu:create", title:"Criar evento", description:"Cadastro rápido" },
    ...(ENABLE_VALIDATOR ? [{ id:"menu:validator", title:"Validar ingresso", description:"Conferir QR/código" }] : []),
    { id:"menu:help", title:"Ajuda", description:"Contatos e suporte" }
  ];
  const rowsVitrine = events.map(ev=>({
    id:`vitrine:${ev.id}`,
    title: ev.title,
    description: `${ev.city||"-"} • ${ev.venue||"-"} • ${ev.date ? new Date(ev.date).toLocaleDateString() : "-"}`
  }));

  const sections = [
    { title: "Menu", rows: rowsMain },
    ...(rowsVitrine.length ? [{ title: "Destaques", rows: rowsVitrine }] : [])
  ];

  await sendList(to, {
    header: BRAND_NAME,
    body: prefix ? `${prefix}\n\nBem-vindo ao ${BRAND_NAME} 👋` : `Bem-vindo ao ${BRAND_NAME} 👋`,
    button: "Abrir menu",
    sections
  });
  setUserState(to, "home");
}

async function onText(from, body){
  const s = getUserSession(from);

  // atalhos: aceitar código de ticket direto
  const maybeCode = body.trim();
  if(maybeCode.startsWith("ingressai:ticket:") || maybeCode.length > 12){
    const v = validateTicketCode(maybeCode);
    if(v.valid){
      await sendText(from, `✅ Ticket válido\n• Evento: ${v.event}\n• Pessoa: ${v.holder}\n• ID: ${v.ticketId}`);
      return;
    }
  }

  switch(s.state){
    case "create:title":
      setUserState(from, "create:city", { title: body.trim() });
      await sendText(from, "Cidade do evento?");
      return;

    case "create:city":
      setUserState(from, "create:date", { city: body.trim() });
      await sendText(from, "Data do evento? (AAAA-MM-DD)");
      return;

    case "create:date": {
      const ctx = { ...s.ctx, date: body.trim() };
      setUserState(from, "create:confirm", ctx);
      await sendButtons(from, {
        body: `Confirmar criação?\n\n• Título: ${ctx.title}\n• Cidade: ${ctx.city}\n• Data: ${ctx.date}`,
        buttons: [
          { type:"reply", reply:{ id:"create:confirm_yes", title:"Confirmar" } },
          { type:"reply", reply:{ id:"create:cancel", title:"Cancelar" } }
        ]
      });
      return;
    }

    case "validator:await_code":
      await doValidate(from, body.trim());
      return;

    default:
      await sendHome(from, "⌨️ Mensagem recebida.");
  }
}

async function onInteractive(from, interactive){
  if(interactive?.type === "list_reply"){
    const id = interactive.list_reply?.id || "";
    if(!id) return sendHome(from);
    if(id.startsWith("menu:")){
      const key = id.split(":")[1];
      switch(key){
        case "my_events": return showMyEvents(from);
        case "create":    return startCreate(from);
        case "validator": return startValidator(from);
        case "help":      return sendText(from, "Suporte: contato@ingressai.chat\nDúvidas comuns: https://ingressai.chat");
        default: return sendHome(from);
      }
    }
    if(id.startsWith("vitrine:")){
      const evId = id.split(":")[1];
      const ev = findEvent(evId);
      if(!ev) return sendText(from, "Evento não encontrado.");
      return sendButtons(from, {
        body: `Evento: ${ev.title}\n${ev.city||"-"} • ${ev.venue||"-"}`,
        buttons:[
          { type:"reply", reply:{ id:`ev:buy:${ev.id}`, title:"Comprar (demo)" } },
          { type:"reply", reply:{ id:`ev:info:${ev.id}`, title:"Detalhes" } }
        ]
      });
    }
  }
  if(interactive?.type === "button_reply"){
    const id = interactive.button_reply?.id||"";
    return onButton(from, { payload:id });
  }
  return sendHome(from);
}

async function onButton(from, btn){
  const id = btn?.payload || btn?.text || btn?.id || "";
  if(!id) return sendHome(from);

  if(id==="create:cancel"){ setUserState(from, "home", {}); return sendHome(from, "Criação cancelada."); }
  if(id==="create:confirm_yes"){
    const s = getUserSession(from); const ctx = s.ctx||{};
    // grava rascunho simples (owner = from)
    const ev = {
      id: `ev_${Date.now()}`,
      title: ctx.title, city: ctx.city, venue:"A definir", date: ctx.date,
      price: 0, status: "draft", ownerPhone: from, createdAt: new Date().toISOString()
    };
    // store.events (acesso direto pela PoC)
    const { store } = await import("../lib/db.mjs");
    store.events.set(ev.id, ev);
    setUserState(from, "home", {});
    await sendText(from, `✅ Evento criado (rascunho): ${ev.title}\nID: ${ev.id}\nQuando quiser publicar: "Publicar ${ev.title}".`);
    return sendHome(from);
  }

  if(id.startsWith("ev:info:")){
    const evId = id.split(":")[2];
    const ev = findEvent(evId);
    if(!ev) return sendText(from,"Evento não encontrado.");
    return sendText(from, `📌 ${ev.title}\nCidade: ${ev.city}\nLocal: ${ev.venue}\nData: ${ev.date}`);
  }

  if(id.startsWith("ev:buy:")){
    // demo: gera 1 ingresso pro próprio remetente e envia PDF por link
    const evId = id.split(":")[2];
    const buyers = [{ name:"Participante", phone: from }];
    const tks = createTickets(evId, buyers);
    const tk = tks[0];
    try{
      const { bufferToStream } = await import("../lib/pdf.mjs");
      const ev = findEvent(evId);
      const pdf = await buildTicketPDF({ ticket: tk, event: ev, brand: BRAND_NAME });

      // Como demo simples no WA Cloud, enviamos por link (precisa CDN real).
      // Aqui vamos mandar apenas o código + instrução:
      await sendText(from, `🎟️ Ingresso gerado: ${tk.code}\nApresente o QR do PDF (enviado por email em versões futuras).`);
      // Se você tiver um link pronto, use sendDocumentLink(from,{ link, filename })
    }catch(e){
      console.error("PDF error", e);
      await sendText(from, "Ingresso gerado. (Falha ao anexar PDF nesta demonstração)");
    }
    return;
  }

  return sendHome(from);
}

async function showMyEvents(to){
  const items = eventsByOwner(to); // phone como owner
  if(!items.length) return sendText(to, "Você ainda não tem eventos. Use “Criar evento”.");
  const rows = items.slice(0,10).map(ev=>({
    id:`myev:${ev.id}`,
    title: ev.title,
    description: `${ev.city||"-"} • ${ev.status} • ${ev.date ? new Date(ev.date).toLocaleDateString() : "-"}`
  }));
  await sendList(to, {
    header: BRAND_NAME,
    body: "Seus eventos",
    button: "Ver",
    sections: [{ title:"Eventos", rows }]
  });
  setUserState(to, "my_events");
}

async function startCreate(to){
  setUserState(to, "create:title", {});
  await sendText(to, "Qual é o título do evento?");
}

async function startValidator(to){
  setUserState(to, "validator:await_code", {});
  await sendText(to, "Envie o código do ingresso (ou cole o conteúdo do QR).");
}

async function doValidate(to, code){
  const v = validateTicketCode(code);
  if(!v.valid){
    await sendText(to, `❌ inválido: ${v.reason}`);
  } else {
    await sendText(to, `✅ Ticket válido\n• Evento: ${v.event}\n• Pessoa: ${v.holder}\n• ID: ${v.ticketId}`);
  }
  setUserState(to, "home", {});
  await sendHome(to);
}

export default router;
