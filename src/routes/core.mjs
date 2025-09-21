import { Router } from "express";

const core = Router();

core.get("/", (_req, res) => res.json({ ok: true, name: "IngressAI API" }));
core.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

export default core;
