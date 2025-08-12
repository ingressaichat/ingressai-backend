// src/index.cjs
require('dotenv/config');
const express = require('express');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

/** ====== ENV ====== */
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ingressai123';
const APP_SECRET = process.env.APP_SECRET;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_ID = process.env.WABA_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
const AUTO_REPLY = (process.env.AUTO_REPLY || 'true').toLowerCase() === 'true';

if (!ACCESS_TOKEN || !APP_SECRET || !PHONE_NUMBER_ID || !WABA_ID) {
  console.error('❌ Faltam variáveis no .env (WHATSAPP_ACCESS_TOKEN/WHATSAPP_TOKEN, APP_SECRET, PHONE_NUMBER_ID, WABA_ID).');
  process.exit(1);
}

/** ====== Middlewares ====== */
// precisamos do corpo bruto para validar assinatura
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(morgan('dev'));

/** ====== Utils ====== */
const appsecretProof = () =>
  crypto.createHmac('sha256', APP_SECRET).update(ACCESS_TOKEN).digest('hex');

function verifySignature(req) {
  try {
    const header = req.get('x-hub-signature-256') || '';
    if (!header.startsWith('sha256=')) return false;
    const theirs = Buffer.from(header.slice(7), 'hex');
    const ours = crypto.createHmac('sha256', APP_SECRET)
      .update(req.rawBody || Buffer.from(''))
      .digest();
    return theirs.length === ours.length && crypto.timingSafeEqual(theirs, ours);
  } catch {
    return false;
  }
}

const graph = axios.create({
  baseURL: 'https://graph.facebook.com/v20.0',
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  timeout: 20000
});

const gPost = (path, data) =>
  graph.post(`${path}?appsecret_proof=${appsecretProof()}`, data);

const gGet = (path, params = {}) => {
  const qs = new URLSearchParams({ ...params, appsecret_proof: appsecretProof() }).toString();
  return graph.get(`${path}?${qs}`);
};

const xErr = (e) =>
  e?.response ? { status: e.response.status, data: e.response.data } : { message: e?.message || String(e) };

/** ====== Estado em memória / catálogo ====== */
const sessions = new Map(); // wa_id -> { step, cart, updatedAt }
const EVENTS = [
  { id: 'evt_rock', title: 'Rock Fest', price: 120.00 },
  { id: 'evt_pop',  title: 'Pop Night', price: 90.00 },
  { id: 'evt_jazz', title: 'Jazz Sunset', price: 75.00 }
];

function getSession(waId) {
  if (!sessions.has(waId)) sessions.set(waId, { step: 'idle', cart: {}, updatedAt: new Date() });
  return sessions.get(waId);
}
function setStep(waId, step, patch = {}) {
  const s = getSession(waId);
  sessions.set(waId, { ...s, ...patch, step, updatedAt: new Date() });
}
function reset(waId) {
  sessions.set(waId, { step: 'idle', cart: {}, updatedAt: new Date() });
}

/** ====== Envio ====== */
function sendText(to, body) {
  return gPost(`/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body }
  });
}
function sendButtons(to, text, buttons) {
  return gPost(`/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
    }
  });
}
function sendList(to, header, body, sections) {
  return gPost(`/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header },
      body: { text: body },
      action: { button: 'Selecionar', sections }
    }
  });
}
function sendTemplate(to, name, language = 'en_US', components) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name, language: { code: language } }
  };
  if (components) payload.template.components = components;
  return gPost(`/${PHONE_NUMBER_ID}/messages`, payload);
}

async function sendMenu(to) {
  return sendButtons(to, 'Como posso te ajudar? 👇', [
    { id: 'buy', title: '🎟️ Comprar ingresso' },
    { id: 'support', title: '🛟 Suporte' },
    { id: 'agent', title: '👤 Atendente' }
  ]);
}

/** ====== Fluxo de compra ====== */
async function flowStartBuy(to, waId) {
  setStep(waId, 'pick_event', { cart: {} });
  return sendList(to, 'Ingressos', 'Escolha o evento:', [{
    title: 'Eventos disponíveis',
    rows: EVENTS.map(e => ({ id: `event_${e.id}`, title: e.title, description: `R$ ${e.price.toFixed(2)}` }))
  }]);
}
async function flowPickQty(to, waId, eventSelId) {
  const event = EVENTS.find(e => `event_${e.id}` === eventSelId);
  if (!event) return sendText(to, 'Evento inválido. Envie *menu* para voltar.');
  setStep(waId, 'pick_qty', { cart: { event } });
  return sendButtons(to, `Qtd para *${event.title}* (R$ ${event.price.toFixed(2)} cada):`, [
    { id: 'qty_1', title: '1' }, { id: 'qty_2', title: '2' }, { id: 'qty_3', title: '3' },
    { id: 'qty_4', title: '4' }, { id: 'qty_5', title: '5' }
  ]);
}
async function flowAskEmail(to, waId, qtyId) {
  const qty = Number((qtyId || '').split('_')[1]);
  if (!qty || qty < 1 || qty > 5) return sendText(to, 'Quantidade inválida. Escolha de 1 a 5.');
  const s = getSession(waId);
  const cart = { ...s.cart, qty, total: qty * s.cart.event.price };
  setStep(waId, 'ask_email', { cart });
  return sendText(to, 'Informe seu e-mail para envio do ingresso (ex.: nome@dominio.com):');
}
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

async function flowConfirm(to, waId, email) {
  if (!isEmail(email)) return sendText(to, 'E-mail inválido. Tente novamente (ex.: nome@dominio.com).');
  const s = getSession(waId);
  const cart = { ...s.cart, email: email.trim() };
  setStep(waId, 'confirm', { cart });
  const summary =
    `Confira seu pedido:\n\n` +
    `• Evento: *${cart.event.title}*\n` +
    `• Qtd: *${cart.qty}*\n` +
    `• Total: *R$ ${cart.total.toFixed(2)}*\n` +
    `• E-mail: *${cart.email}*\n\n` +
    `Confirmar compra?`;
  return sendButtons(to, summary, [
    { id: 'confirm_yes', title: '✅ Confirmar' },
    { id: 'confirm_no', title: '✖️ Cancelar' }
  ]);
}
async function flowFinish(to, waId, confirmId) {
  if (confirmId === 'confirm_no') {
    reset(waId);
    return sendText(to, 'Pedido cancelado. Envie *menu* para recomeçar.');
  }
  const s = getSession(waId);
  const orderId = Math.random().toString(36).slice(2, 10).toUpperCase();
  const payLink = `https://pay.ingressai.exemplo/checkout?order=${orderId}`;
  setStep(waId, 'paid_wait');
  await sendText(to, `Pedido *${orderId}* criado ✅\nTotal: R$ ${s.cart.total.toFixed(2)}\nPague no link abaixo:`);
  return sendButtons(to, payLink, [{ id: 'open_pay', title: '💳 Abrir pagamento' }]);
}

/** ====== Webhook ====== */
// Verificação (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// Recebimento (POST)
app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  res.sendStatus(200);

  console.log('📩 Webhook:', JSON.stringify(req.body, null, 2));

  try {
    if (req.body?.object !== 'whatsapp_business_account') return;
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages || [];
    const statuses = value?.statuses || [];

    // Status (delivered/read)
    for (const st of statuses) {
      console.log(`📦 Msg ${st.id} → ${st.status} @ ${st.timestamp} (to ${st.recipient_id})`);
    }

    for (const msg of messages) {
      const from = msg.from;
      const waId = from;
      const type = msg.type;

      // extrai conteúdo/ação
      let text = '';
      let actionId = '';
      if (type === 'text') text = (msg.text?.body || '').trim();
      if (type === 'interactive') {
        actionId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || '';
        text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
      }
      if (type === 'button') {
        actionId = msg.button?.payload || msg.button?.text || '';
        text = msg.button?.text || '';
      }

      console.log(`💬 De ${from}: ${text || `[${type}]`}`);

      const low = (text || '').toLowerCase();
      const s = getSession(waId);

      // atalhos de entrada / menu
      if (['oi', 'olá', 'ola', 'menu', 'inicio', 'início'].includes(low)) {
        await sendMenu(from).catch(handleSendError(from));
        setStep(waId, 'idle');
        continue;
      }
      if (['comprar', 'buy', '1', '🎟️ comprar ingresso'].includes(low) || actionId === 'buy') {
        await flowStartBuy(from, waId).catch(handleSendError(from));
        continue;
      }
      if (actionId.startsWith('event_')) {
        await flowPickQty(from, waId, actionId).catch(handleSendError(from));
        continue;
      }
      if (actionId.startsWith('qty_')) {
        await flowAskEmail(from, waId, actionId).catch(handleSendError(from));
        continue;
      }
      if (s.step === 'ask_email' && type === 'text') {
        await flowConfirm(from, waId, text).catch(handleSendError(from));
        continue;
      }
      if (['confirm_yes', 'confirm_no'].includes(actionId)) {
        await flowFinish(from, waId, actionId).catch(handleSendError(from));
        continue;
      }

      // suporte / atendente
      if (actionId === 'support' || low === '2') {
        setStep(waId, 'support');
        await sendText(from, '🛟 Descreva seu problema que eu já verifico.').catch(handleSendError(from));
        continue;
      }
      if (actionId === 'agent' || low === '3') {
        setStep(waId, 'agent');
        await sendText(from, '👤 Te colocando na fila de atendimento humano. Aguarde um instante, por favor.').catch(handleSendError(from));
        continue;
      }

      // fallback
      if (AUTO_REPLY) {
        await sendText(from, 'Não entendi 🤔. Envie *menu* para opções ou *comprar* para iniciar a compra.').catch(handleSendError(from));
      }
    }
  } catch (e) {
    console.error('❌ Erro no processamento do webhook:', e);
  }
});

// tratamento quando janela 24h está fechada (tenta hello_world)
const handleSendError = (to) => (e) => {
  const err = xErr(e);
  console.error('❌ Erro ao enviar:', err);
  const code = err?.data?.error?.code;
  if (code === 131047 || code === 470) {
    sendTemplate(to, 'hello_world', 'en_US').catch(() => {});
  }
};

/** ====== Rotas utilitárias ====== */
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.get('/status', async (_req, res) => {
  try {
    const info = await gGet(`/${PHONE_NUMBER_ID}`, { fields: 'display_phone_number,verified_name' });
    let wabaSubs = null;
    try { wabaSubs = (await gGet(`/${WABA_ID}/subscribed_apps`)).data; } catch { wabaSubs = null; }
    res.json({ phone_number_id: PHONE_NUMBER_ID, waba_id: WABA_ID, phone_info: info.data, waba_subscriptions: wabaSubs });
  } catch (e) { res.status(500).json({ error: xErr(e) }); }
});

app.post('/subscribe', async (_req, res) => {
  try { res.json((await gPost(`/${WABA_ID}/subscribed_apps`, {})).data); }
  catch (e) { res.status(500).json({ error: xErr(e) }); }
});

app.get('/__routes', (_req, res) => {
  const routes = [];
  (app._router?.stack || []).forEach(m => {
    if (m.route?.path) routes.push({ method: Object.keys(m.route.methods)[0].toUpperCase(), path: m.route.path });
  });
  res.json(routes);
});

app.post('/send-text', async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: 'Campos obrigatórios: to, text' });
    const r = await sendText(to, text);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: xErr(e) }); }
});

app.post('/send-template', async (req, res) => {
  try {
    const { to, template, language = 'en_US', components } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: 'Campos obrigatórios: to, template' });
    const r = await sendTemplate(to, template, language, components);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: xErr(e) }); }
});

/** ====== Start ====== */
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log('  → Health:     GET /health');
  console.log('  → Webhook:    GET/POST /webhook');
  console.log('  → Status:     GET /status');
  console.log('  → Subscribe:  POST /subscribe');
  console.log('  → Send text:  POST /send-text');
  console.log('  → Template:   POST /send-template');
  console.log('  → Routes:     GET /__routes');
});
