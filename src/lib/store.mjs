import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { id } from '../utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '../../data.json');

const db = {
  events: [],
  orders: [],
  tickets: []
};

export async function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const j = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      Object.assign(db, j);
    }
  } catch (e) {
    console.warn('[store] load fail', e);
  }
  // seed mínimo se vazio
  if (!db.events?.length) {
    db.events.push({
      id: 'HELLO-WORLD-UBERABA',
      title: 'Hello World — Uberaba',
      city: 'Uberaba',
      date: new Date(Date.now()+2*24*60*60*1000).toISOString(),
      venue: 'Espaço Central',
      imageUrl: '',
      statusLabel: 'Último lote',
      category: 'IngressAI',
      description: 'Evento de demonstração da IngressAI.'
    });
  }
  await save();
}

export async function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.warn('[store] save fail', e);
  }
}

/* Events */
export const listEvents = () => db.events;
export const getEvent = (eid) => db.events.find(e => String(e.id) === String(eid));
export function addEvent(data) {
  const ev = { id: data.id || id(), ...data };
  db.events.push(ev);
  save();
  return ev;
}

/* Orders */
export function createOrder({ eventId, qty=1, buyer={} }) {
  const ev = getEvent(eventId);
  if (!ev) throw new Error('event_not_found');
  const order = {
    id: id(),
    eventId,
    qty: Math.max(1, parseInt(qty, 10) || 1),
    buyer: { name: buyer.name || 'Visitante', phone: buyer.phone || '' },
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  save();
  return order;
}
export const getOrder = (oid) => db.orders.find(o => o.id === oid);

/* Tickets */
export function issueTicket(orderId) {
  const order = getOrder(orderId);
  if (!order) throw new Error('order_not_found');
  const t = {
    id: id(),
    orderId,
    eventId: order.eventId,
    used: false,
    createdAt: new Date().toISOString()
  };
  db.tickets.push(t);
  save();
  return t;
}
export const getTicket = (tid) => db.tickets.find(t => t.id === tid);
export function validateTicket(tid) {
  const t = getTicket(tid);
  if (!t) throw new Error('ticket_not_found');
  if (t.used) return { ok: false, reason: 'already_used', ticket: t };
  t.used = true; t.validatedAt = new Date().toISOString();
  save();
  return { ok: true, ticket: t };
}

export default db;
