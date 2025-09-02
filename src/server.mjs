import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./utils.mjs";
import webhookRouter from "./routes/webhook.mjs";
import { ticketsRouter } from "./routes/tickets.mjs";
import { eventsRouter } from "./routes/events.mjs";

const PORT = Number(process.env.PORT || 8080);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// estáticos (banners salvos pelo admin)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// webhook PRECISA vir antes do body parser global (usa raw)
app.use("/webhook", webhookRouter);

// body parser para o restante da API
app.use(express.json());

// segurança e CORS
app.use(helmet());
app.use(cors());

// rotas
app.get("/", (req, res) => res.json({ ok:true, name:"ingressai-backend", ts: new Date().toISOString() }));
app.use(ticketsRouter); // expõe /tickets/*, /purchase/start etc.
app.use(eventsRouter);  // expõe /events

app.listen(PORT, () => {
  log("server.start", { port: PORT, env: process.env.NODE_ENV || "development" });
});
