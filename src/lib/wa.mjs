import { cfg } from '../config.mjs';

const GRAPH = 'https://graph.facebook.com/v20.0';

async function send(payload) {
  if (!cfg.META_ACCESS_TOKEN || !cfg.PHONE_ID) {
    console.log('[WABA:simulado]', JSON.stringify(payload, null, 2));
    return { ok: true, simulated: true };
  }
  const r = await fetch(`${GRAPH}/${cfg.PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`WABA error ${r.status}: ${txt}`);
  }
  return r.json();
}

export async function sendText(to, text) {
  return send({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  });
}

export async function sendImage(to, link, caption='') {
  return send({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link, caption }
  });
}
