import { log } from "./utils.mjs";

export const DB = {
  EVENTS: new Map()
};

function seed() {
  const id = "hello-world-uberaba";
  if (!DB.EVENTS.has(id)) {
    const ev = {
      id,
      title: "Hello World — Uberaba",
      city: "Uberaba",
      date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), // +7 dias
      venue: "Espaço IngressAI",
      statusLabel: "Em breve",
      imageUrl: ""
    };
    DB.EVENTS.set(id, ev);
    log("seed.event", { id: ev.id, title: ev.title });
  }
}
seed();

export function listEvents() {
  return Array.from(DB.EVENTS.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
}

export function findEvent(id) {
  return DB.EVENTS.get(String(id));
}

export function updateEvent(id, patch) {
  const prev = findEvent(id);
  if (!prev) return false;
  DB.EVENTS.set(id, { ...prev, ...patch });
  return true;
}

export function deleteEvent(id) {
  return DB.EVENTS.delete(String(id));
}

/** remove “— Cidade” do final do título, se existir */
export function pureEventName(evOrTitle) {
  const ev = typeof evOrTitle === "string" ? { title: evOrTitle, city: "" } : evOrTitle || {};
  const title = ev.title || "";
  const city = ev.city || "";
  if (!title || !city) return title || "";
  const esc = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\s*[—–-]\\s*${esc}\\s*$`, "i");
  const cleaned = title.replace(pattern, "").trim();
  return cleaned || title;
}
