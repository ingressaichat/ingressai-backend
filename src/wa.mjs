import axios from 'axios';
import { Router } from 'express';
import crypto from 'crypto';
import { log, isAdmin, parseStartCommand } from './utils.mjs';
import { listEvents, findEvent } from './events.mjs';

export const waRouter = Router();

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN;
const BRAND = process.env.BRAND_NAME || 'IngressAI';

function api() {
  return axios.create({
    baseURL: `${GRAPH_BASE}/${PHONE_NUMBER_ID}`,
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

function verifySignature(req) {
  const secret = process.env.APP_SECRET;
  if (!secret) return true; // se não tiver APP_SECRET, não valida
  try {
    const sig = req.get('X-Hub-Signature-256') || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', secret)
      .update(req.rawBody || Buffer.from(''))
      .digest('hex');
    return sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// GET /wa/webhook (verify)
waRouter.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// POST /wa/webhook (messages)
waRouter.post('/webhook', async (req, res) => {
  try {
    if (!verifySignature(req)) return res.sendStatus(403);

    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!entry) return res.sendStatus(200);

    if (entry.statuses?.length) { // delivered/read
      log('WA status', entry.statuses[0]);
      return res.sendStatus(200);
    }

    const msg = entry.messages?.[0];
    const contact = entry.contacts?.[0];
    if (!msg || !contact) return res.sendStatus(200);

    const from = msg.from; // '55349...'
    const name = contact.profile?.name || '';
    const text = msg.text?.body || msg.button?.text || msg.interactive?.list_reply?.id || '';

    // deep-link: ingressai:start ev=<id> qty=<n> autopay=1 name=<nome>
    if (text && text.startsWith('ingressai:start')) {
      const args = parseStartCommand(text);
      if (args.ev) {
        await sendConfirmPurchase(from, args.ev, args.qty || 1, args.name || name, args.autopay === '1');
      }
      return res.sendStatus(200);
    }

    const admin = isAdmin(from);
    await sendIndex(from, admin);
    return res.sendStatus(200);
  } catch (e) {
    log('❌ wa webhook error', e?.response?.data || e.message);
    return res.sendStatus(200);
  }
});

// ==== Saída ====
async function sendIndex(to, admin) {
  const events = listEvents();
  const sections = [
    {
      title: 'Eventos em destaque',
      rows: events.slice(0, 10).map(ev => ({
        id: `ev:${ev.id}`,
        title: ev.title,
        description: `${ev.city} · R$${ev.price}`
      }))
    },
    {
      title: 'Ações',
      rows: [
        { id: 'meus', title: 'Meus ingressos' },
        { id: 'suporte', title: 'Suporte' },
        { id: 'organizador', title: 'Sou organizador' },
        ...(admin ? [{ id: 'boss', title: 'Painel BOSS (admin)' }] : [])
      ]
    }
  ];

  return api().post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: `👋 ${BRAND} aqui. Escolha uma opção:` },
      action: { button: 'Abrir menu', sections }
    }
  });
}

async function sendConfirmPurchase(to, eventId, qty, buyerName, autopay = true) {
  const ev = findEvent(eventId);
  if (!ev) return sendText(to, 'Evento não encontrado. Mande "menu" pra ver a lista.');

  if (autopay) {
    const url = `${process.env.BASE_URL}/purchase/start?ev=${encodeURIComponent(eventId)}&to=${encodeURIComponent(to)}&name=${encodeURIComponent(buyerName)}&qty=${qty}&autopay=1`;
    await sendText(to, `Perfeito, ${buyerName}! Processando seu pedido…`);
    await axios.get(url).catch(() => {});
    return;
  }

  return api().post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `Confirmar compra de ${qty}x ${ev.title}?` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `pay:${eventId}:${qty}`, title: 'Pagar agora' } },
          { type: 'reply', reply: { id: 'cancel', title: 'Cancelar' } }
        ]
      }
    }
  });
}

export function sendText(to, text) {
  return api().post('/messages', { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });
}
