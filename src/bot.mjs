import express from "express";

const bot = express.Router();
bot.use(express.json({ limit: "1mb" }));

// usa o seu webhook real se existir; senão, stub para não derrubar o boot
let webhookRouter;
try {
  ({ default: webhookRouter } = await import("./routes/webhook.mjs"));
} catch (e) {
  console.warn("[warn] webhook.mjs não encontrado, usando stub:", e?.message);
  const stub = express.Router();
  stub.get("/", (_req, res) => res.json({ ok: true, msg: "webhook stub" }));
  webhookRouter = stub;
}

bot.use("/webhook", webhookRouter);
export default bot;
