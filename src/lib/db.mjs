// src/lib/db.mjs
const EVENTS = [
  {
    id: "hello-world-uberaba",
    title: "Hello World",
    city: "Uberaba",
    venue: "Local a definir",
    date: "2025-09-20T23:00:00-03:00",
    price: "R$ 20",
    imageUrl: "https://ingressai.chat/hello-world.png"
  },
];

export function pureEventName(ev) { return String(ev?.title || "").trim(); }

export function listEvents(page = 1, size = 10) {
  const p = Math.max(1, Number(page || 1));
  const s = Math.max(1, Number(size || 10));
  const sorted = [...EVENTS].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / s));
  const start = (p - 1) * s;
  const items = sorted.slice(start, start + s);
  return { page: p, size: s, total, totalPages, items };
}

export function findEvent(id) {
  const key = String(id || "").trim();
  return EVENTS.find(e => e.id === key) || null;
}
