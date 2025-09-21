// src/server.mjs
import http from "node:http";
import app from "./app.mjs";

/**
 * Config
 */
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);

// se estiver atrás de proxy (Railway/NGINX), habilite para confiar em X-Forwarded-*
app.set("trust proxy", 1);

/**
 * Cria servidor HTTP "bruto" (TLS/HTTPS fica a cargo do proxy da plataforma)
 */
const server = http.createServer(app);

/**
 * Afinando o servidor para produção no Railway
 * - keepAliveTimeout maior que 60s ajuda a evitar 502 intermitente em algumas plataformas
 * - headersTimeout > keepAliveTimeout para não encerrar conexões ativas de forma abrupta
 * - requestTimeout para evitar requisições penduradas
 */
server.keepAliveTimeout = 65_000; // 65s
server.headersTimeout    = 70_000; // 70s (sempre > keepAliveTimeout)
server.requestTimeout    = 90_000; // 90s

/**
 * Sobe o servidor
 */
server.listen(PORT, HOST, () => {
  console.log(`[IngressAI] listening on ${HOST}:${PORT}`);
});

/**
 * Logs/Tratadores de erro – evita que o processo morra “mudo”
 */
server.on("error", (err) => {
  console.error("[server] fatal error:", err?.stack || err);
  // Em geral deixamos o processo cair para o orquestrador reiniciar.
  // Aqui só logamos; SIGTERM abaixo faz shutdown limpo.
});

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err?.stack || err);
  // encerra com código de falha após curto atraso para flush de logs
  setTimeout(() => process.exit(1), 100);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
  // não mata imediatamente; depende do tipo de falha
});

/**
 * Graceful shutdown – fecha conexões ativas ao receber sinal do orquestrador
 */
let isShuttingDown = false;
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[IngressAI] received ${signal}, shutting down gracefully...`);
  // dá um tempo para novas conexões pararem de chegar
  server.close((err) => {
    if (err) {
      console.error("[server] error on close:", err?.stack || err);
      process.exit(1);
    }
    console.log("[IngressAI] http server closed. Bye!");
    process.exit(0);
  });

  // força saída se travar (ex.: sockets pendentes)
  setTimeout(() => {
    console.warn("[IngressAI] forced shutdown (timeout)");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

/**
 * Exporta para testes/instrumentação, se necessário
 */
export default server;
