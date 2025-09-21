import http from "node:http";
import app from "./app.mjs";

const PORT = process.env.PORT || 8080;

// recomendações para proxy (Railway/Edge)
app.set("trust proxy", 1);

// sobe HTTP (TLS fica no edge da Railway)
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[IngressAI] listening on 0.0.0.0:${PORT}`);
});

server.on("error", (err) => {
  console.error("server.error", err?.stack || err);
  process.exit(1);
});
