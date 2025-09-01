import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import { seedIfEmpty } from "./db.mjs";
import { log } from "./utils.mjs";

import ticketsRouter from "./tickets.mjs";
import { eventsRouter } from "./routes/events.mjs";
import webhookRouter from "./routes/webhook.mjs";
import purchaseRouter from "./routes/purchase.mjs";

const app = express();
const PORT = Number(process.env.PORT || 8080);

// middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" })); // JSON normal
// importante: o /webhook usa body raw — é aplicado no router

// estáticos uploads
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
app.use("/uploads", express.static(UPLOADS_DIR, { fallthrough: true, etag: true, maxAge: "1h" }));

// health
app.get("/", (_req, res) => res.send("ok"));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// rotas
app.use(eventsRouter);
app.use(ticketsRouter);
app.use(purchaseRouter);
app.use(webhookRouter);

// inicialização
seedIfEmpty();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ingressai-backend v${process.env.npm_package_version} ouvindo em http://0.0.0.0:${PORT}`);
});
