import http from "http";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import app from "./routes/core.mjs";
import { PORT } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// estáticos (se tiver front simples em /public)
app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

const server = http.createServer(app);
server.listen(PORT, ()=> console.log(`[ingressai] server listening on :${PORT}`) );
