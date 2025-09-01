import { Router } from "express";
import { DB, eventPublic } from "../db.mjs";

export const eventsRouter = Router();

eventsRouter.get("/events", (req, res) => {
  const items = [...DB.EVENTS.values()].map(eventPublic);
  res.json({ items });
});

eventsRouter.post("/events", (req, res) => {
  const { title, city, date, venue } = req.body || {};
  if (!title || !city || !date) return res.status(400).json({ error: "title/city/date required" });
  const id = Math.random().toString(36).slice(2,10);
  const ev = { id, title, city, date, venue: venue || "", statusLabel: "Em breve", imageUrl: "" };
  DB.EVENTS.set(id, ev);
  res.json({ ok: true, event: ev });
});

export function findEvent(id) { return DB.EVENTS.get(String(id)); }
export function updateEvent(id, patch) {
  const cur = DB.EVENTS.get(String(id));
  if (!cur) return null;
  const next = { ...cur, ...patch };
  DB.EVENTS.set(String(id), next);
  return next;
}
export function deleteEvent(id) { return DB.EVENTS.delete(String(id)); }
export function listEvents() { return [...DB.EVENTS.values()]; }
export function pureEventName(ev){ return String(ev?.title || "Evento").replace(/\s{2,}/g," ").trim(); }
