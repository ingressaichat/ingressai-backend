// src/app.mjs
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import authRoutes from "./routes/auth.mjs";

const app = express();

/* ===== CORS com credenciais (origens que você usa) ===== */
const ORIGINS_ALLOW_REGEX = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/.+\.github\.io(?:\/.*)?$/i,
  /^https?:\/\/(?:www\.)?ingressai\.chat$/i,
];

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (ORIGINS_ALLOW_REGEX.some(rx => rx.test(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());

/* ===== Health ===== */
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/healthz", (_req, res) => res.send("ok"));

/* ===== API ===== */
app.use("/api/auth", authRoutes);
// (se tiver outras rotas da API já existentes, elas permanecem aqui)

/* ===== Static do Dashboard (/app) =====
 * Mapeia /app/* -> public/app/*
 * - extensions: permite usar /app/login (sem .html)
 * - index: abre /app/ -> dashboard.html
 */
const APP_DIR = path.resolve("public/app");
app.use(
  "/app",
  express.static(APP_DIR, {
    extensions: ["html"],
    index: "dashboard.html",
  })
);

// (opcional) rotas explícitas, caso prefira garantir:
app.get("/app/login", (_req, res) => res.sendFile(path.join(APP_DIR, "login.html")));
app.get("/app/validator", (_req, res) => res.sendFile(path.join(APP_DIR, "validator.html")));
app.get("/app/dashboard", (_req, res) => res.sendFile(path.join(APP_DIR, "dashboard.html")));

export default app;
