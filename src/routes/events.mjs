import { Router } from "express";
import { body, validationResult } from "express-validator";
import { listEvents, createEvent, updateEvent, deleteEvent, findEvent } from "../lib/db.mjs";

const events = Router();

/** Lista pública (vitrine) */
events.get("/", async (req, res) => {
  const page = Number(req.query.page || 1);
  const size = Number(req.query.size || 50);
  const data = await listEvents(page, size);
  return res.json(data);
});

/** Detalhe público */
events.get("/:id", async (req, res) => {
  const ev = await findEvent(req.params.id);
  if (!ev) return res.status(404).json({ ok: false, error: "not_found" });
  return res.json({ ok: true, event: ev });
});

/** Admin: criar */
events.post("/",
  body("id").isString().trim().notEmpty(),
  body("title").isString().trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const ev = await createEvent(req.body);
    return res.status(201).json({ ok: true, event: ev });
  }
);

/** Admin: update parcial */
events.patch("/:id", async (req, res) => {
  const ev = await updateEvent(req.params.id, req.body || {});
  if (!ev) return res.status(404).json({ ok: false, error: "not_found" });
  return res.json({ ok: true, event: ev });
});

/** Admin: remover */
events.delete("/:id", async (req, res) => {
  await deleteEvent(req.params.id);
  return res.json({ ok: true });
});

export default events;
