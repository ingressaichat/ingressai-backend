import PDFDocument from "pdfkit";
import QR from "qrcode";
import { fmtDateBR } from "../utils.mjs";
import stream from "stream";

export async function buildTicketPDF({ ticket, event, brand = "IngressAI" }) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const bufs = [];
  doc.on("data", (d) => bufs.push(d));
  const end = new Promise((r) => doc.on("end", r));

  doc.fontSize(22).font("Helvetica-Bold").text(`${brand} — Ingresso`, { align: "right" });

  doc.moveDown(1);
  doc.fontSize(28).font("Helvetica-Bold").text(event.title);
  doc.fontSize(12).font("Helvetica").fillColor("#444").text(`${event.venue || "Local a confirmar"} — ${event.city || ""}`);
  doc.text(fmtDateBR(event.date));

  doc.moveDown(1.2);
  doc.fontSize(14).fillColor("#000").text(`Nome: ${ticket.buyerName || "Participante"}`);
  doc.text(`Quantidade: ${ticket.qty || 1}`);
  doc.text(`Ticket #${ticket.id}  •  Código: ${ticket.code}`);

  const qrDataUrl = await QR.toDataURL(ticket.qrcode || ticket.code || String(ticket.id));
  const base64 = qrDataUrl.split(",")[1];
  const img = Buffer.from(base64, "base64");
  doc.moveDown(1.2);
  doc.image(img, { width: 220 });

  doc.moveDown(1.2);
  doc.fontSize(10).fillColor("#444").text("Apresente este QR Code na entrada. Uso único.", { width: 480 });

  doc.end();
  await end;
  return Buffer.concat(bufs);
}

export function bufferToStream(buf) {
  const readable = new stream.Readable({ read() {} });
  readable.push(buf);
  readable.push(null);
  return readable;
}
