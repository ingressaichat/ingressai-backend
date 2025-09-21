// /src/app.mjs
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import authRoutes from "./routes/auth.mjs";

const app = express();

/* ========= CORS com credenciais ========= */
const ORIGINS_ALLOW = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/.*\.github\.io(?:\/.*)?$/i,
  /^https?:\/\/(?:www\.)?ingressai\.chat$/i,
  /^https?:\/\/.*\.railway\.app$/i,
];

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (ORIGINS_ALLOW.some(rx => rx.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());

/* ========= Health ========= */
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ========= API ========= */
app.use("/api/auth", authRoutes);

/* ========= Frontend do Dashboard =========
   Estrutura esperada:
   public/
     app/
       login.html
       dashboard.html
       validator.html
       app.js (se houver)
*/
const APP_DIR = path.resolve("public/app");

// 1) static para servir assets/JS/CSS/HTML dentro de /public/app
app.use(
  "/app",
  express.static(APP_DIR, {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
      else res.setHeader("Cache-Control", "public, max-age=600");
    },
  })
);

// 2) rotas explícitas (garantem funcionamento mesmo se o static não casar)
app.get("/app", (_req, res) => res.sendFile(path.join(APP_DIR, "login.html")));
app.get("/app/login.html", (_req, res) => res.sendFile(path.join(APP_DIR, "login.html")));
app.get("/app/dashboard.html", (_req, res) => res.sendFile(path.join(APP_DIR, "dashboard.html")));
app.get("/app/validator.html", (_req, res) => res.sendFile(path.join(APP_DIR, "validator.html")));

// 3) fallback genérico para qualquer arquivo direto em /app
app.get("/app/:file", (req, res, next) => {
  const file = (req.params.file || "").replace(/[^a-z0-9._-]/gi, "");
  if (!file) return next();
  res.sendFile(path.join(APP_DIR, file), (err) => {
    if (err) next(); // deixa cair no 404 global se não existir
  });
});

/* ========= 404 padrão (opcional) ========= */
app.use((req, res) => {
  res.status(404).send("Not Found");
});

export default app;
