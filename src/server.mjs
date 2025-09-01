import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cors());
try {
  const { default: helmet } = await import('helmet');
  app.use(helmet());
} catch (e) {
  console.warn('[warn] Helmet não instalado — iniciando sem esse middleware');
}
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Demo in-memory
const now = Date.now();
let EVENTS = [
  {
    id: 'TST-INGRESSAI',
    title: 'Evento Teste IngressAI',
    city: 'Uberaba-MG',
    date: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
    venue: 'Espaço Demo',
    image: '',
    statusLabel: 'Último lote',
    description: 'Evento demonstrativo para testes do fluxo.'
  }
];
let ORDERS = [];

app.get('/', (_req, res) => res.json({ ok: true, name: 'ingressai-backend', version: '0.3.4' }));
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.get('/events', (_req, res) => res.json({ items: EVENTS, events: EVENTS }));

app.post('/orders', (req, res) => {
  const { eventId, qty = 1, buyer = {} } = req.body || {};
  if (!eventId) return res.status(400).json({ error: 'eventId é obrigatório' });
  const ev = EVENTS.find(e => String(e.id) === String(eventId));
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  const orderId = `ord_${Math.random().toString(36).slice(2, 10)}${Date.now()}`;
  const order = {
    orderId,
    eventId: ev.id,
    qty: Math.max(1, parseInt(qty, 10) || 1),
    buyer: { name: buyer.name || 'Visitante', phone: buyer.phone || '' },
    status: 'created',
    createdAt: new Date().toISOString()
  };
  ORDERS.push(order);
  res.json({ orderId });
});

app.post('/tickets/issue', (req, res) => {
  const { orderId } = req.body || {};
  const order = ORDERS.find(o => o.orderId === orderId);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  order.status = 'issued';
  order.ticketUrl = `https://ingressai.chat/ticket/${orderId}`;
  res.json({ ok: true, ticketUrl: order.ticketUrl });
});

app.post('/test/send-ticket', (req, res) => {
  const { phone = '', orderId } = req.body || {};
  const order = ORDERS.find(o => o.orderId === orderId);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  console.log(`[demo] Enviar link do ingresso para ${phone}: ${order.ticketUrl || '(gere primeiro com /tickets/issue)'}`);
  res.json({ ok: true, phone });
});

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`ingressai-backend v0.3.4 ouvindo em http://${HOST}:${PORT}`);
});
