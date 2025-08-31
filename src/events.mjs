import { Router } from 'express';

export const eventsRouter = Router();

export const EVENTS = [
  {
    id: "hello-world-uberaba",
    title: "Hello World — Uberaba",
    city: "Uberaba",
    venue: "Local Secreto",
    date: "2025-09-15T23:00:00-03:00",
    price: 30.0,
    currency: "BRL",
    cover_image: "https://picsum.photos/seed/ingressai-hello/1200/800"
  },
  {
    id: "hello-world-uberlandia",
    title: "Hello World — Uberlândia",
    city: "Uberlândia",
    venue: "Clube Central",
    date: "2025-09-20T22:00:00-03:00",
    price: 35.0,
    currency: "BRL",
    cover_image: "https://picsum.photos/seed/ingressai-hello-2/1200/800"
  }
];

export function findEvent(id) {
  return EVENTS.find(e => String(e.id) === String(id));
}

function buildWhatsAppDeeplink(ev, qty = 1, autopay = 1, name = "CONVIDADO") {
  const number = process.env.PUBLIC_WHATSAPP || '5534999992747';
  const txt = `ingressai:start ev=${ev} qty=${qty} autopay=${autopay} name=${name}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(txt)}`;
}

/** Vitrine — o front aceita items[] */
eventsRouter.get('/events', (_req, res) => {
  const items = EVENTS.map(e => ({
    ...e,
    wa_deeplink: buildWhatsAppDeeplink(e.id, 1, 1, 'CONVIDADO')
  }));
  res.json({ items });
});
