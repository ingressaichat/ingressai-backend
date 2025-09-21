// src/server.mjs
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import apiRouter from "./routes/api.mjs";
import authRouter from "./routes/auth.mjs";
import webhookRouter from "./routes/webhook.mjs";
import { readSession } from "./lib/auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/** === CORS (GH Pages → Railway) === */
const allowList = [
  /\.github\.io$/i,
  /ingressai\.chat$/i,
  /localhost(:\d+)?$/i,
];
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman
    if (allowList.some((r) => r.test(origin))) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/** === Middlewares === */
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

/** === Health raiz === */
app.get("/", (_req, res) => res.json({ ok: true, name: "IngressAI API", ts: Date.now() }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/** === App/Dashboard stub (redireciono sua UX) === */
app.get("/app/login", (req, res) => {
  const s = readSession(req);
  const ok = !!s;
  if (!ok) return res.status(401).send(`
    <!doctype html><meta charset="utf-8" />
    <title>Dashboard — IngressAI</title>
    <body style="font-family:system-ui,sans-serif">
      <h1>Faça login pelo site</h1>
      <p>Abra <a href="https://ingressai.chat/app/login.html" target="_blank" rel="noopener">login</a> e verifique seu código.</p>
    </body>
  `);
  res.sendFile(path.join(__dirname, "../public/app-login.html"));
});

/** === Routers === */
app.use("/api", authRouter);      // /api/auth/*
app.use("/api", apiRouter);       // /api/health, /api/events, /api/purchase/start, etc.
app.use("/webhook", webhookRouter);

/** === Static (opcional p/ stub do dashboard) === */
app.use("/public", express.static(path.join(__dirname, "../public"), { maxAge: "1h", etag: true }));

/** === Boot === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[IngressAI] listening on :${PORT}`);
});
