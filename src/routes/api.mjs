// src/routes/api.mjs
import { Router } from "express";
import cookieParser from "cookie-parser";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { nanoid } from "nanoid";

import { listEvents, findEvent, addTicket, getTicketById, getTicketByCode } from "../lib/db.mjs";
import { sendDocument, sendText } from "../lib/wa.mjs";
import { log } from "../utils.mjs";
import { BASE_URL } from "../config.mjs";

const api = Router();

/** Cookies só para /api/* */
api.use(cookieParser());

/** Origem pública (fallback se BASE_URL não setado) */
function originFrom(req) {
  const base = BASE_URL || "";
  if (base) return base.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

/** ========= Health (para landing) ========= */
api.get("/health", (_req, res) => res.json({ ok:true, t: Date.now(), service:"api" }));

/** ========= Eventos (landing) ========= */
api.get("/events", (req, res) => {
  const page = Number(req.query.page || "1");
  const size = Number(req.query.size || "50");
  const { items, totalPages } = listEvents(page, size);
  const mapped = items.map(e => ({
    id: e.id, title: e.title, city: e.city, venue: e.venue, date: e.date, price: e.price, image: e.media?.url || ""
  }));
  res.json({ items: mapped, page, totalPages });
});

/** ========= Orders (mock util) ========= */
api.post("/orders", (req, res) => {
  try {
    const { eventId, qty=1, buyer } = req.body || {};
    if (!eventId) return res.status(400).json({ error:"eventId obrigatório" });
    const ev = findEvent(eventId);
    if (!ev) return res.status(404).json({ error:"Evento não encontrado" });
    const orderId = nanoid(10);
    res.json({ orderId, eventId, qty: Number(qty) || 1, buyer: buyer || {} });
  } catch (e) {
    log("orders.error", e.message);
    res.status(500).json({ error:"Falha ao criar ordem" });
  }
});

/** ========= Tickets -> PDF ========= */
async function streamTicketPDF(ticket, res) {
  const ev = findEvent(ticket.eventId);
  const name = ev?.title || ticket.eventId;

  const doc = new PDFDocument({ size:"A4", margin:48 });
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(20).text("IngressAI", { align:"right" }).moveDown(0.5);
  doc.fontSize(28).text(name).moveDown(0.2);
  doc.fontSize(12).fillColor("#666").text(`${ev?.city || ""} • ${ev?.venue || ""} • ${new Date(ev?.date || Date.now()).toLocaleString("pt-BR")}`);
  doc.moveDown(1);

  const qrPayload = `ingressai:ticket:${ticket.code}`;
  const dataUrl = await QRCode.toDataURL(qrPayload, { margin:0, scale:8 });
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  doc.image(png, { width: 220 }).moveDown(1);

  doc.fillColor("#000").fontSize(14).text(`Nome: ${ticket.buyerName}`);
  doc.text(`Código: ${ticket.code}`);
  doc.text(`Ticket #${ticket.id}`).moveDown(2);
  doc.fontSize(10).fillColor("#777").text("Apresente este QR no acesso. Validação online/antifraude via IngressAI.");
  doc.end();
}

api.get("/tickets/pdf", async (req, res) => {
  const id = Number(req.query.id);
  const t = getTicketById(id);
  if (!t) return res.status(404).send("Ticket não encontrado");
  await streamTicketPDF(t, res);
});

/** ========= Validação ========= */
api.post("/validator/check", (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ valid:false, reason:"no_code" });
  const t = getTicketByCode(String(code));
  if (!t) return res.json({ valid:false, reason:"not_found" });
  return res.json({ valid:true, ticketId:t.id, eventId:t.eventId, buyerName:t.buyerName });
});

/** ========= Compra (deep link da landing) ========= */
api.get("/purchase/start", async (req, res) => {
  try {
    const { ev, to, name="Participante", qty=1 } = req.query || {};
    const evObj = findEvent(ev);
    if (!evObj) return res.status(404).json({ error:"Evento não encontrado" });

    const q = Math.max(1, Number(qty) || 1);
    const issued = [];
    for (let i=0; i<q; i++) {
      issued.push(addTicket({ eventId: evObj.id, buyerName: String(name), buyerPhone: String(to||"") }));
    }
    const last = issued[issued.length-1];
    const pdfUrl = `${originFrom(req)}/api/tickets/pdf?id=${last.id}`;

    if (to) {
      await sendText(String(to), `🎟️ *${evObj.title}*\nTicket #${last.id} gerado para ${name}.\nBaixe o PDF: ${pdfUrl}`, true);
      await sendDocument(String(to), pdfUrl, `ticket-${last.id}.pdf`);
    }
    res.json({ ok:true, tickets: issued.map(t=>t.id), pdfUrl });
  } catch (e) {
    log("purchase.start.error", e?.response?.data || e.message);
    res.status(500).json({ error:"Falha ao iniciar compra" });
  }
});

export default api;
