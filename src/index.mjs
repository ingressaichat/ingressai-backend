import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { eventsRouter } from './events.mjs';
import { waRouter } from './wa.mjs';
import { ticketsRouter } from './tickets.mjs';
import { log } from './utils.mjs';

const app = express();

// Capturar raw body para validar assinatura (se APP_SECRET setado)
function rawBodySaver(req, res, buf) { req.rawBody = buf; }
app.use(express.json({ limit: '2mb', verify: rawBodySaver }));

// CORS
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed: ' + origin));
  }
}));

app.use(morgan('tiny'));

app.get('/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV, ts: Date.now() }));

app.use('/events', eventsRouter);
app.use('/wa', waRouter);   // /wa/webhook (padrão)
app.use('/', waRouter);     // alias → /webhook (compatível com a URL da Meta)
app.use('/', ticketsRouter);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => { log(`🚀 Server on http://localhost:${PORT}`); });
