import { Router } from 'express';
const router = Router();

// GET /webhook -> verificação (retorna hub.challenge se VERIFY_TOKEN bater)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST /webhook -> eventos (responda 200 rápido)
router.post('/', (req, res) => {
  console.log('[webhook] update:', JSON.stringify(req.body, null, 2));
  // aqui você pode tratar mensagens, statuses, etc.
  return res.sendStatus(200);
});

export default router;
