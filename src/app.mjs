import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import authRoutes from "./routes/auth.mjs";

const app = express();

/* ===== CORS com credenciais ===== */
const ORIGINS_ALLOW_REGEX = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/.+\.github\.io(?:\/.*)?$/i,
  /^https?:\/\/(?:www\.)?ingressai\.chat$/i,
];

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (ORIGINS_ALLOW_REGEX.some((rx) => rx.test(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use("/api/auth", authRoutes);

/* ===== Front (dashboard em public/app) ===== */
const APP_DIR = path.resolve("public/app");

app.get("/app", (_req, res) =>
  res.sendFile(path.join(APP_DIR, "dashboard.html"))
);
app.get("/app/login", (_req, res) =>
  res.sendFile(path.join(APP_DIR, "login.html"))
);
app.get("/app/validator", (_req, res) =>
  res.sendFile(path.join(APP_DIR, "validator.html"))
);
app.get("/app/dashboard.html", (_req, res) =>
  res.sendFile(path.join(APP_DIR, "dashboard.html"))
);

app.use(
  "/app",
  express.static(APP_DIR, {
    index: ["dashboard.html", "index.html"],
    extensions: ["html"],
    setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
  })
);

export default app;
