// src/index.js (ESM) — IngressAI backend monolítico com diagnósticos e appsecret_proof
import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

// ================= ENV =================
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ingressai123';

// Fallback: aceita WHATSAPP_ACCESS_TOKEN ou WHATSAPP_API_TOKEN
const WHATSAPP_ACCESS_TOKEN =
  process.env.WHATSAPP_ACCESS_TOKEN ||
  process.env.WHATSAPP_API_TOKEN ||
  '';

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const WABA_ID = process.env.WABA_ID || '';
const APP_SECRET = process.env.APP_SECRET || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

// ================= LOG =================
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[LOG_LEVEL] ?? 2;
function log(level, ...args) {
  if ((levels[level] ?? 2) <= currentLevel) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}
function logAxiosError(prefix, err) {
  const status = err.response?.status;
  const data = err.response?.data;
  const path = err.response?.request?.path;
  const method = err.config?.method?.toUpperCase?.();
  const url = err.config?.url;
  const g = data?.error || {};
  log('error', `${prefix}:`, {
    status,
    method,
    url,
    path,
    graph_error: {
      message: g.message,
      type: g.type,
      code: g.code,
      error_subcode: g.error_subcode,
      fbtrace_id: g.fbtrace_id,
      error_user_title: g.error_user_title,
      error_user_msg: g.error_user_msg,
    },
  });
}

// ============== ADMIN UTILS ==============
function normalizeMsisdn(input) {
  if (!input) return '';
  return String(input).replace(/\D+/g, ''); // só dígitos
}
const ADMIN_SET = new Set(
  (process.env.ADMIN_PHONES || '')
    .split(',')
    .map((s) => normalizeMsisdn(s.trim()))
    .filter(Boolean),
);
function isAdmin(msisdnFromWebhook) {
  const from = normalizeMsisdn(msisdnFromWebhook);
  const ok = ADMIN_SET.has(from);
  if (ok) log('info', '[ADMIN CHECK] from:', from, '=> ADMIN ✅');
  else log('debug', '[ADMIN CHECK] from:', from, '| admins:', [...ADMIN_SET]);
  return ok;
}

// ============== STATE (memória em RAM) ==============
const startedAt = Date.now();
const stats = {
  received: 0,
  sent: 0,
  users: new Set(),
  lastMessages: [], // [{from,text,ts}]
};
const events = new Map(); // id -> {id,title,date,time,place,createdBy,createdAt}
let eventSeq = 1;
const flowSubmissions = []; // [{name, cpf, city, event, phone, ts}]
let lastGraphError = null;

function pushLastMessage(from, text) {
  stats.lastMessages.unshift({ from, text, ts: new Date().toISOString() });
  if (stats.lastMessages.length > 20) stats.lastMessages.pop();
}
function parsePipeArgs(s, expectedParts) {
  const parts = (s || '').split('|').map((p) => p.trim()).filter(Boolean);
  if (expectedParts && parts.length < expectedParts) return null;
  return parts;
}
function shortId(n) {
  const s = String(n).padStart(4, '0');
  return s.slice(-4);
}
function uptimeStr() {
  const ms = Date.now() - startedAt;
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / (1000 * 60)) % 60;
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}

// ============== APP (raw body p/ assinatura) ==============
const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ============== WEBHOOK SIGNATURE (Meta → seu servidor) ==============
function verifySignature(req) {
  try {
    const signature = req.get('x-hub-signature-256') || '';
    if (!APP_SECRET || !signature.startsWith('sha256=')) return true; // sem secret → pula validação
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', APP_SECRET).update(req.rawBody || '').digest('hex');

    if (signature.length !== expected.length) {
      log('warn', 'Webhook signature length mismatch');
      return false;
    }
    const ok = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) log('warn', 'Webhook signature mismatch');
    return ok;
  } catch (e) {
    log('warn', 'verifySignature error:', e.message);
    return false;
  }
}

// ============== APPSECRET_PROOF (seu servidor → Graph) ==============
function getAppSecretProof(token) {
  if (!APP_SECRET || !token) return '';
  return crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex');
}
function withGraphSecurity(config = {}) {
  const appsecret_proof = getAppSecretProof(WHATSAPP_ACCESS_TOKEN);
  const base = config || {};
  const params = new URLSearchParams(base.params || {});
  if (appsecret_proof) params.set('appsecret_proof', appsecret_proof);
  return {
    ...base,
    params,
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(base.headers || {}),
    },
    timeout: base.timeout ?? 15000,
  };
}

// ============== WHATSAPP SENDERS ==============
async function sendText(to, message) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  try {
    const { data, status } = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: normalizeMsisdn(to),
        type: 'text',
        text: { body: message },
      },
      withGraphSecurity(),
    );
    stats.sent += 1;
    log('info', 'Message sent:', status, data?.messages?.[0]?.id || '');
    return data;
  } catch (err) {
    lastGraphError = err.response?.data || err.message;
    logAxiosError('sendText error', err);
    throw err;
  }
}
async function sendTemplate(to, name, languageCode = 'pt_BR', components) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizeMsisdn(to),
    type: 'template',
    template: {
      name,
      language: { code: languageCode },
    },
  };
  if (components) payload.template.components = components;
  try {
    const { data, status } = await axios.post(url, payload, withGraphSecurity());
    stats.sent += 1;
    log('info', 'Template sent:', status, data?.messages?.[0]?.id || '');
    return data;
  } catch (err) {
    lastGraphError = err.response?.data || err.message;
    logAxiosError('sendTemplate error', err);
    throw err;
  }
}

// ================= ROUTES UTILS =================
app.get('/health', (req, res) => {
  res.json({ ok: true, env: NODE_ENV, uptime: uptimeStr() });
});
app.get('/debug/env', (req, res) => {
  const mask = (v) => (v ? String(v).slice(0, 4) + '...' + String(v).slice(-4) : '');
  res.json({
    NODE_ENV,
    LOG_LEVEL,
    PORT,
    PHONE_NUMBER_ID: mask(PHONE_NUMBER_ID),
    WABA_ID: mask(WABA_ID),
    VERIFY_TOKEN: !!VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN_PRESENT: !!WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_ACCESS_TOKEN_SOURCE: process.env.WHATSAPP_ACCESS_TOKEN
      ? 'WHATSAPP_ACCESS_TOKEN'
      : process.env.WHATSAPP_API_TOKEN
      ? 'WHATSAPP_API_TOKEN'
      : 'MISSING',
    APP_SECRET: !!APP_SECRET,
    ADMIN_PHONES: [...ADMIN_SET],
  });
});
app.get('/__routes', (req, res) => {
  res.json({
    routes: [
      'GET /health',
      'GET /webhook',
      'POST /webhook',
      'POST /api/receber-dados-flow',
      'GET /status',
      'POST /send-text',
      'POST /send-template',
      'POST /__selftest_send',
      'POST /__selftest_template',
      'GET /__routes',
      'GET /debug/env',
      'GET /debug/last-error',
    ],
  });
});
app.get('/debug/last-error', (req, res) => {
  res.json({ lastGraphError });
});

// ============== WEBHOOK VERIFY (GET) ==============
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    log('info', 'Webhook verified');
    return res.status(200).send(challenge);
  }
  log('warn', 'Webhook verify failed');
  return res.sendStatus(403);
});

// ============== WEBHOOK RECEIVE (POST) ==============
app.post('/webhook', async (req, res) => {
  try {
    if (!verifySignature(req)) return res.sendStatus(403);

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages || !messages[0]) {
      if (value?.statuses?.[0]) {
        const st = value.statuses[0];
        log('info', 'Status:', {
          id: st.id,
          status: st.status,
          recipient_id: st.recipient_id,
        });
      } else {
        log('debug', 'Webhook non-message payload received');
      }
      return res.sendStatus(200);
    }

    const msg = messages[0];
    const from = msg.from; // dígitos E.164 sem '+'
    const type = msg.type;
    stats.received += 1;
    stats.users.add(from);

    // Extrai texto genérico
    let userText = '';
    if (type === 'text') userText = msg.text?.body?.trim() || '';
    if (type === 'button') userText = msg.button?.text || msg.button?.payload || '';
    if (type === 'interactive') {
      const ict = msg.interactive?.type;
      if (ict === 'button_reply') userText = msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id || '';
      if (ict === 'list_reply') userText = msg.interactive?.list_reply?.title || msg.interactive?.list_reply?.id || '';
    }
    pushLastMessage(from, userText);
    log('info', 'Webhook received:', { from, type, text: userText });

    const admin = isAdmin(from);

    // ---- Regras simples ----
    if (/^ping$/i.test(userText)) {
      await sendText(from, admin ? 'pong 👑' : 'pong');
      return res.sendStatus(200);
    }

    // ========== COMANDOS DE BOSS ==========
    if (admin && /^\/?help$/i.test(userText)) {
      await sendText(
        from,
        [
          '👑 Comandos do Boss:',
          '• ping → teste rápido',
          '• /status → status do serviço',
          '• /stats → métricas desde o último restart',
          '• /criarevento titulo | data | hora | local',
          '• /broadcast fone1,fone2,... | Mensagem',
        ].join('\n'),
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?status$/i.test(userText)) {
      await sendText(
        from,
        [
          '📊 Status do serviço:',
          `• NODE_ENV: ${NODE_ENV}`,
          `• LOG_LEVEL: ${LOG_LEVEL}`,
          `• PHONE_NUMBER_ID: ${PHONE_NUMBER_ID}`,
          `• WABA_ID: ${WABA_ID}`,
          `• Uptime: ${uptimeStr()}`,
        ].join('\n'),
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?stats$/i.test(userText)) {
      const last = stats.lastMessages.slice(0, 5).map((m) => `- ${m.from}: "${m.text}" @ ${m.ts}`).join('\n') || '- (vazio)';
      await sendText(
        from,
        [
          '📈 Stats (desde o restart):',
          `• Recebidas: ${stats.received}`,
          `• Enviadas: ${stats.sent}`,
          `• Usuários únicos: ${stats.users.size}`,
          `• Eventos criados: ${events.size}`,
          `• Submissões Flow: ${flowSubmissions.length}`,
          `• Uptime: ${uptimeStr()}`,
          '• Últimas 5 msgs:',
          last,
        ].join('\n'),
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?criarevento\s+/i.test(userText)) {
      const raw = userText.replace(/^\/?criarevento\s+/i, '');
      const parts = parsePipeArgs(raw, 4);
      if (!parts) {
        await sendText(from, 'Uso: /criarevento titulo | data | hora | local');
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
          '✅ Evento criado!',
          `• ID: ${id}`,
          `• Título: ${title}`,
          `• Data: ${date} às ${time}`,
          `• Local: ${place}`,
        ].join('\n'),
      );
      return res.sendStatus(200);
    }

    if (admin && /^\/?broadcast\s+/i.test(userText)) {
      const raw = userText.replace(/^\/?broadcast\s+/i, '');
      const [phonesStr, ...msgParts] = raw.split('|');
      const message = (msgParts.join('|') || '').trim();
      const phones = (phonesStr || '')
        .split(',')
        .map((s) => normalizeMsisdn(s))
        .filter(Boolean);

      if (!phones.length || !message) {
        await sendText(from, 'Uso: /broadcast phone1,phone2,... | Mensagem');
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
      await sendText(from, 'Fala, Boss! 👑 Use /help para ver os comandos.');
      return res.sendStatus(200);
    }

    // Fluxo padrão p/ não-admin
    if (userText) {
      await sendText(from, "Olá! Eu sou o IngressAI. Digite 'ping' para testar ou me diga como posso ajudar.");
    }

    return res.sendStatus(200);
  } catch (e) {
    lastGraphError = e?.response?.data || e?.message || String(e);
    log('error', 'Webhook error:', e?.message || e);
    return res.sendStatus(200); // evita reenvio
  }
});

// ============== FLOW DATA (POST /api/receber-dados-flow) ==============
app.post('/api/receber-dados-flow', async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      name: body.name || body.nome || body?.data?.name || body?.data?.nome || '',
      cpf: body.cpf || body?.data?.cpf || '',
      city: body.city || body.cidade || body?.data?.city || body?.data?.cidade || '',
      event: body.event || body.evento || body?.data?.event || body?.data?.evento || '',
      phone: normalizeMsisdn(body.phone || body.telefone || body?.data?.phone || ''),
    };

    flowSubmissions.unshift({ ...payload, ts: new Date().toISOString() });
    if (flowSubmissions.length > 1000) flowSubmissions.pop();

    log('info', '[FLOW] Dados recebidos:', payload);

    if (payload.phone) {
      const lines = [
        `✅ Recebido!`,
        `Nome: ${payload.name || '-'}`,
        `CPF: ${payload.cpf || '-'}`,
        `Cidade: ${payload.city || '-'}`,
        `Evento: ${payload.event || '-'}`,
      ];
      try {
        await sendText(payload.phone, lines.join('\n'));
      } catch (e) {
        lastGraphError = e?.response?.data || e?.message;
        log('warn', 'Falha ao enviar confirmação do Flow:', e?.response?.data || e.message);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    lastGraphError = e?.response?.data || e?.message;
    log('error', '/api/receber-dados-flow error:', e?.message || e);
    return res.status(200).json({ ok: false });
  }
});

// ============== STATUS & SEND ENDPOINTS ==============
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    phone_number_id: PHONE_NUMBER_ID || null,
    waba_id: WABA_ID || null,
    admins: [...ADMIN_SET],
    events: [...events.values()],
    flowSubmissionsCount: flowSubmissions.length,
    env: NODE_ENV,
    uptime: uptimeStr(),
    time: new Date().toISOString(),
  });
});

// Teste rápido de envio de texto e captura de erro do Graph
app.post('/__selftest_send', async (req, res) => {
  try {
    const { to, message = 'Teste IngressAI ✅' } = req.body || {};
    if (!to) return res.status(400).json({ ok: false, error: "Missing 'to'" });
    const data = await sendText(to, message);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// Teste de template (fora da janela de 24h)
app.post('/__selftest_template', async (req, res) => {
  try {
    let { to, name, languageCode = 'pt_BR', components, variables } = req.body || {};
    if (!to) return res.status(400).json({ ok: false, error: "Missing 'to'" });
    if (!name) return res.status(400).json({ ok: false, error: "Missing 'name' (template name aprovado)" });

    // Se vier "variables" simples (array de strings), converte para BODY parameters
    if (!components && Array.isArray(variables)) {
      const params = variables.map((v) => ({ type: 'text', text: String(v) }));
      components = [{ type: 'body', parameters: params }];
    }

    const data = await sendTemplate(to, name, languageCode, components);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e?.response?.data || e.message,
      hint:
        "Verifique se o template está APROVADO e o nome bate 100%. Se tiver placeholders, envie 'variables' como array de strings em ordem, ou 'components' completos.",
      example_body_components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'João' },
            { type: 'text', text: 'Evento XPTO' },
          ],
        },
      ],
    });
  }
});

app.post('/send-text', async (req, res) => {
  try {
    const { to, message } = req.body || {};
    if (!to || !message) return res.status(400).json({ ok: false, error: "Missing 'to' or 'message'" });
    const data = await sendText(to, message);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});
app.post('/send-template', async (req, res) => {
  try {
    const { to, name, languageCode, components } = req.body || {};
    if (!to || !name) return res.status(400).json({ ok: false, error: "Missing 'to' or 'name'" });
    const data = await sendTemplate(to, name, languageCode, components);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// ============== START ==============
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log('  → Health:     GET /health');
  console.log('  → Webhook:    GET/POST /webhook');
  console.log('  → Flow:       POST /api/receber-dados-flow');
  console.log('  → Status:     GET /status');
  console.log('  → Send text:  POST /send-text');
  console.log('  → Template:   POST /send-template');
  console.log('  → Selftest:   POST /__selftest_send');
  console.log('  → Selftest T: POST /__selftest_template');
  console.log('  → Routes:     GET /__routes');
  console.log('  → Debug ENV:  GET /debug/env');
  console.log('  → Last Error: GET /debug/last-error');
});

// Avisos de ENV no boot
(function checkEnv() {
  if (!WHATSAPP_ACCESS_TOKEN) log('warn', '[ENV] WHATSAPP_ACCESS_TOKEN/WHATSAPP_API_TOKEN ausente!');
  if (!PHONE_NUMBER_ID) log('warn', '[ENV] PHONE_NUMBER_ID ausente!');
  if (!APP_SECRET) log('warn', '[ENV] APP_SECRET ausente (assinatura de webhook será ignorada)!');
})();
