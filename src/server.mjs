import express from "express";
import morgan from "morgan";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";

import { events, findEvent, upsertEvent } from "./events.mjs";
import { ticketsRouter } from "./ticketsRouter.mjs";
import { webhookRouter } from "./webhook.mjs";
import { log } from "./utils.mjs";

const app = express();

/** ENV */
const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || "production";
const BASE_URL = process.env.BASE_URL || "";
const STATIC_DIR = process.env.STATIC_DIR || "public";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL || (BASE_URL ? `${BASE_URL}/uploads` : "/uploads");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 8);
const CORS_RAW = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "";
const CORS_LIST = CORS_RAW.split(",").map(s => s.trim()).filter(Boolean);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ALLOW_IMAGE_UPLOADS = (process.env.ALLOW_IMAGE_UPLOADS || "0") === "1";

/** Dirs */
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/** Captura rawBody p/ verificar assinatura do webhook (Meta exige isso) */
app.use((req, res, next) => {
  if ((req.headers["content-type"] || "").includes("application/json")) {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => {
      req.rawBody = data;
      try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
      next();
    });
  } else { next(); }
});

/** Parsers adicionais */
app.use(express.urlencoded({ extended: true, limit: `${MAX_UPLOAD_MB}mb` }));

/** CORS + logs */
app.use(cors({ origin: CORS_LIST.length ? CORS_LIST : "*" }));
if (NODE_ENV !== "production") app.use(morgan("dev"));

/** Static */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1h", immutable: true }));
app.use("/", express.static(path.join(__dirname, "..", STATIC_DIR), { maxAge: "5m" }));

/** Health */
app.get("/health", (req, res) => {
  res.json({ ok: true, env: NODE_ENV, baseUrl: BASE_URL, ts: Date.now() });
});

/** Feed p/ a landing */
app.get("/events", (req, res) => res.json({ ok: true, events }));

/** Admin helper — cria/atualiza evento */
app.post("/events", express.json(), (req, res) => {
  if (ADMIN_TOKEN && req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    const ev = upsertEvent(req.body || {});
    return res.json({ ok: true, event: ev });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});

/** Upload direto da imagem do evento (multipart) */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });
app.post("/events/:id/image", upload.single("image"), async (req, res) => {
  if (!ALLOW_IMAGE_UPLOADS) return res.status(403).json({ ok: false, error: "uploads desabilitados" });
  if (ADMIN_TOKEN && req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const ev = findEvent(req.params.id);
  if (!ev) return res.status(404).json({ ok: false, error: "Evento não encontrado" });
  if (!req.file) return res.status(400).json({ ok: false, error: "Arquivo ausente" });

  const ext = (req.file.mimetype || "").split("/").pop() || "bin";
  const fname = `ev_${String(ev.id).replace(/[^\w-]/g, "")}_${Date.now()}.${ext}`;
  const dest = path.join(UPLOADS_DIR, fname);
  fs.writeFileSync(dest, req.file.buffer);
  ev.imageUrl = `${MEDIA_BASE_URL}/${fname}`;
  ev.img = ev.imageUrl; // alias pra compat
  return res.json({ ok: true, event: ev });
});

/** Webhook do WhatsApp (recebe imagens e mapeia para eventos) */
app.use("/webhook", webhookRouter);

/** Tickets / pedidos */
app.use(ticketsRouter);

/** 404 */
app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

/** 500 */
app.use((err, req, res, next) => {
  log("error", { message: err?.message, stack: err?.stack });
  res.status(500).json({ ok: false, error: "Internal error" });
});

app.listen(PORT, () => log("up", { port: PORT, env: NODE_ENV, baseUrl: BASE_URL }));
