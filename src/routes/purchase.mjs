import axios from "axios";
import { Router } from "express";
import crypto from "crypto";
import { DB, newOrder } from "../db.mjs";
import { log } from "../utils.mjs";

export const purchaseRouter = Router();

// ENV WhatsApp
const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION  = process.env.GRAPH_API_VERSION || "v23.0";
const PHONE_ID       = process.env.PHONE_NUMBER_ID || process.env.PUBLIC_WABA || "";
const TOKEN          = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
const APP_SECRET     = process.env.APP_SECRET || "";

function appProof(token) {
  if (!APP_SECRET || !token) return null;
  return crypto.createHmac("sha256", APP_SECRET).update(token).digest("hex");
}
function wabaParams() {
  const params = { access_token: TOKEN };
  const proof = appProof(TOKEN);
  if (proof) params.appsecret_proof = proof;
  return params;
}

// helper: envia DOC
async function waSendDocument({ to, url, filename }) {
  if (!PHONE_ID || !TOKEN) throw new Error("WABA not configured");
  const endpoint = `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "document",
    document: { link: url, filename, caption: "Seu ingresso 🎟️" }
  };
  const res = await axios.post(endpoint, payload, {
    params: wabaParams(),
    headers: { "Content-Type": "application/json" },
    timeout: 15000
  });
  return res.data;
}

// GET /purchase/start?ev=ID&to=PHONE&name=N&qty=1
purchaseRouter.get("/purchase/start", async (req, res) => {
  try {
    const { ev, to, name, qty } = req.query || {};
    if (!ev || !to || !name) return res.status(400).json({ error: "ev/to/name required" });

    const event = DB.EVENTS.get(String(ev));
    if (!event) return res.status(404).json({ error: "event not found" });

    const order = newOrder({ eventId: event.id, name: String(name), phone: String(to), qty: Number(qty || 1) });

    // gera pdf (se ainda não existir) chamando a própria API local
    const base = (process.env.BASE_URL || "").replace(/\/$/, "");
    const issue = await axios.post(`${base}/tickets/issue`, { orderId: order.code }, {
      headers: { "Content-Type": "application/json" }, timeout: 20000
    });
    const pdfUrl = issue.data?.url;
    if (!pdfUrl) throw new Error("pdf url missing");

    // envia para o WhatsApp como documento — COM appsecret_proof
    try {
      await waSendDocument({ to: order.phone, url: pdfUrl, filename: `ingresso-${order.code}.pdf` });
    } catch (e) {
      log("waba.doc.fail", { to: order.phone, orderId: order.code, err: e?.response?.data || e.message });
      // segue — a conversa ainda recebe o link direto
    }

    log("purchase.start.ok", { ok: true, code: order.code, pdfUrl });
    res.json({ ok: true, code: order.code, pdfUrl });
  } catch (e) {
    log("purchase.start.fail", e?.response?.data || e.message);
    res.json({ ok: false, error: e.message });
  }
});

export default purchaseRouter;
