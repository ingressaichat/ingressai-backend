// src/lib/db.mjs
// Banco em memória + helpers

// Começamos com 1 evento de teste
export const EVENTS = [
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

function sortByDateAsc(a, b) {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

export function pureEventName(ev) {
  return String(ev?.title || "").trim();
}

export function listEvents(page = 1, size = 10) {
  const p = Math.max(1, Number(page || 1));
  const s = Math.max(1, Number(size || 10));
  const sorted = [...EVENTS].sort(sortByDateAsc);

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

function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "evento";
}

export function addEvent({ id, title, city, venue, date, price, imageUrl }) {
  const baseId = id || `${slugify(title)}-${slugify(city || "")}`.replace(/(^-|-$)/g, "");
  let finalId = baseId || `ev-${Date.now()}`;
  let i = 1;
  while (EVENTS.some(e => e.id === finalId)) {
    i += 1;
    finalId = `${baseId}-${i}`;
  }

  const ev = {
    id: finalId,
    title: title || "Sem título",
    city: city || "Uberaba",
    venue: venue || "",
    date, // exige ISO ou ISO com -03:00
    price: price || "",
    imageUrl: imageUrl || ""
  };
  EVENTS.push(ev);
  return ev;
}
