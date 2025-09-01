import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { Router } from "express";
import { DB } from "./db.mjs";
import { log } from "./utils.mjs";

const ticketsRouter = Router();
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || "").replace(/\/$/, "");

try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

const filePath = (code) => path.join(UPLOADS_DIR, `ticket-${code}.pdf`);
const fileUrl   = (code) => `${MEDIA_BASE_URL}/ticket-${code}.pdf`;

async function generateTicketPDF({ code, event, name }) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 54 });
    const out = fs.createWriteStream(filePath(code));
    doc.pipe(out);

    // Título
    doc.fontSize(22).text(event.title, { align: "center" }).moveDown(0.6);
    doc.fontSize(12).fillColor("#525866")
      .text(`${event.city} • ${new Date(event.date).toLocaleString("pt-BR")}`, { align: "center" })
      .moveDown(1.2);

    // QR
    const qrData = `https://ingressai.chat/t/${code}`;
    QRCode.toDataURL(qrData, { margin: 1 })
      .then(dataUrl => {
        const png = Buffer.from(dataUrl.split(",")[1], "base64");
        doc.image(png, doc.page.width/2 - 100, doc.y, { width: 200 });
        doc.moveDown(1.6);
        doc.fontSize(16).fillColor("#111827").text(name, { align: "center" });
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor("#6B7280").text(code, { align: "center" });

        doc.end();
      })
      .catch(reject);

    out.on("finish", resolve);
    out.on("error", reject);
  });
  return filePath(code);
}

// REST: (re)emitir por orderId
ticketsRouter.post("/tickets/issue", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const order = DB.PURCHASES.get(orderId);
    if (!order) return res.status(404).json({ error: "purchase not found" });
    const ev = DB.EVENTS.get(order.eventId);
    if (!ev) return res.status(404).json({ error: "event not found" });

    if (!fs.existsSync(filePath(order.code))) {
      await generateTicketPDF({ code: order.code, event: ev, name: order.name });
      log("ticket.issue.generated", { code: order.code });
    }
    const url = fileUrl(order.code);
    log("ticket.issue.ok", { orderId, url });
    return res.json({ ok: true, url });
  } catch (e) {
    log("ticket.issue.fail", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

export default ticketsRouter;
