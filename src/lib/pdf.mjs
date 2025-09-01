import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export async function buildTicketPDFStream({ brand, event, ticket, validateUrl }) {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  doc.info.Title = `${brand?.name || "Ingresso"} - ${event?.title || "Evento"}`;

  // Cabeçalho
  doc.fontSize(18).font("Helvetica-Bold").text(brand?.name || "IngressAI");
  doc.moveDown(0.6);

  // Evento
  doc.fontSize(16).text(event?.title || "Evento");
  doc.moveDown(0.2);
  const when = event?.date ? new Date(event.date).toLocaleString("pt-BR") : "A confirmar";
  doc.fontSize(12).font("Helvetica").text(`${event?.city || ""} — ${when}`);
  doc.text(`Local: ${event?.venue || "A confirmar"}`);
  doc.moveDown(1);

  // Comprador
  doc.font("Helvetica-Bold").text("Ingresso:", { continued: true }).font("Helvetica").text(`  #${ticket.code}`);
  doc.text(`Nome: ${ticket.name}`);
  doc.text(`Quantidade: ${ticket.qty || 1}`);
  doc.moveDown(1);

  // QR
  const qrData = validateUrl;
  const qrPng = await QRCode.toBuffer(qrData, { type: "png", errorCorrectionLevel: "H", margin: 1, width: 360 });
  const x = doc.page.width - 36 - 180;
  const y = doc.y;
  doc.image(qrPng, x, y, { width: 180, height: 180 });
  doc.rect(36, y, doc.page.width - 72 - 200, 180).strokeColor("#ddd").stroke();

  doc.moveDown(10);
  doc.fontSize(10).fillColor("#666").text(`Validação: ${qrData}`);
  doc.moveDown(0.4).text("Apresente este QR Code na entrada. Evite compartilhar seu ingresso.");

  doc.end();
  return doc;
}
