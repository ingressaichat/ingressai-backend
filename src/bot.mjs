import { Router } from 'express';
import { checkAdmin } from '../config.mjs';
import { readStore } from '../utils.mjs';
import { sendText } from '../lib/waba.mjs';

const r = Router();

/** POST /bot/broadcast { text }  — envia para compradores de todos os eventos */
r.post('/bot/broadcast', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text obrigatório' });

  const orders = await readStore('orders');
  const phones = Array.from(new Set(orders.map(o => o?.buyer?.phone).filter(Boolean)));

  let sent = 0;
  for (const p of phones) {
    try { await sendText(p, text); sent++; } catch (e) { console.warn('broadcast fail', p, e.message); }
  }
  res.json({ ok: true, recipients: phones.length, sent });
});

export default r;
