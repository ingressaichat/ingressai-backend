import crypto from "crypto";

const DB = {
  EVENTS: new Map()
};

// helpers
export function pureEventName(ev) {
  // remove sufixo " — Cidade" se existir
  return String(ev?.title || "").replace(/\s+—\s+.+$/, "");
}

export function listEvents() {
  return Array.from(DB.EVENTS.values()).map(e => ({ ...e }));
}
export function findEvent(id) {
  return DB.EVENTS.get(String(id)) || null;
}
export function updateEvent(id, patch) {
  const ev = findEvent(id);
  if (!ev) return false;
  const next = { ...ev, ...patch };
  DB.EVENTS.set(ev.id, next);
  return true;
}
export function deleteEvent(id) {
  return DB.EVENTS.delete(String(id));
}

// seed básico
(function seedIfEmpty() {
  if (DB.EVENTS.size) return;
  const id = crypto.randomBytes(4).toString("hex");
  DB.EVENTS.set(id, {
    id,
    title: "Hello World — Uberaba",
    city: "Uberaba-MG",
    date: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    venue: "Espaço Demo",
    statusLabel: "Último lote",
    imageUrl: ""
  });
})();
