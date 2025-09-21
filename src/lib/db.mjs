// src/lib/db.mjs
import crypto from "node:crypto";

/** ===== In-memory store (trocar por DB/Redis depois) ===== */
const events = new Map();
const tickets = new Map();
const codeIndex = new Map();
let lastTicketId = 0;

/** ===== Helpers ===== */
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
const nowISO = () => new Date().toISOString();
const clampInt = (v, min, max) => Math.max(min, Math.min(max, Number.parseInt(v,10)||min));
const shortId = (len=10) => crypto.randomBytes(len).toString("base64").replace(/[+/=]/g,"").slice(0,len).toUpperCase();
const toNumber = (x, def=0) => {
  if (x == null) return def;
  const n = Number(String(x).replace(/[^0-9,.\-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : def;
};
const toISO = (d) => {
  try {
    if (!d) return nowISO();
    if (d instanceof Date) return d.toISOString();
    if (typeof d === "number") return new Date(d).toISOString();
    const v = new Date(d);
    return Number.isFinite(+v) ? v.toISOString() : nowISO();
  } catch { return nowISO(); }
};

/** ===== Public utils ===== */
export const pureEventName = (evOrTitle) =>
  evOrTitle && typeof evOrTitle === "object"
    ? String(evOrTitle.title || evOrTitle.id || "Evento")
    : String(evOrTitle || "Evento");

/** ===== Events CRUD ===== */
export function createEvent(data={}) {
  const id = data.id ? String(data.id) : shortId(8);
  if (events.has(id) && !data.id) return createEvent({ ...data, id: shortId(8) });
  const ev = {
    id,
    title: String(data.title || "Evento"),
    city: String(data.city || ""),
    venue: String(data.venue || ""),
    date: toISO(data.date),
    price: toNumber(data.price, 0),
    media: data.media && typeof data.media === "object"
      ? { ...data.media }
      : data.image ? { url: String(data.image) } : {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  events.set(ev.id, ev);
  return ev;
}

export function updateEvent(id, patch={}) {
  const ev = events.get(String(id));
  if (!ev) return null;
  if (patch.title != null) ev.title = String(patch.title);
  if (patch.city  != null) ev.city = String(patch.city);
  if (patch.venue != null) ev.venue = String(patch.venue);
  if (patch.date  != null) ev.date = toISO(patch.date);
  if (patch.price != null) ev.price = toNumber(patch.price, ev.price);
  if (patch.media && typeof patch.media === "object") ev.media = { ...(ev.media||{}), ...patch.media };
  else if (patch.image != null) ev.media = { ...(ev.media||{}), url: String(patch.image) };
  ev.updatedAt = nowISO();
  events.set(ev.id, ev);
  return ev;
}

export const deleteEvent = (id) => events.delete(String(id));
export const findEvent = (id) => events.get(String(id)) || null;

export function listEvents(page=1, size=50) {
  const p = clampInt(page, 1, 10000);
  const s = clampInt(size, 1, 200);
  const all = Array.from(events.values()).sort((a,b) => (+new Date(a.date))- (+new Date(b.date)) || String(a.title).localeCompare(String(b.title)));
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total/s));
  const items = all.slice((p-1)*s, (p-1)*s + s);
  return { items, page: p, totalPages, total };
}

/** ===== Tickets ===== */
export function addTicket({ eventId, buyerName, buyerPhone } = {}) {
  const id = ++lastTicketId;
  const code = shortId(10);
  const t = {
    id, code,
    eventId: String(eventId || "no-event"),
    buyerName: String(buyerName || "Participante"),
    buyerPhone: String(buyerPhone || ""),
    createdAt: nowISO(),
  };
  tickets.set(id, t);
  codeIndex.set(code, id);
  return t;
}
export const getTicketById = (id) => tickets.get(Number(id)) || null;
export const getTicketByCode = (code) => {
  const id = codeIndex.get(String(code||"").trim());
  return id ? tickets.get(id) || null : null;
};

/** Modo 1: listTickets("<phone>") — do usuário */
export function listTicketsByPhone(phone) {
  const ph = onlyDigits(phone);
  return Array.from(tickets.values())
    .filter(t => onlyDigits(t.buyerPhone) === ph)
    .sort((a,b) => a.id - b.id);
}

/** ===== Seed demo ===== */
(function seed() {
  if (events.size) return;
  const t1 = new Date(Date.now() + 24*60*60*1000); t1.setHours(20,0,0,0);
  const t2 = new Date(Date.now() + 48*60*60*1000); t2.setHours(22,0,0,0);

  createEvent({ id: "demo-1", title: "Sunset no Terraço", city: "Uberaba-MG", venue: "Terraço 21", date: t1, price: 60, media: { url: "" } });
  createEvent({ id: "demo-2", title: "Baile do Ingresso", city: "Uberlândia-MG", venue: "Arena UFU", date: t2, price: 80, media: { url: "" } });
})();
