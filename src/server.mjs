import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import app from "./routes/core.mjs";           // ✅ usa o core que já monta /api/health
import { PORT } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[ingressai] server listening on :${PORT}`);
});

// hardening/logs
process.on("uncaughtException", (err) => {
  console.error("[ingressai][uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[ingressai][unhandledRejection]", reason);
});
process.on("SIGTERM", () => {
  console.log("[ingressai] SIGTERM received. Shutting down…");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[ingressai] SIGINT received. Shutting down…");
  server.close(() => process.exit(0));
});
