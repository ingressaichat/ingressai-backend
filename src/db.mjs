// src/db.mjs
export const DB = {
  EVENTS: new Map(),
  PURCHASES: new Map(),
};

export function addEvent(ev) {
  if (!ev?.id) throw new Error("addEvent: ev.id obrigatório");
  DB.EVENTS.set(String(ev.id), ev);
  return ev;
}

export function listEvents() {
  return Array.from(DB.EVENTS.values());
}

export function findEvent(id) {
  return DB.EVENTS.get(String(id));
}

export function updateEvent(id, patch) {
  const ev = DB.EVENTS.get(String(id));
  if (!ev) return false;
  Object.assign(ev, patch || {});
  DB.EVENTS.set(String(id), ev);
  return true;
}

export function deleteEvent(id) {
  return DB.EVENTS.delete(String(id));
}

// Remove o sufixo depois de " — "
export function pureEventName(evOrTitle) {
  const t = (typeof evOrTitle === "string") ? evOrTitle : (evOrTitle?.title || "");
  return t.replace(/\s+—\s+.*$/, "");
}

// Semente opcional (pra ambiente vazio)
export function seedIfEmpty() {
  if (DB.EVENTS.size) return;
  const id = Math.random().toString(36).slice(2,10);
  const ev = {
    id,
    title: "Hello World — Uberaba",
    city: "Uberaba-MG",
    date: new Date(Date.now() + 48*3600*1000).toISOString(),
    venue: "Espaço Demo",
    statusLabel: "Último lote",
    imageUrl: ""
  };
  DB.EVENTS.set(String(id), ev);
}
