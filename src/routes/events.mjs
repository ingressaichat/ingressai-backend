// src/routes/events.mjs
import { Router } from "express";
import { listEvents, findEvent } from "../lib/db.mjs"; // <- caminho correto

export const eventsRouter = Router();

eventsRouter.get("/events", (req, res) => {
  const page = Number(req.query.page || 1);
  const size = Number(req.query.size || 10);
  const data = listEvents(page, size);
  res.json({ ok: true, ...data });
});

eventsRouter.get("/events/:id", (req, res) => {
  const ev = findEvent(String(req.params.id));
  if (!ev) return res.status(404).json({ ok: false, error: "Evento não encontrado" });
  res.json({ ok: true, event: ev });
});
