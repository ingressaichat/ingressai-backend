import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import api from "./api.mjs";

const app = express();

app.use(cookieParser());
// JSON padrão para tudo, MENOS o webhook (que aplica raw no arquivo do webhook)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS aberto (você já imprime allowed origins no start)
app.use(cors({
  origin: (_origin, cb) => cb(null, true),
  credentials: true
}));

app.use("/api", api);

export default app;
