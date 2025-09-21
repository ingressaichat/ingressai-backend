import http from "node:http";
import app from "./app.mjs";

const PORT = process.env.PORT || 8080;

// recomendações para proxy (Railway)
app.set("trust proxy", 1);

// sobe o HTTP puro (sem HTTPS aqui)
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  // log útil para saber que realmente subiu
  console.log(`[IngressAI] listening on :${PORT}`);
});

// logs básicos de erro p/ container não “sumir” silenciosamente
server.on("error", (err) => {
  console.error("server.error", err?.stack || err);
  process.exit(1);
});
