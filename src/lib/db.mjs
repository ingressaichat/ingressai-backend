import crypto from "crypto";
import { log } from "./utils.mjs";

function id8() { return crypto.randomBytes(6).toString("base64url").slice(0,8); }

export const DB = {
  EVENTS: new Map(),
  PURCHASES: new Map()
};

// seed de exemplo
export function seedIfEmpty() {
  if (DB.EVENTS.size) return;
  const id = "NvQPG16s";
  const ev = {
    id,
    title: "Hello World — Uberaba",
    city: "Uberaba-MG",
    date: new Date(Date.now() + 48*3600*1000).toISOString(),
    venue: "Espaço Demo",
    statusLabel: "Último lote",
    imageUrl: ""
  };
  DB.EVENTS.set(id, ev);
  log("event.created", ev);
}

export function newOrder({ eventId, name, phone, qty=1 }) {
  const code = `ORD-${id8()}_${qty.toString().padStart(2,"0")}`;
  DB.PURCHASES.set(code, { code, eventId, name, phone, qty, createdAt: new Date().toISOString() });
  return DB.PURCHASES.get(code);
}

export function eventPublic(ev) {
  return {
    id: ev.id, title: ev.title, city: ev.city, date: ev.date,
    venue: ev.venue, statusLabel: ev.statusLabel, imageUrl: ev.imageUrl
  };
}
