// src/lib/wa.mjs
import express from "express";
import axios from "axios";
import crypto from "crypto";
import { log } from "../utils.mjs";

const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION  = process.env.GRAPH_API_VERSION || "v23.0";
const PHONE_ID       = process.env.PHONE_NUMBER_ID || process.env.PUBLIC_WABA || "";
const TOKEN          = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
const APP_SECRET     = process.env.APP_SECRET || "";

const APP_PROOF = (APP_SECRET && TOKEN)
  ? crypto.createHmac("sha256", APP_SECRET).update(TOKEN).digest("hex")
  : null;

export const waConfigured = Boolean(PHONE_ID && TOKEN);

// ⚠️ Nada de params=function aqui. Use interceptor.
const api = axios.create({
  baseURL: `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}`,
  headers: { "Content-Type": "application/json" }
});

api.interceptors.request.use((config) => {
  config.params = {
    ...(config.params || {}),
    access_token: TOKEN,
    ...(APP_PROOF ? { appsecret_proof: APP_PROOF } : {})
  };
  return config;
});

/** Texto */
export async function sendText(to, body) {
  if (!waConfigured) { log("[WA send mock:text]", { to, body }); return { ok:true, mock:true }; }
  try {
    const { data } = await api.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body }
    });
    return { ok:true, data };
  } catch (e) {
    log("wa.send.error", e?.response?.data || e.message);
    return { ok:false, error: e?.response?.data || e.message };
  }
}

/** Lista interativa */
export async function sendList(to, { header, body, button, sections, footer }) {
  if (!waConfigured) {
    log("[WA send mock:list]", { to, header, body, button, sections });
    return { ok:true, mock:true };
  }
  try {
    const interactive = {
      type: "list",
      body: { text: body || "Selecione uma opção" },
      action: { button: button || "Escolher", sections }
    };
    if (header) interactive.header = { type: "text", text: header };
    if (footer) interactive.footer = { text: footer };

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive
    };

    const { data } = await api.post("/messages", payload);
    return { ok:true, data };
  } catch (e) {
    log("wa.send.error", e?.response?.data || e.message);
    return { ok:false, error: e?.response?.data || e.message };
  }
}

/** Debug */
export const waDebugRouter = express.Router();
waDebugRouter.get("/", (_req, res) => {
  res.json({
    configured: waConfigured,
    phoneIdSet: Boolean(PHONE_ID),
    tokenSet: Boolean(TOKEN),
    version: GRAPH_VERSION
  });
});
