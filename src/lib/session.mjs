// src/lib/session.mjs
import { sendText, sendList, sendInteractive, sendTemplate } from "./wa.mjs";
import { listEvents, createTickets, findEvent, publishEvent } from "./db.mjs";
import { BRAND_NAME, ADMIN_PHONES, PUBLIC_WHATSAPP } from "../config.mjs";

const sessions = new Map(); // phone -> { step, data }

function sget(phone) {
  if (!sessions.has(phone)) sessions.set(phone, { step: "home", data: {} });
  return sessions.get(phone);
}

function reset(phone) { sessions.set(phone, { step: "home", data: {} }); }

function menuHome() {
  return {
    header: `${BRAND_NAME}`,
    body: "Como posso ajudar?",
    sections: [
      {
        title: "Menu",
        rows: [
          { id: "ev:list", title: "🎫 Ver eventos", description: "Vitrine de eventos" },
          { id: "ev:buy", title: "🛍️ Comprar ingresso", description: "Compra rápida" },
          { id: "org:new", title: "🧑‍💼 Criar meu evento", description: "Solicitar aprovação" },
          { id: "help", title: "❓ Ajuda", description: "Falar com suporte" }
        ]
      }
    ]
  };
}

function listToRows(events) {
  return events.slice(0, 50).map((ev) => ({
    id: `ev:open:${ev.id}`,
    title: ev.title,
    description: `${ev.city || ""} • ${new Date(ev.date).toLocaleString("pt-BR")}`
  }));
}

export async function processInbound(ctx) {
  const phone = ctx.from;
  const sess = sget(phone);

  // TIPOS
  const msg = ctx.message || {};
  const type = msg.type;
  const text = type === "text" ? (msg.text?.body || "").trim() : "";
  const btn = msg.button?.text || "";
  const selectedId = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id || "";

  // ===== ROUTER =====
  // 1) Comandos diretos
  const lower = (text || btn).toLowerCase();

  if (lower === "menu" || lower === "início" || lower === "inicio" || lower === "começar" || lower === "start") {
    reset(phone);
    const m = menuHome();
    await sendList(phone, m.header, m.body, m.sections);
    return;
  }

  // 2) Se veio uma seleção de lista/botão
  if (selectedId) {
    const [ns, action, param] = selectedId.split(":");
    if (ns === "ev" && action === "list") {
      const evs = listEvents({ publishedOnly: true });
      if (!evs.length) {
        await sendText(phone, "Ainda não temos eventos publicados. Volte em breve ✨");
        return;
      }
      await sendList(phone, "Eventos", "Escolha um evento:", [
        { title: "Em destaque", rows: listToRows(evs) }
      ]);
      return;
    }

    if (ns === "ev" && action === "open" && param) {
      const ev = findEvent(param);
      if (!ev) {
        await sendText(phone, "Evento não encontrado.");
        return;
      }
      sess.step = "ev_detail";
      sess.data.eventId = ev.id;
      await sendInteractive(phone, {
        header: ev.title,
        body:
          `📍 ${ev.city || "-"}\n` +
          (ev.venue ? `🏟️ ${ev.venue}\n` : "") +
          (ev.date ? `🗓️ ${new Date(ev.date).toLocaleString("pt-BR")}\n` : "") +
          (Number.isFinite(+ev.price) ? `💵 R$ ${(+ev.price).toFixed(2)}\n` : ""),
        footer: "Escolha uma ação",
        buttons: [
          { id: `buy:${ev.id}`, title: "Comprar 1 ingresso" },
          { id: `share:${ev.id}`, title: "Compartilhar" },
          { id: `back:home`, title: "Voltar" }
        ]
      });
      return;
    }

    if (action === "buy" && param) {
      const ev = findEvent(param);
      if (!ev) return sendText(phone, "Evento indisponível.");
      const tickets = createTickets(ev.id, [{ name: ctx.name || "Participante", phone }]);
      await sendText(
        phone,
        `🎟️ Ingresso gerado: ${tickets[0].code}\nApresente o QR Code no evento.\n\nSe quiser mais ingressos, repita a compra.`
      );
      reset(phone);
      return;
    }

    if (ns === "org" && action === "new") {
      sess.step = "org_title";
      await sendText(phone, "Vamos lá! Me diga o *nome do evento*.");
      return;
    }

    if (selectedId === "help") {
      await sendText(phone, `Suporte: https://wa.me/${PUBLIC_WHATSAPP}`);
      return;
    }

    if (selectedId === "ev:buy") {
      const evs = listEvents({ publishedOnly: true });
      if (!evs.length) {
        await sendText(phone, "Sem eventos no momento.");
        return;
      }
      await sendList(phone, "Comprar", "Selecione o evento:", [
        { title: "Eventos", rows: listToRows(evs) }
      ]);
      return;
    }

    if (selectedId === "ev:list") {
      const evs = listEvents({ publishedOnly: true });
      if (!evs.length) {
        await sendText(phone, "Sem eventos no momento.");
        return;
      }
      await sendList(phone, "Eventos", "Escolha um evento:", [
        { title: "Em destaque", rows: listToRows(evs) }
      ]);
      return;
    }

    if (selectedId === "org:new") {
      sess.step = "org_title";
      await sendText(phone, "Vamos lá! Me diga o *nome do evento*.");
      return;
    }

    if (selectedId === "back:home") {
      reset(phone);
      const m = menuHome();
      await sendList(phone, m.header, m.body, m.sections);
      return;
    }
  }

  // 3) Fluxos por passo (organizador)
  if (sess.step === "home") {
    const m = menuHome();
    await sendList(phone, m.header, m.body, m.sections);
    return;
  }

  if (sess.step === "org_title" && text) {
    sess.data.title = text;
    sess.step = "org_city";
    await sendText(phone, "Cidade do evento?");
    return;
  }

  if (sess.step === "org_city" && text) {
    sess.data.city = text;
    sess.step = "org_when";
    await sendText(phone, "Data/hora (ex.: 31/10/2025 22:00)?");
    return;
  }

  if (sess.step === "org_when" && text) {
    sess.data.date = text;
    sess.step = "org_venue";
    await sendText(phone, "Local/estabelecimento?");
    return;
  }

  if (sess.step === "org_venue" && text) {
    sess.data.venue = text;
    // Notifica admin
    for (const adm of ADMIN_PHONES) {
      await sendText(
        adm,
        `📥 Nova solicitação de evento:\n• Tel: +${phone}\n• Evento: ${sess.data.title}\n• Cidade: ${sess.data.city}\n• Local: ${sess.data.venue}\n• Quando: ${sess.data.date}`
      );
    }
    await sendText(phone, "✅ Recebi sua solicitação. Vamos analisar e te avisar aqui.");
    reset(phone);
    return;
  }

  // 4) Fallback texto livre
  if (text) {
    const m = menuHome();
    await sendList(phone, m.header, "Não entendi. Escolha uma opção:", m.sections);
    return;
  }
}
