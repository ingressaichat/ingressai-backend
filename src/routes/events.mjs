import { Router } from "express";
import { listEvents, findEvent } from "../db.mjs";

export const eventsRouter = Router();

eventsRouter.get("/events", (req, res) => {
  res.json({ ok:true, events: listEvents() });
});

eventsRouter.get("/events/:id", (req, res) => {
  const ev = findEvent(req.params.id);
  if (!ev) return res.status(404).json({ ok:false, error:"not_found" });
  res.json({ ok:true, event: ev });
});
