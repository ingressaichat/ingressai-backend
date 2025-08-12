import { Router } from 'express';
import { sendMessage } from '../services/whatsapp.js';

const router = Router();

// Primeiro envio (template hello_world) — inicia a conversa
router.post('/template', async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) return res.status(400).json({ error: 'Informe "to" no corpo (E.164), ex: 5534XXXXXXXX' });

    const resp = await sendMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } }
    });

    res.json(resp);
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json(e?.response?.data || { error: e.message });
  }
});

// Texto (janela 24h aberta após o usuário responder)
router.post('/text', async (req, res) => {
  try {
    const to = req.body?.to;
    const body = req.body?.body || 'Teste IngressAI — API ok ✅';
    if (!to) return res.status(400).json({ error: 'Informe "to" no corpo (E.164)' });

    const resp = await sendMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body }
    });

    res.json(resp);
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json(e?.response?.data || { error: e.message });
  }
});

export default router;
