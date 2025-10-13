import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import api from "./api.mjs";
import { ORIGIN, ALLOWED_ORIGINS_ARR } from "../config.mjs";

const app = express();

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));          // JSON padrão
app.use(express.urlencoded({ extended: true }));   // forms

// CORS
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true
}));

// OBS: o express.raw({type:'*/*'}) é aplciado DENTRO do webhook.mjs SOMENTE.

app.use("/api", api);

export default app;
