import { Router } from "express";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import axios from "axios";
import { nanoid } from "nanoid";
import { listEvents, findEvent } from "./events.mjs";
import { log } from "../utils.mjs";

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
const BASE_URL = process.env.BASE_URL || "";
const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v23.0";
const PHONE_ID = process.env.PHONE_NUMBER_ID || process.env.PUBLIC_WABA || "";
const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";

const ORDERS = new Map(); // id -> { eventId, qty, buyer, pdfUrl }

const publicUrl = (rel) => {
  const host = BASE_URL.replace(/\/$/, "");
  return host ? `${host}${rel}` : rel;
};

async function ensureTicketPDF(orderId, ev, buyerName) {
  const prev = ORDERS.get(orderId);
  if (prev?.pdfUrl) return prev.pdfUrl;

  const fileName = `ticket-${orderId}.pdf`;
  const outPath = path.join(UPLOADS_DIR, fileName);

  const payload = JSON.stringify({ orderId, evId: ev.id, name: buyerName, ts: Date.now() });
  const qrDataUrl = await QRCode.toDataURL(payload);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(22).text("Ingresso IngressAI", { align: "center" }).moveDown(1);
    doc.fontSize(16).text(ev.title);
    doc.text(`${ev.city} • ${new Date(ev.date).toLocaleString("pt-BR")}`);
    if (ev.venue) doc.text(`Local: ${ev.venue}`);
    doc.moveDown(0.5);
    doc.text(`Nome: ${buyerName}`);
    doc.text(`Pedido: ${orderId}`);
    doc.moveDown(1);

    const qr = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const buf = Buffer.from(qr, "base64");
    doc.text("Apresente o QR Code na entrada:", { align: "left" });
    doc.image(buf, { fit: [220, 220], align: "left" });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  const url = publicUrl(`/uploads/${encodeURIComponent(fileName)}`);
  ORDERS.set(orderId, { ...(ORDERS.get(orderId) || {}), pdfUrl: url });
  return url;
}

async function sendWhatsAppDoc(to, linkUrl, fileName = "ingresso.pdf") {
  if (!PHONE_ID || !TOKEN) {
    log("waba.send.skip", { reason: "PHONE_ID/TOKEN ausente", to, linkUrl });
    return { ok: false, skipped: true };
  }
  const params = { access_token: TOKEN };
  const payload = { messaging_product: "whatsapp", to, type: "document", document: { link: linkUrl, filename: fileName } };
  const { data } = await axios.post(`${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}/messages`, payload, {
    params, headers: { "Content-Type": "application/json" }, timeout: 15000
  });
  return data;
}

router.get("/events", (_req, res) => {
  const items = listEvents().map(e => ({
    id: e.id, title: e.title, city: e.city, date: e.date, venue: e.venue, statusLabel: e.statusLabel, imageUrl: e.imageUrl
  }));
  res.json({ items });
});

router.post("/orders", (req, res) => {
  const { eventId, qty = 1, buyer = {} } = req.body || {};
  const ev = findEvent(eventId);
  if (!ev) return res.status(400).json({ error: "Evento inválido" });
  const orderId = "ORD-" + nanoid(8).toUpperCase();
  ORDERS.set(orderId, { eventId: ev.id, qty: Math.max(1, Number(qty) || 1), buyer });
  log("order.created", { orderId, eventId: ev.id, to: buyer?.phone || null });
  res.json({ ok: true, orderId });
});

router.post("/tickets/issue", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const order = ORDERS.get(orderId);
    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
    const ev = findEvent(order.eventId);
    if (!ev) return res.status(400).json({ error: "Evento inválido" });
    const buyerName = order.buyer?.name || "Participante";
    const pdfUrl = await ensureTicketPDF(orderId, ev, buyerName);
    res.json({ ok: true, orderId, pdfUrl });
  } catch (e) {
    log("tickets.issue.error", { msg: e.message });
    res.status(500).json({ error: "Falha ao emitir" });
  }
});

router.get("/purchase/start", async (req, res) => {
  try {
    const evId = String(req.query.ev || req.query.eventId || "");
    const to = String((req.query.to || "").toString().replace(/\D/g, ""));
    const name = (req.query.name || "Participante").toString().trim();
    const qty = Math.max(1, Number(req.query.qty || 1));

    const ev = findEvent(evId);
    if (!ev) return res.status(400).json({ error: "Evento inválido" });

    const orderId = "ORD-" + nanoid(8).toUpperCase();
    const buyer = { name, phone: to };
    ORDERS.set(orderId, { eventId: ev.id, qty, buyer });
    const pdfUrl = await ensureTicketPDF(orderId, ev, name);

    if (to) {
      try { await sendWhatsAppDoc(to, pdfUrl, `ingresso-${orderId}.pdf`); log("waba.doc.sent", { to, orderId }); }
      catch (e) { log("waba.doc.fail", { to, orderId, err: e?.response?.data || e.message }); }
    }

    res.json({ ok: true, code: orderId, pdfUrl });
  } catch (e) {
    log("purchase.start.error", { msg: e.message });
    res.status(500).json({ error: "Falha no início da compra" });
  }
});

router.post("/test/send-ticket", async (req, res) => {
  try {
    const { phone, orderId } = req.body || {};
    const o = ORDERS.get(orderId);
    if (!o) return res.status(404).json({ error: "Pedido não encontrado" });
    const ev = findEvent(o.eventId);
    const buyerName = o.buyer?.name || "Participante";
    const pdfUrl = await ensureTicketPDF(orderId, ev, buyerName);
    if (phone) {
      try { await sendWhatsAppDoc(String(phone).replace(/\D/g,""), pdfUrl, `ingresso-${orderId}.pdf`); }
      catch (e) { log("test.send.fail", { to: phone, err: e?.response?.data || e.message }); }
    }
    res.json({ ok: true, orderId, pdfUrl });
  } catch {
    res.status(500).json({ error: "Falha no teste de envio" });
  }
});

export default router;
