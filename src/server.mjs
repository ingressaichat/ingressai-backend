import express from "express";
import helmet from "helmet";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./utils.mjs";

// Routers
import eventsRouter from "./routes/events.mjs";
import ticketsRouter from "./routes/tickets.mjs";
import purchaseRouter from "./routes/purchase.mjs";
import coreRouter from "./routes/core.mjs";
import webhookRouter from "./routes/webhook.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ENV
const PORT        = Number(process.env.PORT || 8080);
const NODE_ENV    = process.env.NODE_ENV || "production";
const ALLOWED     = (process.env.ALLOWED_ORIGINS || "https://ingressai.chat,http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "uploads");

// Ensure dirs
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

// App
const app = express();

// Segurança e CORS primeiro (não mexem no body)
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED.includes(origin)) ? cb(null, true) : cb(new Error("CORS")),
  credentials: true
}));

// Static uploads
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1y", etag: true }));

/**
 * MUITO IMPORTANTE:
 * O /webhook precisa receber o corpo em RAW (Buffer) para validar a assinatura.
 * Então montamos o router do webhook ANTES do express.json().
 */
app.use("/webhook", webhookRouter);

// Agora sim os parsers globais para o resto das rotas
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Demais rotas
app.use("/events", eventsRouter);
app.use("/tickets", ticketsRouter);
app.use("/purchase", purchaseRouter);
app.use("/", coreRouter);

// 404
app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// 500
app.use((err, req, res, next) => {
  log("server.error", { msg: err?.message });
  res.status(500).json({ ok: false, error: "Internal error" });
});

// Start
app.listen(PORT, "0.0.0.0", () => {
  log("server.start", { port: PORT, env: NODE_ENV });
});

export default app;
