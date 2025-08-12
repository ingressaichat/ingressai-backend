// src/index.cjs
// IngressAI WhatsApp Backend - Railway ready (Express + Axios - CommonJS)
// Comandos de Boss: /criarevento, /broadcast, /stats

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

// ============== ENV ==============
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "ingressai123";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const WABA_ID = process.env.WABA_ID || "";
const APP_SECRET = process.env.APP_SECRET || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();

// ============== LOG ==============
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[LOG_LEVEL] ?? 2;
function log(level, ...args) {
  if ((levels[level] ?? 2) <= currentLevel) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

// ============== ADMIN UTILS ==============
function normalizeMsisdn(input) {
  if (!input) return "";
  return String(input).replace(/\D+/g, ""); // mantém só dígitos
}
const ADMIN_SET = new Set(
  (process.env.ADMIN_PHONES || "")
    .split(",")
    .map(s => normalizeMsisdn(s))
    .filter(Boolean)
);
function isAdmin(msisdnFromWebhook) {
  const from = normalizeMsisdn(msisdnFromWebhook);
  const ok = ADMIN_SET.has(from);
  if (ok) log("info", "[ADMIN CHECK] from:", from, "=> ADMIN ✅");
  else log("debug", "[ADMIN CHECK] from:", from, "| admins:", [...ADMIN_SET]);
  return ok;
}

// ============== STATE (memória) ==============
const startedAt = Date.now();
const stats = {
  received: 0,
  sent: 0,
  users: new Set(),
  lastMessages: [], // [{from,text,ts}]
};
const events = new Map(); // id -> {id,title,date,time,place,createdBy,createdAt}
let eventSeq = 1;

function pushLastMessage(from, text) {
  stats.lastMessages.unshift({ from, text, ts: new Date().toISOString() });
  if (stats.lastMessages.length > 20) stats.lastMessages.pop();
}

// ============== APP (raw body p/ assinatura) ==============
const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ============== WEBHOOK SIGNATURE (opcional) ==============
function verifySignature(req) {
  try {
    const signature = req.get("x-hub-signature-256") || "";
    if (!APP_SECRET || !signature.startsWith("sha256=")) return true; // sem secret → pula validação
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", APP_SECRET).update(req.rawBody || "").digest("hex");
    const ok = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) log("warn", "Webhook signature mismatch");
    return ok;
  } catch (e) {
    log("warn", "verifySignature error:", e.message);
    return false;
  }
}

// ============== WHATSAPP SENDERS ==============
async function sendText(to, message) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  try {
    const { data, status } = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: normalizeMsisdn(to),
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
    stats.sent += 1;
    log("info", "Message sent:", status, data?.messages?.[0]?.id || "");
    return data;
  } catch (err) {
    const status = err.response?.status;
    const resp = err.response?.data;
    log("error", "sendText error:", status || "", resp || err.message);
    throw err;
  }
}

async function sendTemplate(to, name, languageCode = "pt_BR", components) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: normalizeMsisdn(to),
    type: "template",
    template: {
      name,
      language: { code: languageCode },
    },
  };
  if (components) payload.template.components = components;
  try {
    const { data, status } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    stats.sent += 1;
    log("info", "Template sent:", status, data?.messages?.[0]?.id || "");
    return data;
  } catch (err) {
    log("error", "sendTemplate error:", err.response?.status || "", err.response?.data || err.message);
    throw err;
  }
}

// ============== HELPERS DE COMANDO ==============
function parsePipeArgs(s, expectedParts) {
  // "a | b | c" → ["a","b","c"] aparadas
  const parts = (s || "").split("|").map(p => p.trim()).filter(Boolean);
  if (expectedParts && parts.length < expectedParts) return null;
  return parts;
}
function shortId(n) {
  const s = String(n).padStart(4, "0");
  return s.slice(-4);
}
function uptimeStr() {
  const ms = Date.now() - startedAt;
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / (1000 * 60)) % 60;
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}

// ============== ROUTES ==============

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, env: NODE_ENV, uptime: uptimeStr() });
});

// Debug env (mascarado)
app.get("/debug/env", (req, res) => {
  const mask = v => (v ? String(v).slice(0, 4) + "..." + String(v).slice(-4) : "");
  res.json({
    NODE_ENV,
    LOG_LEVEL,
    PORT,
    PHONE_NUMBER_ID: mask(PHONE_NUMBER_ID),
    WABA_ID: mask(WABA_ID),
    VERIFY_TOKEN: !!VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN: !!WHATSAPP_ACCESS_TOKEN,
    APP_SECRET: !!APP_SECRET,
    ADMIN_PHONES: [...ADMIN_SET],
  });
});

// Webhook verify (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    log("info", "Webhook verified");
    return res.status(200).send(challenge);
  }
  log("warn", "Webhook verify failed");
  return res.sendStatus(403);
});

// Webhook receive (POST)
app.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.sendStatus(403);

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages || !messages[0]) {
      if (value?.statuses?.[0]) {
        const st = value.statuses[0];
        log("info", "Status:", {
          id: st.id,
          status: st.status,
          recipient_id: st.recipient_id,
        });
      } else {
        log("debug", "Webhook non-message payload received");
      }
      return res.sendStatus(200);
    }

    const msg = messages[0];
    const from = msg.from; // dígitos E.164 sem '+'
    const type = msg.type;
    stats.received += 1;
    stats.users.add(from);

    // Extrai texto genérico
    let userText = "";
    if (type === "text") userText = msg.text?.body?.trim() || "";
    if (type === "button") userText = msg.button?.text || msg.button?.payload || "";
    if (type === "interactive") {
      const ict = msg.interactive?.type;
      if (ict === "button_reply") userText = msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id || "";
      if (ict === "list_reply") userText = msg.interactive?.list_reply?.title || msg.interactive?.list_reply?.id || "";
    }
    pushLastMessage(from, userText);
    log("info", "Webhook received:", { from, type, text: userText });

    const admin = isAdmin(from);

    // ---- Regras simples comuns ----
    if (/^ping$/i.test(userText)) {
      await sendText(from, admin ? "pong 👑" : "pong");
      return res.sendStatus(200);
    }

    // ========== COMANDOS DE BOSS ==========
    if (admin && /^\/?help$/i.test(userText)) {
      await sendText(
        from,
        [
          "👑 Comandos do Boss:",
          "• ping → teste rápido",
          "• /status → status do serviço",
          "• /stats → métricas desde o último restart",
          "• /criarevento titulo | data | hora | local",
          "• /broadcast fone1,fone2,... | Mensagem",
        ].join("\n")
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?status$/i.test(userText)) {
      await sendText(
        from,
        [
          "📊 Status do serviço:",
          `• NODE_ENV: ${NODE_ENV}`,
          `• LOG_LEVEL: ${LOG_LEVEL}`,
          `• PHONE_NUMBER_ID: ${PHONE_NUMBER_ID}`,
          `• WABA_ID: ${WABA_ID}`,
          `• Uptime: ${uptimeStr()}`,
        ].join("\n")
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?stats$/i.test(userText)) {
      const last = stats.lastMessages.slice(0, 5).map(m => `- ${m.from}: "${m.text}" @ ${m.ts}`).join("\n") || "- (vazio)";
      await sendText(
        from,
        [
          "📈 Stats (desde o restart):",
          `• Recebidas: ${stats.received}`,
          `• Enviadas: ${stats.sent}`,
          `• Usuários únicos: ${stats.users.size}`,
          `• Eventos criados: ${events.size}`,
          `• Uptime: ${uptimeStr()}`,
          "• Últimas 5 msgs:",
          last,
        ].join("\n")
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?criarevento\s+/i.test(userText)) {
      const raw = userText.replace(/^\/?criarevento\s+/i, "");
      const parts = parsePipeArgs(raw, 4);
      if (!parts) {
        await sendText(from, "Uso: /criarevento titulo | data | hora | local");
        return res.sendStatus(200);
      }
      const [title, date, time, place] = parts;
      const id = shortId(eventSeq++);
      events.set(id, {
        id,
        title,
        date,
        time,
        place,
        createdBy: from,
        createdAt: new Date().toISOString(),
      });
      await sendText(
        from,
        [
          "✅ Evento criado!",
          `• ID: ${id}`,
          `• Título: ${title}`,
          `• Data: ${date} às ${time}`,
          `• Local: ${place}`,
        ].join("\n")
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?broadcast\s+/i.test(userText)) {
      const raw = userText.replace(/^\/?broadcast\s+/i, "");
      const [phonesStr, ...msgParts] = raw.split("|");
      const message = (msgParts.join("|") || "").trim();
      const phones = (phonesStr || "")
        .split(",")
        .map(s => normalizeMsisdn(s))
        .filter(Boolean);

      if (!phones.length || !message) {
        await sendText(from, "Uso: /broadcast phone1,phone2,... | Mensagem");
        return res.sendStatus(200);
      }

      let ok = 0, fail = 0;
      for (const p of phones) {
        try {
          await sendText(p, message);
          ok++;
        } catch {
          fail++;
        }
      }
      await sendText(from, `📣 Broadcast concluído. Sucesso: ${ok} | Falhas: ${fail}`);
      return res.sendStatus(200);
    }

    // ========== FIM COMANDOS DE BOSS ==========

    if (admin) {
      await sendText(from, "Fala, Boss! 👑 Use /help para ver os comandos.");
      return res.sendStatus(200);
    }

    // Fluxo padrão p/ não-admin
    if (userText) {
      await sendText(from, "Olá! Eu sou o IngressAI. Digite 'ping' para testar ou me diga como posso ajudar.");
    }

    return res.sendStatus(200);
  } catch (e) {
    log("error", "Webhook error:", e?.message || e);
    return res.sendStatus(200); // evita reenvio
  }
});

// Status (GET)
app.get("/status", (req, res) => {
  res.json({
    ok: true,
    phone_number_id: PHONE_NUMBER_ID || null,
    waba_id: WABA_ID || null,
    admins: [...ADMIN_SET],
    events: [...events.values()],
    env: NODE_ENV,
    uptime: uptimeStr(),
    time: new Date().toISOString(),
  });
});

// Subscribe (POST) - placeholder para automações futuras
app.post("/subscribe", (req, res) => {
  res.json({ ok: true, subscribed: true });
});

// Send text (POST) - { to, message }
app.post("/send-text", async (req, res) => {
  try {
    const { to, message } = req.body || {};
    if (!to || !message) return res.status(400).json({ ok: false, error: "Missing 'to' or 'message'" });
    const data = await sendText(to, message);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// Send template (POST) - { to, name, languageCode?, components? }
app.post("/send-template", async (req, res) => {
  try {
    const { to, name, languageCode, components } = req.body || {};
    if (!to || !name) return res.status(400).json({ ok: false, error: "Missing 'to' or 'name'" });
    const data = await sendTemplate(to, name, languageCode, components);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// Lista de rotas
app.get("/__routes", (req, res) => {
  res.json({
    routes: [
      "GET /health",
      "GET /webhook",
      "POST /webhook",
      "GET /status",
      "POST /subscribe",
      "POST /send-text",
      "POST /send-template",
      "GET /__routes",
      "GET /debug/env",
    ],
  });
});

// ============== START ==============
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log("  → Health:     GET /health");
  console.log("  → Webhook:    GET/POST /webhook");
  console.log("  → Status:     GET /status");
  console.log("  → Subscribe:  POST /subscribe");
  console.log("  → Send text:  POST /send-text");
  console.log("  → Template:   POST /send-template");
  console.log("  → Routes:     GET /__routes");
});
