import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { log } from './utils.mjs';

export const waRouter = Router();

/** ===== ENV & helpers ===== */
const WABA_TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || '';
const APP_SECRET = process.env.APP_SECRET || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PUBLIC_WHATSAPP = process.env.PUBLIC_WHATSAPP || '';
const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);

const APP_PROOF = (APP_SECRET && WABA_TOKEN)
  ? crypto.createHmac('sha256', APP_SECRET).update(WABA_TOKEN).digest('hex')
  : null;

function api(url, payload) {
  return axios.post(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/${url}`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      params: { access_token: WABA_TOKEN, ...(APP_PROOF ? { appsecret_proof: APP_PROOF } : {}) }
    }
  );
}

async function sendText(to, text) {
  await api('messages', { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });
}

async function sendButtons(to, bodyText, buttons) {
  await api('messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: buttons.map(({ id, title }) => ({ type: 'reply', reply: { id, title } })) }
    }
  });
}

async function sendList(to, headerText, bodyText, rows, buttonText = 'Abrir') {
  await api('messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      action: { button: buttonText, sections: [{ title: 'Opções', rows }] }
    }
  });
}

function pureEventName(title = '', city = '') {
  if (!title || !city) return title || '';
  const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\s*[—–-]\\s*${esc}\\s*$`, 'i');
  const cleaned = title.replace(pattern, '').trim();
  return cleaned || title;
}
function brEventMeta(city, iso) {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const h = d.getHours(), m = d.getMinutes();
    const hora = m === 0 ? `${h} horas` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} horas`;
    return `${city}, ${date} às ${hora}`;
  } catch { return `${city}`; }
}

/** Conversational state */
const state = new Map(); // from -> { step, eventId }

/** Menus */
async function sendMainMenu(to, isAdmin = false) {
  const rows = [
    { id: 'menu_ver_eventos', title: 'Ver eventos' },
    { id: 'menu_comprar_hello', title: 'Comprar ingressos (Hello World)' },
    { id: 'menu_organizador', title: 'Sou organizador' },
    { id: 'menu_suporte', title: 'Suporte' },
  ];
  if (isAdmin) rows.push({ id: 'menu_admin', title: 'Painel do organizador (atalhos)' });
  await sendList(to, 'IngressAI', 'Escolha uma opção:', rows);
}

async function sendEventsList(to) {
  const r = await axios.get(`${BASE_URL}/events`).catch(() => ({ data: {} }));
  let items = [];
  if (Array.isArray(r.data?.items)) items = r.data.items;
  else if (r.data?.events && typeof r.data.events === 'object') items = Object.values(r.data.events).flat();

  items = items
    .map(ev => ({
      id: String(ev.id),
      title: pureEventName(ev.title || ev.nome || 'Evento', ev.city || ev.cidade || ''),
      city: ev.city || ev.cidade || '',
      date: ev.date || ev.dataISO || new Date().toISOString()
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10);

  if (!items.length) { await sendText(to, 'Ainda não temos eventos publicados. Volte em breve ✨'); return; }

  const rows = items.map(ev => ({
    id: `buy_ev_${ev.id}`,
    title: ev.title,
    description: brEventMeta(ev.city, ev.date).slice(0, 72)
  }));

  await sendList(to, 'Eventos', 'Escolha um evento para comprar:', rows, 'Selecionar');
}

/** Fluxos */
async function startBuyFlow(to, eventId) {
  state.set(to, { step: 'awaiting_name', eventId });
  await sendText(to, 'Perfeito! Me diga seu *nome completo* para emitir o ingresso.');
}
async function confirmAndIssue(to, name, eventId) {
  try {
    const url = `${BASE_URL}/purchase/start?ev=${encodeURIComponent(eventId)}&to=${encodeURIComponent(to)}&name=${encodeURIComponent(name)}&qty=1`;
    await axios.get(url);
    await sendText(to, '🎟️ Ingresso sendo emitido… você receberá o *PDF* em instantes.');
  } catch (e) {
    await sendText(to, 'Não consegui emitir agora. Tente novamente em instantes ou fale com o suporte.');
  } finally {
    state.delete(to);
    await sendMainMenu(to, ADMIN_NUMBERS.includes(to));
  }
}

/** Deep Link Parser: "ingressai:start ev=... name=..." */
function parseCommandText(text = '') {
  const m = text.match(/^ingressai:(\w+)\s+(.*)$/i);
  if (!m) return null;
  const cmd = m[1];
  const kv = {};
  for (const part of m[2].split(/\s+/)) {
    const [k, ...rest] = part.split('=');
    if (k && rest.length) kv[k] = rest.join('=');
  }
  return { cmd, kv };
}

/** Webhook (POST) */
waRouter.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Status callbacks
    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses;
    if (Array.isArray(statuses)) { statuses.forEach(s => log('WA status', s)); return res.send('OK'); }

    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!Array.isArray(messages)) return res.send('OK');

    for (const msg of messages) {
      const from = msg.from;
      const isAdmin = ADMIN_NUMBERS.includes(from);

      if (msg.type === 'interactive') {
        const inter = msg.interactive || {};
        const id = inter?.button_reply?.id || inter?.list_reply?.id;
        if (id) { await handleActionId(from, id, isAdmin); continue; }
      }

      if (msg.type === 'text') {
        const text = (msg.text?.body || '').trim();

        const parsed = parseCommandText(text);
        if (parsed && parsed.cmd === 'start') {
          const ev = parsed.kv.ev || 'hello-world-uberaba';
          const name = (parsed.kv.name || '').trim();
          if (name) await confirmAndIssue(from, name, ev);
          else await startBuyFlow(from, ev);
          continue;
        }

        const st = state.get(from);
        if (st?.step === 'awaiting_name') {
          const name = text.replace(/\s+/g, ' ').trim().slice(0, 80);
          if (name.length < 2) await sendText(from, 'Digite um nome válido (2+ caracteres).');
          else await confirmAndIssue(from, name, st.eventId);
          continue;
        }

        await sendMainMenu(from, isAdmin);
        continue;
      }

      // fallback
      await sendMainMenu(from, isAdmin);
    }

    res.send('OK');
  } catch (e) {
    log('webhook error', e?.response?.data || e.message);
    res.send('OK');
  }
});

/** Resolve action IDs */
async function handleActionId(to, id, isAdmin) {
  if (id === 'menu_ver_eventos') { await sendEventsList(to); return; }
  if (id === 'menu_comprar_hello') { await startBuyFlow(to, 'hello-world-uberaba'); return; }
  if (id === 'menu_organizador') {
    await sendButtons(
      to,
      'Organizador: crie e gerencie eventos pelo WhatsApp. Quer começar?',
      [
        { id: 'org_criar', title: 'Criar evento' },
        { id: 'org_comandos', title: 'Ver comandos' },
      ]
    );
    return;
  }
  if (id === 'menu_suporte') {
    if (PUBLIC_WHATSAPP) await sendText(to, `Fale com o suporte: https://wa.me/${PUBLIC_WHATSAPP}`);
    else await sendText(to, 'Nosso suporte está offline no momento.');
    await sendMainMenu(to, isAdmin);
    return;
  }
  if (id === 'menu_admin') {
    await sendButtons(
      to,
      'Atalhos do organizador:',
      [
        { id: 'admin_ver_eventos', title: 'Listar eventos' },
        { id: 'admin_link_hello', title: 'Link de compra (Hello)' },
      ]
    );
    return;
  }

  // Org sub-actions
  if (id === 'org_criar') {
    await sendText(to, 'Mande: *criar evento* (nome, cidade, data). Em seguida eu abro o cadastro e já te devolvo o link de vendas.');
    await sendMainMenu(to, isAdmin);
    return;
  }
  if (id === 'org_comandos') {
    await sendText(to, [
      'Comandos rápidos:',
      '• criar evento',
      '• adicionar lote',
      '• fechar vendas',
      '• link do evento',
      '• lista de vendas',
      '• validador',
      '• enviar ingresso <telefone>',
    ].join('\n'));
    await sendMainMenu(to, isAdmin);
    return;
  }

  // Admin
  if (id === 'admin_ver_eventos') { await sendEventsList(to); return; }
  if (id === 'admin_link_hello') {
    await sendText(to, `Link direto: https://wa.me/${PUBLIC_WHATSAPP}?text=${encodeURIComponent('ingressai:start ev=hello-world-uberaba name=')}`);
    await startBuyFlow(to, 'hello-world-uberaba');
    return;
  }

  // buy_ev_*
  if (id.startsWith('buy_ev_')) {
    const evId = id.substring('buy_ev_'.length);
    await startBuyFlow(to, evId);
    return;
  }

  await sendMainMenu(to, isAdmin);
}

/** Utilidade de teste: envia menu para um número */
waRouter.get('/wa/send-menu', async (req, res) => {
  const to = String(req.query.to || '').trim();
  if (!/^\d{10,15}$/.test(to)) return res.status(400).json({ ok: false, error: 'to inválido' });
  await sendMainMenu(to, ADMIN_NUMBERS.includes(to));
  res.json({ ok: true });
});
