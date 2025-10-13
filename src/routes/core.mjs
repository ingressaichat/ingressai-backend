// src/routes/core.mjs
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import api from "./api.mjs";
import { ALLOWED_ORIGINS } from "../config.mjs";

const app = express();

/**
 * Importante: capturar o raw body SEM consumir o stream.
 * O body-parser permite isso via a opção `verify`, que recebe o Buffer.
 * Assim mantemos req.body (JSON) e, ao mesmo tempo, temos req.rawBody para validar a assinatura.
 */
app.use(express.json({
  limit: "2mb",
  verify: (req, res, buf) => {
    // guarda o buffer bruto para X-Hub-Signature-256 no webhook
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*");
    cb(null, ok);
  },
  credentials: true
}));

// todas as rotas de API
app.use("/api", api);

export default app;
