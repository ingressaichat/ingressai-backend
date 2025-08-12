import { Router } from 'express';
import { subscribeAppToWaba, listSubscribedApps } from '../services/whatsapp.js';

const router = Router();

// POST /mgmt/subscribe -> inscreve o App no WABA (para eventos chegarem no webhook)
router.post('/subscribe', async (_, res) => {
  try {
    const data = await subscribeAppToWaba();
    res.json(data);
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json(e?.response?.data || { error: e.message });
  }
});

// GET /mgmt/subscribed -> checar inscrições do App no WABA
router.get('/subscribed', async (_, res) => {
  try {
    const data = await listSubscribedApps();
    res.json(data);
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json(e?.response?.data || { error: e.message });
  }
});

export default router;
