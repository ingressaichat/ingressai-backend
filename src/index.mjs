import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { eventsRouter } from './events.mjs';
import { ticketsRouter } from './tickets.mjs';
import { waRouter } from './wa.mjs';
import { log } from './utils.mjs';

const app = express();

/** Captura raw body (útil para verificar assinatura X-Hub-Signature se quiser) */
app.use((req, _res, next) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => { try { req.rawBody = Buffer.concat(chunks); } catch { req.rawBody = null; } next(); });
});

app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/** Healthcheck */
app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'dev' }));

/** Verificação de webhook (GET hub.challenge) */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === (process.env.VERIFY_TOKEN || 'ingressai123')) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('forbidden');
});

/** Routers */
app.use(eventsRouter);
app.use(ticketsRouter);
app.use(waRouter); // contém POST /webhook e utilidades

/** Default */
app.get('/', (_req, res) => res.json({ ok: true, name: 'IngressAI Backend' }));

/** Start */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  log('start', `🚀 Server on http://localhost:${PORT}`);
});
