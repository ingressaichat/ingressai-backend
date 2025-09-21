// src/routes/webhook.mjs
/* eslint-disable no-console */

/**
 * Webhook WhatsApp — IngressAI
 * -------------------------------------------------------
 * - Verificação (GET)
 * - Recebimento (POST)
 *   • Menu principal
 *   • Vitrine (página/lista)
 *   • Detalhe/compra
 *   • Meus ingressos (com fallback se db.listTickets não existir)
 *   • Suporte (tickets)
 *   • Painel Admin (criar/editar/excluir evento, broadcast, responder tickets)
 *   • Upload de mídia (imagem) para criar/atualizar evento
 *
 * ⚠️ IMPORTANTE:
 *   - Este arquivo usa import namespace para o DB:
 *       import * as db from "../lib/db.mjs"
 *     Dessa forma ele **não quebra** se algum export (ex.: listTickets) não existir
 *     no build atual — apenas desativa a funcionalidade específica.
 */

import { Router } from "express";
import axios from "axios";

// Config central
import {
  VERIFY_TOKEN,
  BASE_URL,
  BRAND_NAME,
  ADMIN_PHONES,
  GRAPH_VERSION,
  WHATSAPP_TOKEN,
} from "../config.mjs";

// ✅ Namespace import do DB para evitar crash quando faltar export
import * as db from "../lib/db.mjs";

// Envio WA (usa versão corrigida sem `category` no template)
import {
  sendText,
  sendList,
  sendButtons,
  sendDocument, // pode ser útil em respostas admin
} from "../lib/wa.mjs";

// Utils comuns
import {
  fit,
  fitDesc,
  fmtDateBR,
  onlyDigits,
  fmtPhoneLabel,
  maskPhone,
  log,
} from "../utils.mjs";

/* ============================================================================
   CONSTANTES / AMBIENTE
============================================================================ */
const router = Router();

const BRAND = BRAND_NAME || "IngressAI";
const API_BASE = BASE_URL ? `${String(BASE_URL).replace(/\/$/, "")}/api` : "";
const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION || "v20.0"}`;

const ADMIN_SET = new Set(
  String(ADMIN_PHONES || "")
    .split(",")
    .map((s) => onlyDigits(s))
    .filter(Boolean)
);
const isAdmin = (phone) => ADMIN_SET.has(onlyDigits(phone));

/* ============================================================================
   HELPERS
============================================================================ */
const STOP_WORDS = [
  "menu",
  "início",
  "inicio",
  "voltar",
  "parar",
  "encerrar",
  "fechar",
  "sair",
  "stop",
  "end",
  "cancelar",
];
const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
const isStopText = (txt) => STOP_WORDS.includes(normalize(txt));

function priceLabelBR(v) {
  const n = Number(
    String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")
  );
  if (!n) return "";
  return (
    "R$ " +
    (n % 1 ? n.toFixed(2) : String(Math.round(n))).replace(".", ",")
  );
}

async function notifyAdmins(text) {
  for (const adm of ADMIN_SET) {
    try {
      await sendText(adm, text);
    } catch {}
  }
}

// Graph: meta de mídia
async function getMediaMeta(mediaId) {
  if (!mediaId || !WHATSAPP_TOKEN) return null;
  try {
    const { data } = await axios.get(`${GRAPH_API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      timeout: 10000,
    });
    return data || null;
  } catch (e) {
    log("graph.media.meta.error", e?.response?.data || e.message);
    return null;
  }
}
async function extractMediaFromMessage(msg) {
  const type = msg.type;
  const payload = msg[type] || {};
  const id = payload.id || null;
  if (!id) return null;
  const meta = await getMediaMeta(id);
  return {
    type,
    id,
    url: meta?.url || null,
    mime: meta?.mime_type || null,
    sha256: meta?.sha256 || null,
    filename: payload.filename || null,
  };
}

/* ============================================================================
   ESTADO NA MEMÓRIA (tickets de suporte / fluxos)
============================================================================ */
const knownContacts = new Set();

const supportSessions = new Map(); // phone -> { step, category?, ticketId? }
const supportTickets = []; // { id, from, category, messages[], status, createdAt, closedAt? }
let supportSeq = 1;

const adminCreateSessions = new Map(); // phone -> { step, draft }
const adminEditSessions = new Map(); // phone -> { id, step, patch }
const broadcastSessions = new Map(); // phone -> { step, mode, target? }
const replySessions = new Map(); // admin phone -> { replyingToPhone }

/* ============================================================================
   VIEWS (WA UI)
============================================================================ */
async function sendMainMenu(to, adminFlag) {
  const sections = [
    {
      title: "Explorar",
      rows: [
        { id: "menu:events", title: "Ver eventos" },
        { id: "menu:mytickets", title: "Meus ingressos" },
        { id: "menu:support", title: "Suporte" },
      ],
    },
    {
      title: "Organizadores",
      rows: [
        { id: "menu:setup", title: "Criar evento (Setup)" },
        { id: "menu:dashboard", title: "Acessar Dashboard" },
      ],
    },
  ];
  if (adminFlag) {
    sections.push({
      title: "Admin",
      rows: [{ id: "admin:panel", title: "Painel do admin" }],
    });
  }
  await sendList(to, {
    header: fit(BRAND, 60),
    body: "Selecione uma opção:",
    button: "Escolher",
    sections,
  });
}

async function sendEventsList(to, page = 1, size = 5) {
  const { items, totalPages, page: p } = db.listEvents(page, size);
  const rows = items.map((ev) => ({
    id: `events:view:${ev.id}`,
    title: fit(db.pureEventName(ev), 24),
    description: fitDesc(
      `${ev.city || ""} · ${fmtDateBR(ev.date)} ${
        ev.price ? `· ${priceLabelBR(ev.price)}` : ""
      }`.replace(/\s+·\s+$/, "")
    ),
  }));

  const navRows = [];
  if (p > 1) navRows.push({ id: `events:page:${p - 1}`, title: "« Página anterior" });
  if (p < totalPages) navRows.push({ id: `events:page:${p + 1}`, title: "Próxima página »" });

  const sections = [{ title: "Eventos em destaque", rows }];
  if (navRows.length) sections.push({ title: "Navegar", rows: navRows });

  await sendList(to, {
    header: "Eventos",
    body: "Escolha um evento:",
    button: "Ver opções",
    sections,
  });
}

async function sendEventActions(to, evId, adminFlag = false) {
  const ev = db.findEvent(evId);
  if (!ev) {
    await sendText(to, "Evento não encontrado.");
    return;
  }
  const title = fit(db.pureEventName(ev), 24);
  const meta = `${ev.city || ""} · ${fmtDateBR(ev.date)} ${
    ev.price ? `· ${priceLabelBR(ev.price)}` : ""
  }`.replace(/\s+·\s+$/, "");

  const rows = [
    { id: `buy:${ev.id}`, title: "Comprar ingresso" },
    { id: "events:page:1", title: "Voltar (lista)" },
  ];
  if (adminFlag) {
    rows.push(
      { id: `admin:ev:edit:${ev.id}`, title: "Editar evento" },
      { id: `admin:ev:delete:${ev.id}`, title: "Excluir evento" }
    );
  }

  await sendList(to, {
    header: title,
    body: `${meta}\n\nO que deseja fazer?`,
    button: "Escolher",
    sections: [{ title: "Ações", rows }],
  });
}

async function sendSupportMenu(to) {
  supportSessions.set(to, { step: "choose_category" });
  await sendList(to, {
    header: "Suporte",
    body: "Escolha o assunto:",
    button: "Escolher",
    sections: [
      {
        title: "Categorias",
        rows: [
          { id: "support:cat:cancel", title: "Cancelar compra" },
          { id: "support:cat:noticket", title: "Ingresso não chegou" },
          { id: "support:cat:create", title: "Como criar evento" },
          { id: "support:cat:other", title: "Outra dúvida" },
        ],
      },
    ],
  });
  await sendButtons(to, "Se preferir, você pode encerrar:", [
    { id: "support:end", title: "Encerrar suporte" },
    { id: "menu:back", title: "Menu inicial" },
  ]);
}

async function sendAdminPanel(to) {
  await sendList(to, {
    header: "Admin",
    body: "Selecione uma ação:",
    button: "Escolher",
    sections: [
      {
        title: "Eventos",
        rows: [
          { id: "admin:events", title: "Gerenciar eventos" },
          { id: "admin:create", title: "Criar evento (wizard)" },
          { id: "menu:events", title: "Ver eventos (público)" },
          { id: "menu:setup", title: "Abrir Setup (site)" },
        ],
      },
      {
        title: "Comms",
        rows: [
          { id: "admin:broadcast", title: "Broadcast" },
          { id: "admin:support", title: "Solicitações de suporte" },
        ],
      },
    ],
  });
}

async function sendBroadcastMenu(to) {
  broadcastSessions.set(to, { step: "choose_mode" });
  await sendList(to, {
    header: "Broadcast",
    body: "Como deseja enviar?",
    button: "Escolher",
    sections: [
      {
        title: "Audiência",
        rows: [
          { id: "admin:bc:aud:one", title: "Número específico" },
          { id: "admin:bc:aud:last", title: "Últimos contatos de suporte" },
        ],
      },
    ],
  });
}

/* ============================================================================
   VERIFICAÇÃO — GET /webhook
============================================================================ */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN)
    return res.status(200).send(challenge);
  return res.sendStatus(403);
});

/* ============================================================================
   RECEIVER — POST /webhook
============================================================================ */
router.post("/", async (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    // confirmações de status
    if (value?.statuses) return res.sendStatus(200);

    const msg = value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const type = msg.type;
    const adminFlag = isAdmin(from);

    knownContacts.add(from);

    /* ===================== TEXT ===================== */
    if (type === "text") {
      const body = String(msg.text?.body || "").trim();

      // ——— fluxo: SUPORTE coletando a 1ª mensagem ———
      const sup = supportSessions.get(from);
      if (sup?.step === "collect_message") {
        if (isStopText(body)) {
          supportSessions.delete(from);
          await sendText(from, "Suporte encerrado. Voltando ao menu…");
          await sendMainMenu(from, adminFlag);
          return res.sendStatus(200);
        }
        let t = sup.ticketId
          ? supportTickets.find((x) => x.id === sup.ticketId)
          : null;
        if (!t) {
          t = {
            id: `SUP-${supportSeq++}`,
            from,
            category: sup.category || "other",
            messages: [],
            status: "open",
            createdAt: Date.now(),
          };
          supportTickets.push(t);
          supportSessions.set(from, { ...sup, ticketId: t.id });
        }
        t.messages.push({ at: Date.now(), from, text: body });

        await sendText(
          from,
          "✅ Recebido. Um atendente vai te responder por aqui em breve."
        );
        await notifyAdmins(
          `🆕 Ticket ${t.id} de ${fmtPhoneLabel(from)} — categoria: ${t.category}\n\nMensagem:\n${body}`
        );
        return res.sendStatus(200);
      }

      // ——— fluxo: ADMIN reply em um contato ———
      const rep = replySessions.get(from);
      if (adminFlag && rep?.replyingToPhone) {
        if (isStopText(body)) {
          replySessions.delete(from);
          await sendText(from, "Reply encerrado. Voltando ao painel…");
          await sendAdminPanel(from);
          return res.sendStatus(200);
        }
        try {
          await sendText(rep.replyingToPhone, body);
          await sendText(
            from,
            `✅ Enviado para ${fmtPhoneLabel(rep.replyingToPhone)}.`
          );
        } catch {
          await sendText(from, "Falha ao enviar.");
        }
        return res.sendStatus(200);
      }

      // ——— fluxo: ADMIN broadcast escrevendo texto ———
      const bc = broadcastSessions.get(from);
      if (adminFlag && bc?.step === "write_text") {
        if (isStopText(body)) {
          broadcastSessions.delete(from);
          await sendText(from, "Broadcast cancelado.");
          await sendAdminPanel(from);
          return res.sendStatus(200);
        }
        const text = body;
        if (bc.mode === "one") {
          if (!bc.target) {
            broadcastSessions.set(from, { step: "ask_target", mode: "one" });
            await sendText(from, "Informe o número (DDI+DDD+NÚMERO):");
            return res.sendStatus(200);
          }
          try {
            await sendText(bc.target, text);
            await sendText(
              from,
              `✅ Enviado para ${fmtPhoneLabel(bc.target)}.`
            );
          } catch {
            await sendText(from, "Falha em enviar para o alvo.");
          }
          broadcastSessions.delete(from);
          return res.sendStatus(200);
        } else if (bc.mode === "last") {
          let ok = 0,
            fail = 0;
          for (const ph of knownContacts) {
            try {
              await sendText(ph, text);
              ok++;
            } catch {
              fail++;
            }
          }
          await sendText(
            from,
            `Broadcast finalizado. OK: ${ok} • Falhas: ${fail}`
          );
          broadcastSessions.delete(from);
          return res.sendStatus(200);
        }
      }

      // ——— fluxo: ADMIN criação de evento (wizard) ———
      const createWiz = adminCreateSessions.get(from);
      if (adminFlag && createWiz) {
        const step = createWiz.step || "title";
        const draft = createWiz.draft || {};
        if (isStopText(body)) {
          adminCreateSessions.delete(from);
          await sendText(from, "Criação cancelada.");
          await sendAdminPanel(from);
          return res.sendStatus(200);
        }
        if (step === "title") {
          draft.title = body;
          adminCreateSessions.set(from, { step: "city", draft });
          await sendText(from, "Cidade? (ex.: Uberaba-MG)");
          return res.sendStatus(200);
        }
        if (step === "city") {
          draft.city = body;
          adminCreateSessions.set(from, { step: "venue", draft });
          await sendText(from, "Local? (ex.: Terraço 21)");
          return res.sendStatus(200);
        }
        if (step === "venue") {
          draft.venue = body;
          adminCreateSessions.set(from, { step: "date", draft });
          await sendText(from, "Data/hora (ISO ou dd/mm/aaaa hh:mm):");
          return res.sendStatus(200);
        }
        if (step === "date") {
          draft.date = body;
          adminCreateSessions.set(from, { step: "price", draft });
          await sendText(from, "Preço (apenas números, ex.: 60):");
          return res.sendStatus(200);
        }
        if (step === "price") {
          draft.price =
            Number(
              String(body).replace(/[^\d.,-]/g, "").replace(",", ".")
            ) || 0;
          adminCreateSessions.set(from, { step: "media", draft });
          await sendText(
            from,
            "Envie uma *imagem* agora ou mande *pular* para finalizar sem imagem."
          );
          return res.sendStatus(200);
        }
        if (step === "media") {
          if (normalize(body) === "pular") {
            const ev = db.createEvent(draft);
            adminCreateSessions.delete(from);
            await sendText(
              from,
              `✅ Evento criado: *${db.pureEventName(ev)}*\n${ev.city} · ${fmtDateBR(
                ev.date
              )}`
            );
            await sendEventActions(from, ev.id, true);
            return res.sendStatus(200);
          }
          await sendText(
            from,
            "Envie a imagem do evento (tipo: *imagem*)."
          );
          return res.sendStatus(200);
        }
      }

      // ——— fluxo: ADMIN edição de evento (wizard) ———
      const editWiz = adminEditSessions.get(from);
      if (adminFlag && editWiz) {
        const evId = editWiz.id;
        const step = editWiz.step || "choose";
        const patch = editWiz.patch || {};
        if (isStopText(body)) {
          adminEditSessions.delete(from);
          await sendText(from, "Edição cancelada.");
          await sendEventActions(from, evId, true);
          return res.sendStatus(200);
        }
        if (step === "title") {
          patch.title = body;
          db.updateEvent(evId, patch);
          adminEditSessions.delete(from);
          await sendText(from, "✅ Título atualizado.");
          await sendEventActions(from, evId, true);
          return res.sendStatus(200);
        }
        if (step === "city") {
          patch.city = body;
          db.updateEvent(evId, patch);
          adminEditSessions.delete(from);
          await sendText(from, "✅ Cidade atualizada.");
          await sendEventActions(from, evId, true);
          return res.sendStatus(200);
        }
        if (step === "venue") {
          patch.venue = body;
          db.updateEvent(evId, patch);
          adminEditSessions.delete(from);
          await sendText(from, "✅ Local atualizado.");
          await sendEventActions(from, evId, true);
          return res.sendStatus(200);
        }
        if (step === "date") {
          patch.date = body;
          db.updateEvent(evId, patch);
          adminEditSessions.delete(from);
          await sendText(from, "✅ Data atualizada.");
          await sendEventActions(from, evId, true);
          return res.sendStatus(200);
        }
        if (step === "price") {
          patch.price =
            Number(
              String(body).replace(/[^\d.,-]/g, "").replace(",", ".")
            ) || 0;
          db.updateEvent(evId, patch);
          adminEditSessions.delete(from);
          await sendText(from, "✅ Preço atualizado.");
          await sendEventActions(from, evId, true);
          return res.sendStatus(200);
        }
        if (step === "media") {
          await sendText(from, "Envie uma *imagem* para atualizar a mídia.");
          return res.sendStatus(200);
        }
      }

      // ——— comandos simples ———
      const n = normalize(body);
      if (n === "menu" || n === "oi" || n === "ola" || n === "olá") {
        await sendMainMenu(from, adminFlag);
        return res.sendStatus(200);
      }
      if (n.includes("suporte")) {
        await sendSupportMenu(from);
        return res.sendStatus(200);
      }

      await sendText(
        from,
        "Mande *menu* para ver opções, ou *suporte* para falar com a gente."
      );
      return res.sendStatus(200);
    }

    /* ===================== INTERACTIVE ===================== */
    if (type === "interactive") {
      const chosen =
        msg.interactive?.list_reply?.id ||
        msg.interactive?.button_reply?.id ||
        "";

      // ——— Menu principal ———
      if (chosen === "menu:events") {
        await sendEventsList(from, 1, 5);
        return res.sendStatus(200);
      }
      if (chosen === "menu:mytickets") {
        // Fallback: só tenta se existir db.listTickets; senão, mensagem neutra
        if (typeof db.listTickets === "function") {
          const tickets = db.listTickets(from); // modo phone → Array
          if (!tickets.length) {
            await sendText(
              from,
              "Você ainda não possui ingressos."
            );
            await sendMainMenu(from, isAdmin(from));
            return res.sendStatus(200);
          }
          const lines = tickets
            .slice(-5)
            .map(
              (t) =>
                `• #${t.id} • ${t.buyerName} • ${db.pureEventName(
                  db.findEvent?.(t.eventId) || t.eventId
                )} • ${t.code}`
            )
            .join("\n");
          await sendText(from, `Seus últimos ingressos:\n${lines}`);
        } else {
          await sendText(
            from,
            "Consulta de ingressos ainda não está habilitada neste ambiente."
          );
        }
        await sendMainMenu(from, isAdmin(from));
        return res.sendStatus(200);
      }
      if (chosen === "menu:support") {
        await sendSupportMenu(from);
        return res.sendStatus(200);
      }
      if (chosen === "menu:setup") {
        await sendText(
          from,
          "Abra o site e escolha um modelo em Organizadores: https://ingressai.chat/#organizadores"
        );
        return res.sendStatus(200);
      }
      if (chosen === "menu:dashboard") {
        await sendText(
          from,
          "Login do Dashboard: https://ingressai.chat/app/login.html"
        );
        return res.sendStatus(200);
      }
      if (chosen === "menu:back") {
        await sendMainMenu(from, isAdmin(from));
        return res.sendStatus(200);
      }

      // ——— Admin painel ———
      if (chosen === "admin:panel") {
        if (!isAdmin(from)) {
          await sendText(from, "Acesso restrito.");
          return res.sendStatus(200);
        }
        await sendAdminPanel(from);
        return res.sendStatus(200);
      }
      if (chosen === "admin:events") {
        if (!isAdmin(from)) {
          await sendText(from, "Acesso restrito.");
          return res.sendStatus(200);
        }
        await sendEventsList(from, 1, 10);
        return res.sendStatus(200);
      }
      if (chosen === "admin:create") {
        if (!isAdmin(from)) {
          await sendText(from, "Acesso restrito.");
          return res.sendStatus(200);
        }
        adminCreateSessions.set(from, { step: "title", draft: {} });
        await sendText(from, "Título do evento?");
        return res.sendStatus(200);
      }
      if (chosen === "admin:broadcast") {
        if (!isAdmin(from)) {
          await sendText(from, "Acesso restrito.");
          return res.sendStatus(200);
        }
        await sendBroadcastMenu(from);
        return res.sendStatus(200);
      }
      if (chosen === "admin:support") {
        if (!isAdmin(from)) {
          await sendText(from, "Acesso restrito.");
          return res.sendStatus(200);
        }
        const open = [...supportTickets]
          .filter((t) => t.status !== "closed")
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 10);
        if (!open.length) {
          await sendText(from, "Nenhum ticket aberto.");
          await sendAdminPanel(from);
          return res.sendStatus(200);
        }
        const rows = open.map((t) => ({
          id: `admin:sup:reply:${t.from}`,
          title: fit(`Ticket ${t.id}`, 24),
          description: fitDesc(
            `${fmtPhoneLabel(t.from)} • ${t.category} • msgs:${t.messages.length}`
          ),
        }));
        await sendList(from, {
          header: "Tickets de suporte",
          body: "Escolha alguém para responder:",
          button: "Escolher",
          sections: [{ title: "Abertos", rows }],
        });
        return res.sendStatus(200);
      }
      if (chosen.startsWith("admin:sup:reply:")) {
        if (!isAdmin(from)) return res.sendStatus(200);
        const phone = chosen.split(":").slice(-1)[0];
        replySessions.set(from, { replyingToPhone: phone });
        await sendText(
          from,
          `Você está respondendo ${fmtPhoneLabel(
            phone
          )}. Envie a mensagem.\n\nMande *voltar* para encerrar.`
        );
        return res.sendStatus(200);
      }

      // ——— Broadcast ———
      if (chosen === "admin:bc:aud:one") {
        if (!isAdmin(from)) return res.sendStatus(200);
        broadcastSessions.set(from, { step: "ask_target", mode: "one" });
        await sendText(from, "Informe o número (DDI+DDD+NÚMERO):");
        return res.sendStatus(200);
      }
      if (chosen === "admin:bc:aud:last") {
        if (!isAdmin(from)) return res.sendStatus(200);
        broadcastSessions.set(from, { step: "write_text", mode: "last" });
        await sendText(
          from,
          `Digite o texto do broadcast. Destinatários: ${knownContacts.size}.`
        );
        return res.sendStatus(200);
      }

      // ——— Eventos: paginação/detalhe/compra ———
      if (chosen.startsWith("events:page:")) {
        const page = Number(chosen.split(":")[2] || "1") || 1;
        await sendEventsList(from, page, 5);
        return res.sendStatus(200);
      }
      if (chosen.startsWith("events:view:")) {
        const id = chosen.split(":")[2];
        await sendEventActions(from, id, isAdmin(from));
        return res.sendStatus(200);
      }
      if (chosen.startsWith("buy:")) {
        const id = chosen.slice(4);
        if (!API_BASE) {
          await sendText(from, "⚠️ API_BASE não configurado.");
          return res.sendStatus(200);
        }
        const buyerName = value?.contacts?.[0]?.profile?.name || "Participante";
        try {
          await axios.get(`${API_BASE}/purchase/start`, {
            params: { ev: id, to: from, name: buyerName, qty: 1 },
            timeout: 15000,
          });
          await sendText(
            from,
            `✅ Compra iniciada para *${buyerName}*. Você receberá o PDF do ingresso aqui.`
          );
        } catch {
          await sendText(
            from,
            "Não consegui iniciar agora. Tente novamente em instantes."
          );
        }
        return res.sendStatus(200);
      }

      // ——— Suporte ———
      if (chosen === "support:end") {
        supportSessions.delete(from);
        await sendText(from, "Suporte encerrado. Voltando ao menu…");
        await sendMainMenu(from, isAdmin(from));
        return res.sendStatus(200);
      }
      if (chosen.startsWith("support:cat:")) {
        const category = chosen.split(":")[2];
        const t = {
          id: `SUP-${supportSeq++}`,
          from,
          category,
          messages: [],
          status: "open",
          createdAt: Date.now(),
        };
        supportTickets.push(t);
        supportSessions.set(from, {
          step: "collect_message",
          category,
          ticketId: t.id,
        });
        await sendText(
          from,
          `📩 Ticket criado (*${category}*).\n\nResponda com sua mensagem e um atendente vai responder por aqui.\nEnvie *voltar* a qualquer momento para voltar ao menu.`
        );
        await notifyAdmins(
          `🆕 Ticket ${t.id} de ${fmtPhoneLabel(from)} — categoria: ${category}`
        );
        return res.sendStatus(200);
      }

      // ——— Admin editar/excluir ———
      if (chosen.startsWith("admin:ev:edit:")) {
        if (!isAdmin(from)) return res.sendStatus(200);
        const id = chosen.split(":")[3];
        const ev = db.findEvent(id);
        if (!ev) {
          await sendText(from, "Evento não encontrado.");
          return res.sendStatus(200);
        }
        adminEditSessions.set(from, { id, step: "choose", patch: {} });
        await sendList(from, {
          header: fit(db.pureEventName(ev), 50),
          body: "O que deseja editar?",
          button: "Escolher",
          sections: [
            {
              title: "Campos",
              rows: [
                { id: `admin:ev:set:title:${id}`, title: "Título" },
                { id: `admin:ev:set:city:${id}`, title: "Cidade" },
                { id: `admin:ev:set:venue:${id}`, title: "Local" },
                { id: `admin:ev:set:date:${id}`, title: "Data" },
                { id: `admin:ev:set:price:${id}`, title: "Preço" },
                { id: `admin:ev:set:media:${id}`, title: "Mídia (imagem)" },
              ],
            },
          ],
        });
        return res.sendStatus(200);
      }
      if (chosen.startsWith("admin:ev:set:")) {
        if (!isAdmin(from)) return res.sendStatus(200);
        const [, , , field, id] = chosen.split(":");
        const session = adminEditSessions.get(from) || {
          id,
          step: "choose",
          patch: {},
        };
        session.id = id;
        session.step = field;
        adminEditSessions.set(from, session);
        const promptBy = {
          title: "Novo título:",
          city: "Nova cidade (ex.: Uberaba-MG):",
          venue: "Novo local:",
          date: "Nova data (ISO ou dd/mm/aaaa hh:mm):",
          price: "Novo preço (apenas números):",
          media: "Envie uma *imagem* agora.",
        };
        await sendText(from, promptBy[field] || "Envie o novo valor.");
        return res.sendStatus(200);
      }
      if (chosen.startsWith("admin:ev:delete:")) {
        if (!isAdmin(from)) return res.sendStatus(200);
        const id = chosen.split(":")[3];
        const ev = db.findEvent(id);
        if (!ev) {
          await sendText(from, "Evento não encontrado.");
          return res.sendStatus(200);
        }
        await sendButtons(
          from,
          `Confirma excluir *${db.pureEventName(ev)}*?`,
          [
            { id: `admin:ev:confirmdel:${id}`, title: "Confirmar" },
            { id: `events:view:${id}`, title: "Cancelar" },
          ]
        );
        return res.sendStatus(200);
      }
      if (chosen.startsWith("admin:ev:confirmdel:")) {
        if (!isAdmin(from)) return res.sendStatus(200);
        const id = chosen.split(":")[3];
        db.deleteEvent(id);
        await sendText(from, "✅ Evento excluído.");
        await sendEventsList(from, 1, 10);
        return res.sendStatus(200);
      }

      // default → volta pro menu
      await sendMainMenu(from, isAdmin(from));
      return res.sendStatus(200);
    }

    /* ===================== IMAGE (mídia p/ evento) ===================== */
    if (type === "image") {
      const editWiz = adminEditSessions.get(from);
      const createWiz = adminCreateSessions.get(from);

      const media = await extractMediaFromMessage(msg);
      if (!media?.url) {
        await sendText(from, "Não consegui obter a mídia. Tente novamente.");
        return res.sendStatus(200);
      }

      if (createWiz?.step === "media") {
        const draft = createWiz.draft || {};
        draft.media = { url: media.url, type: media.mime || "image/jpeg" };
        const ev = db.createEvent(draft);
        adminCreateSessions.delete(from);
        await sendText(
          from,
          `✅ Evento criado: *${db.pureEventName(ev)}*\n${ev.city} · ${fmtDateBR(
            ev.date
          )}`
        );
        await sendEventActions(from, ev.id, true);
        return res.sendStatus(200);
      }

      if (editWiz?.step === "media" && editWiz?.id) {
        db.updateEvent(editWiz.id, {
          media: { url: media.url, type: media.mime || "image/jpeg" },
        });
        adminEditSessions.delete(from);
        await sendText(from, "✅ Mídia atualizada.");
        await sendEventActions(from, editWiz.id, true);
        return res.sendStatus(200);
      }

      await sendText(
        from,
        isAdmin(from)
          ? "Imagem recebida. Abra *Admin → Gerenciar eventos* para associar."
          : "Imagem recebida. Se precisar de ajuda, mande *suporte*."
      );
      return res.sendStatus(200);
    }

    // ——— outros tipos ———
    await sendText(
      from,
      "Recebi sua mensagem. Mande *menu* para ver opções."
    );
    return res.sendStatus(200);
  } catch (e) {
    console.error("webhook.error", e?.response?.data || e.message);
    return res.sendStatus(200);
  }
});

export default router;
