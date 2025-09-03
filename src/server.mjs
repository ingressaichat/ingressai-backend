import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./utils.mjs";
import webhookRouter from "./routes/webhook.mjs";
import { ticketsRouter } from "./routes/tickets.mjs";
import { eventsRouter } from "./routes/events.mjs";

const PORT = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// arquivos enviados (banners) — garantir pasta
import fs from "fs";
const uploadsDir = path.join(__dirname, "uploads");
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}
app.use("/uploads", express.static(uploadsDir));

// webhook usa raw body
app.use("/webhook", webhookRouter);

// body parser global pro resto
app.use(express.json());

// segurança + CORS
app.use(helmet());
app.use(cors());

// rotas
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.json({ ok: true, name: "ingressai-backend", ts: new Date().toISOString() }));
app.use(ticketsRouter); // /tickets/*, /purchase/start, /validate etc
app.use(eventsRouter);  // /events

app.listen(PORT, "0.0.0.0", () => {
  log("server.start", { port: PORT, env: process.env.NODE_ENV || "development" });
});
