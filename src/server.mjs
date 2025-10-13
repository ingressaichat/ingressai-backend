import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import app from "./routes/core.mjs";
import { PORT } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// estáticos (landing/admin simples)
app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[ingressai] server listening on :${PORT}`);
});

// logs de robustez
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
EOFcat > src/routes/api.mjs <<'EOF'
import { Router } from "express";
import health from "./health.mjs";
import events from "./events.mjs";
import org from "./org.mjs";
import tickets from "./tickets.mjs";
import validator from "./validator.mjs";
import webhook from "./webhook.mjs";

const router = Router();

router.use("/health", health);
router.use("/events", events);
router.use("/organizers", org);
router.use("/tickets", tickets);
router.use("/validator", validator);
router.use("/webhook", webhook);

// compat: cidades
router.get("/cities", (_req,res) => res.redirect(307, "/api/events/cities"));

export default router;
