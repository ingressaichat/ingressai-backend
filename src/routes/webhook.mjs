// src/routes/webhook.mjs
import { Router } from "express";
import { sendText, sendList } from "../lib/wa.mjs"; // caminho correto
import { listEvents, findEvent, pureEventName, addEvent } from "../lib/db.mjs"; // addEvent
import { log } from "../utils.mjs";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

/* ========= Config ========= */
export const webhookRouter = Router();

const BRAND = process.env.BRAND_NAME || "IngressAI";
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || "").split(",").map(s => s.trim()).filter(Boolean);
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION  = process.env.GRAPH_API_VERSION || "v23.0";
const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";

/* ========= Helpers ========= */
const onlyDigits = s => String(s || "").replace(/\D/g, "");
const isAdmin = (from) => ADMIN_PHONES.some(a => onlyDigits(a) === onlyDigits(from));
const fit = (s, max = 24) => (String(s || "").length <= max ? String(s || "") : (String(s || "").slice(0, max - 1) + "…"));
const fmtDate = (iso) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const h = d.getHours();
  const m = d.getMinutes();
  const hora = m === 0 ? `${h}h` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${dia} ${hora}`;
};

// parse "20/09 23:00" -> ISO com -03:00
function parsePtDate(str) {
  const s = String(str || "").trim();
  const re = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*(\d{1,2})(?::(\d{2}))?/;
  const m = s.match(re);
  if (!m) return null;
  const dd = Number(m[1]), MM = Number(m[2]);
  let yyyy = m[3] ? Number(m[3]) : (new Date()).getFullYear();
  if (yyyy < 100) yyyy += 2000;
  const HH = Number(m[4] || 20), mm = Number(m[5] || 0);
  const pad = (n) => String(n).padStart(2,"0");
  return `${yyyy}-${pad(MM)}-${pad(dd)}T${pad(HH)}:${pad(mm)}:00-03:00`;
}

/* ========= Menus por LISTA ========= */

async function sendMainMenu(to, adminFlag) {
  const sections = [
    {
      title: "Explorar",
      rows: [
        { id: "menu:events",    title: "Ver eventos" },
        { id: "menu:mytickets", title: "Meus ingressos" },
        { id: "menu:support",   title: "Suporte" },
      ],
    },
  ];
  if (adminFlag) {
    sections.push({
      title: "Admin",
      rows: [
        { id: "admin:panel",  title: "Painel do admin" },
        { id: "admin:create", title: "Criar evento (assistente)" }, // <- novo fluxo simples
      ],
    });
  }

  await sendList(to, {
    header: `${BRAND}`,
    body: "Selecione uma opção abaixo:",
    button: "Escolher",
    sections,
  });
}

async function sendEventsList(to, page = 1, size = 5) {
  const { items, totalPages, page: p } = listEvents(page, size);

  const rows = items.map(ev => {
    const title = fit(pureEventName(ev), 24);
    const desc  = `${ev.city} · ${fmtDate(ev.date)}`;
    return { id: `events:view:${ev.id}`, title, description: desc };
  });

  const navRows = [];
  if (p > 1) navRows.push({ id: `events:page:${p - 1}`, title: "« Página anterior" });
  if (p < totalPages) navRows.push({ id: `events:page:${p + 1}`, title: "Próxima página »" });

  const sections = [{ title: "Eventos em destaque", rows }];
  if (navRows.length) sections.push({ title: "Navegar", rows: navRows });

  await sendList(to, {
    header: "Eventos",
    body: "Escolha um evento para ver detalhes:",
    button: "Ver opções",
    sections,
  });
}

async function sendEventActions(to, evId) {
  const ev = findEvent(evId);
  if (!ev) { await sendText(to, "Evento não encontrado."); return; }
  const title = fit(pureEventName(ev), 24);
  const meta = `${ev.city} · ${fmtDate(ev.date)} · ${ev.price || ""}`.replace(/\s+·\s+$/,"");

  await sendList(to, {
    header: title,
    body: `${meta}\n\nO que você deseja fazer?`,
    button: "Escolher",
    sections: [{
      title: "Ações",
      rows: [
        { id: `buy:${ev.id}`,  title: "Comprar ingresso" },
        { id: `events:page:1`, title: "Voltar aos eventos" },
      ],
    }],
  });
}

/* ========= Admin: Assistente de criação ========= */

// Sessões de criação por admin
const adminSessions = new Map(); // from -> { step, ev }

const CITIES = ["Uberaba", "São Paulo", "Belo Horizonte", "Rio de Janeiro", "Outra cidade"];

async function startCreateWizard(to) {
  adminSessions.set(to, { step: "image", ev: { city: "Uberaba", price: "R$ 20" } });
  await sendList(to, {
    header: "Criar evento",
    body: "Envie a CAPA agora (foto) — ou escolha pular:",
    button: "Escolher",
    sections: [{
      title: "Capa (opcional)",
      rows: [
        { id: "ac:img:skip", title: "Pular imagem" },
        { id: "ac:cancel",   title: "Cancelar" },
      ]
    }]
  });
}

async function askTitle(to) {
  const s = adminSessions.get(to); if (!s) return;
  s.step = "title"; adminSessions.set(to, s);
  await sendText(to, "📝 *Título do evento?*\nEx: _Hello World_.");
}

async function askCity(to) {
  const s = adminSessions.get(to); if (!s) return;
  s.step = "city"; adminSessions.set(to, s);
  await sendList(to, {
    header: "Cidade",
    body: "Escolha a cidade do evento:",
    button: "Escolher",
    sections: [{
      title: "Cidades",
      rows: CITIES.map(c => ({ id: `ac:city:${c}`, title: c })),
    }]
  });
}

async function askDate(to) {
  const s = adminSessions.get(to); if (!s) return;
  s.step = "date"; adminSessions.set(to, s);
  await sendText(to, "📅 *Data e hora?*\nFormato rápido: _20/09 23:00_.");
}

async function askPrice(to) {
  const s = adminSessions.get(to); if (!s) return;
  s.step = "price"; adminSessions.set(to, s);
  await sendList(to, {
    header: "Preço",
    body: "Selecione um preço ou digite em reais (ex: 35):",
    button: "Escolher",
    sections: [{
      title: "Sugestões",
      rows: [
        { id: "ac:price:R$ 10", title: "R$ 10" },
        { id: "ac:price:R$ 20", title: "R$ 20" },
        { id: "ac:price:R$ 30", title: "R$ 30" },
        { id: "ac:price:manual", title: "Vou digitar" },
      ]
    }]
  });
}

async function confirmPublish(to) {
  const s = adminSessions.get(to); if (!s) return;
  s.step = "confirm"; adminSessions.set(to, s);
  const ev = s.ev;
  const resumo = [
    `*${ev.title || "(sem título)"}*`,
    `${ev.city || "Cidade?"} · ${ev.date ? fmtDate(ev.date) : "Data?"} · ${ev.price || ""}`
  ].join("\n");

  await sendList(to, {
    header: "Publicar evento?",
    body: `${resumo}\n\nCapa: ${ev.imageUrl ? "✅" : "—"}`,
    button: "Escolher",
    sections: [{
      title: "Confirmar",
      rows: [
        { id: "ac:confirm:publish", title: "✅ Publicar" },
        { id: "ac:confirm:cancel",  title: "Cancelar" }
      ]
    }]
  });
}

async function finishPublish(to) {
  const s = adminSessions.get(to); if (!s) return;
  const ev = s.ev;
  if (!ev.title || !ev.city || !ev.date) {
    await sendText(to, "Faltou título, cidade ou data. Voltando ao início.");
    await startCreateWizard(to);
    return;
  }
  const created = addEvent({
    title: ev.title,
    city: ev.city,
    venue: ev.venue || "",
    date: ev.date,
    price: ev.price || "",
    imageUrl: ev.imageUrl || ""
  });
  adminSessions.delete(to);
  await sendText(to, `✅ Publicado: *${created.title}* — ${created.city} (${fmtDate(created.date)})`);
  await sendEventActions(to, created.id);
}

// salvar mídia do WhatsApp em /uploads e retornar URL pública
async function downloadMediaToUploads(mediaId) {
  if (!TOKEN || !mediaId) return null;
  try {
    const meta = await axios.get(`${GRAPH_API_BASE}/${GRAPH_VERSION}/${mediaId}`, {
      params: { access_token: TOKEN }
    }).then(r => r.data);
    const url = meta?.url;
    const mime = meta?.mime_type || "image/jpeg";
    if (!url) return null;

    const buf = await axios.get(url, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(r => Buffer.from(r.data));

    const ext = mime.includes("png") ? "png" : (mime.includes("webp") ? "webp" : "jpg");
    const dir = path.join(UPLOADS_DIR, "media");
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    const file = path.join(dir, `wa-${mediaId}.${ext}`);
    await fs.writeFile(file, buf);
    return `${BASE_URL}/uploads/media/wa-${mediaId}.${ext}`;
  } catch (e) {
    log("media.download.error", e?.response?.data || e.message);
    return null;
  }
}

/* ========= Ações (comprar - mock para demo) ========= */

async function startPurchase(to, evId) {
  try {
    const url = `${BASE_URL}/purchase/start?ev=${encodeURIComponent(evId)}&to=${encodeURIComponent(to)}&name=${encodeURIComponent("Cliente")}&qty=1`;
    await axios.get(url);
    await sendText(to, "✅ Compra iniciada! Você receberá seu ingresso em instantes.");
  } catch (e) {
    log("purchase.start.error", e?.response?.data || e.message);
    await sendText(to, "Não consegui iniciar a compra agora. Tente novamente em instantes.");
  }
}

/* ========= WEBHOOK ========= */

// GET verify
webhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "ingressai123";

  if (mode === "subscribe" && token === VERIFY_TOKEN) res.status(200).send(challenge);
  else res.sendStatus(403);
});

// POST receiver
webhookRouter.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const changes = body?.entry?.[0]?.changes?.[0];
    const value = changes?.value;

    // status callbacks
    if (value?.statuses) {
      for (const s of value.statuses) {
        log("WA status", { ...s, t: new Date().toISOString() });
      }
      return res.sendStatus(200);
    }

    const msg = value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const admin = isAdmin(from);

    // ===== INTERACTIVE (lista/botão) =====
    if (msg.type === "interactive") {
      const inter = msg.interactive;
      const chosen = inter?.list_reply?.id || inter?.button_reply?.id || "";
      log("incoming.message", { event: "incoming.message", from, type: "interactive", id: chosen, title: inter?.list_reply?.title || inter?.button_reply?.title });

      // Menu
      if (chosen.startsWith("menu:")) {
        const action = chosen.split(":")[1];
        if (action === "events")      await sendEventsList(from, 1);
        else if (action === "mytickets") await sendText(from, "Você ainda não possui ingressos vinculados a este número.");
        else if (action === "support")   await sendText(from, "Nosso time responde por aqui mesmo. Envie sua dúvida.");
        else await sendMainMenu(from, admin);
        return res.sendStatus(200);
      }

      // Eventos
      if (chosen.startsWith("events:page:")) {
        const page = parseInt(chosen.split(":")[2] || "1", 10);
        await sendEventsList(from, page);
        return res.sendStatus(200);
      }
      if (chosen.startsWith("events:view:")) {
        const evId = chosen.split(":")[2];
        await sendEventActions(from, evId);
        return res.sendStatus(200);
      }
      if (chosen.startsWith("buy:")) {
        const evId = chosen.split(":")[1];
        await startPurchase(from, evId);
        return res.sendStatus(200);
      }

      // Admin
      if (chosen === "admin:panel") {
        if (admin) await sendMainMenu(from, true);
        else await sendMainMenu(from, false);
        return res.sendStatus(200);
      }
      if (chosen === "admin:create") {
        if (!admin) { await sendMainMenu(from, false); return res.sendStatus(200); }
        await startCreateWizard(from);
        return res.sendStatus(200);
      }

      // Assistente (ids começam com ac:)
      if (chosen.startsWith("ac:")) {
        const s = adminSessions.get(from);
        if (!s) { await startCreateWizard(from); return res.sendStatus(200); }

        // pular imagem
        if (chosen === "ac:img:skip") { await askTitle(from); return res.sendStatus(200); }

        // cidade
        if (chosen.startsWith("ac:city:")) {
          const city = chosen.split(":").slice(2).join(":");
          if (city === "Outra cidade") {
            s.step = "city-manual"; adminSessions.set(from, s);
            await sendText(from, "Cidade? Digite o nome (ex.: Uberaba).");
            return res.sendStatus(200);
          }
          s.ev.city = city; adminSessions.set(from, s);
          await askDate(from);
          return res.sendStatus(200);
        }

        // preço
        if (chosen.startsWith("ac:price:")) {
          const val = chosen.split(":").slice(2).join(":");
          if (val === "manual") {
            s.step = "price-manual"; adminSessions.set(from, s);
            await sendText(from, "Preço em reais (apenas número). Ex.: 35");
            return res.sendStatus(200);
          }
          s.ev.price = val; adminSessions.set(from, s);
          await confirmPublish(from);
          return res.sendStatus(200);
        }

        // confirmar
        if (chosen === "ac:confirm:publish") { await finishPublish(from); return res.sendStatus(200); }
        if (chosen === "ac:confirm:cancel" || chosen === "ac:cancel") {
          adminSessions.delete(from);
          await sendText(from, "Cancelado.");
          await sendMainMenu(from, true);
          return res.sendStatus(200);
        }

        // fallback do assistente
        await sendMainMenu(from, admin);
        return res.sendStatus(200);
      }

      // fallback geral
      await sendMainMenu(from, admin);
      return res.sendStatus(200);
    }

    // ===== MÍDIA (imagem/doc) =====
    if (admin && (msg.type === "image" || msg.type === "document")) {
      const caption = msg[msg.type]?.caption || "";
      // 1) Se estiver no assistente esperando imagem, baixa e segue
      const s = adminSessions.get(from);
      if (s && s.step === "image" && msg.type === "image") {
        const mediaId = msg.image?.id;
        const url = await downloadMediaToUploads(mediaId);
        if (url) s.ev.imageUrl = url;
        adminSessions.set(from, s);
        await askTitle(from);
        return res.sendStatus(200);
      }

      // 2) LEGADO: legenda "criar:" (continua funcionando)
      if (/^\s*criar\s*:/i.test(caption)) {
        log("admin.create.caption", { from, caption });
        await sendText(from, "🆕 Recebi os dados do evento e a mídia. Vou atualizar a landing (mock).");
        return res.sendStatus(200);
      }
    }

    // ===== TEXTO =====
    if (msg.type === "text") {
      const text = (msg.text?.body || "").trim();
      log("incoming.message", { event: "incoming.message", from, type: "text", text });

      // comandos simples para admins
      if (admin && /^criar evento$/i.test(text)) {
        await startCreateWizard(from);
        return res.sendStatus(200);
      }

      // fluxo do assistente (etapas que exigem texto)
      const s = admin ? adminSessions.get(from) : null;
      if (s) {
        if (s.step === "title") {
          s.ev.title = text;
          adminSessions.set(from, s);
          await askCity(from);
          return res.sendStatus(200);
        }
        if (s.step === "city-manual") {
          s.ev.city = text;
          adminSessions.set(from, s);
          await askDate(from);
          return res.sendStatus(200);
        }
        if (s.step === "date") {
          const iso = parsePtDate(text);
          if (!iso) {
            await sendText(from, "Formato inválido. Tente: *20/09 23:00*");
            return res.sendStatus(200);
          }
          s.ev.date = iso;
          adminSessions.set(from, s);
          await askPrice(from);
          return res.sendStatus(200);
        }
        if (s.step === "price-manual") {
          const n = Number(String(text).replace(",", ".").replace(/[^\d\.]/g, ""));
          s.ev.price = isFinite(n) && n > 0 ? `R$ ${Math.round(n)}` : "R$ 20";
          adminSessions.set(from, s);
          await confirmPublish(from);
          return res.sendStatus(200);
        }
      }

      // default: abre menu (UX sem digitação)
      await sendMainMenu(from, admin);
      return res.sendStatus(200);
    }

    // Outros tipos -> menu
    await sendMainMenu(from, admin);
    return res.sendStatus(200);

  } catch (e) {
    log("webhook.error", e?.response?.data || e.message);
    return res.sendStatus(200);
  }
});
