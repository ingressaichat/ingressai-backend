// IngressAI — servidor Express pronto p/ Railway
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

/* ===== Básico / segurança ===== */
app.set("trust proxy", 1); // necessário atrás do proxy da Railway
app.use(helmet());
app.use(cors({
  origin: true,            // libera durante a fase inicial (ajuste depois)
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ===== Rate limit só em /api ===== */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false
});
app.use("/api", apiLimiter);

/* ===== Health ===== */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* ===== Rotas de negócio (se presentes) =====
   Monta dinamicamente; se não existir, só loga e segue.
*/
async function mountIfExists(prefix, relPath) {
  try {
    const mod = await import(relPath);
    const router = mod.default || mod.router || mod;
    if (typeof router === "function") {
      app.use(prefix, router);
      console.log(`[boot] montado ${prefix} -> ${relPath}`);
    } else {
      console.warn(`[boot] ${relPath} não exporta router`);
    }
  } catch (e) {
    console.warn(`[boot] ignorando ${prefix}: ${relPath} não encontrado`, e?.code || "");
  }
}

// mesmas rotas que você já tinha nos logs
await mountIfExists("/api/tickets",  "./routes/tickets.mjs");
await mountIfExists("/api/media",    "./routes/media.mjs");
await mountIfExists("/webhook",      "./routes/webhook.mjs");
await mountIfExists("/api/auth",     "./routes/auth.mjs");
await mountIfExists("/api/events",   "./routes/events.mjs");
await mountIfExists("/api/org",      "./routes/org.mjs");

/* ===== Static: landing em /public ===== */
const PUBLIC_DIR = join(__dirname, "../public");
app.use(express.static(PUBLIC_DIR, {
  // cache leve pros assets; html fica sem cache via padrão
  maxAge: "1h",
  setHeaders(res, path) {
    if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  }
}));

// fallback simples: raiz rende o index.html
app.get("/", (req, res) => {
  res.sendFile(join(PUBLIC_DIR, "index.html"));
});

/* ===== Start ===== */
const PORT = Number(process.env.PORT) || 8080;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`IngressAI server @ ${PORT}`);
});

// encerramento limpo (opcional)
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT",  () => process.exit(0));
