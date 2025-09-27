import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getTicketById, findEvent } from "../lib/db.mjs";

const tickets = Router();

// util p/ gerar buffer do QR
async function qrBuffer(text) {
  const dataURL = await QRCode.toDataURL(String(text), {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
  });
  const base64 = dataURL.split(",")[1] || "";
  return Buffer.from(base64, "base64");
}

// GET /api/tickets/:id.pdf — gera o PDF do ingresso
tickets.get("/:id.pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ticket = await getTicketById(id);
    if (!ticket) return res.status(404).send("ticket_not_found");

    const event = await findEvent(ticket.eventId);
    if (!event) return res.status(404).send("event_not_found");

    // monta o QR com o código do ingresso
    const qr = await qrBuffer(ticket.code);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Ingresso-${event.title}-${ticket.id}.pdf"`
    );

    const doc = new PDFDocument({ size: "A4", margin: 36 });
    doc.pipe(res);

    // Cabeçalho
    doc
      .fontSize(22)
      .text(event.title, { align: "left" })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .text(`Cidade: ${event.city}`)
      .text(`Local: ${event.venue}`)
      .text(`Data: ${new Date(event.date).toLocaleString("pt-BR")}`)
      .moveDown(1);

    // Box do ingresso
    doc
      .roundedRect(36, 150, 523, 260, 12)
      .stroke();

    // QR à direita
    doc.image(qr, 480, 180, { width: 70, height: 70 });

    // Dados do ticket
    doc
      .fontSize(16)
      .text("Ingresso", 48, 170)
      .moveDown(0.2);

    doc
      .fontSize(12)
      .text(`Nome: ${ticket.buyerName}`, { continued: false })
      .text(`Telefone: ${ticket.buyerPhone}`)
      .text(`Código: ${ticket.code}`)
      .moveDown(0.6);

    // Observações
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(
        "Apresente este ingresso (ou o código) na entrada. O QR Code é único e " +
          "poderá ser validado uma única vez no acesso ao evento.",
        { width: 500 }
      )
      .fillColor("black");

    // Rodapé/Marca
    doc
      .fontSize(9)
      .fillColor("#888")
      .text("Gerado por IngressAI", 36, 770, { align: "right", width: 523 })
      .fillColor("black");

    doc.end();
  } catch (err) {
    console.error("tickets.pdf.error", err);
    res.status(500).send("internal_error");
  }
});

// (opcional) GET /api/tickets/:id — JSON básico do ticket
tickets.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await getTicketById(id);
  if (!ticket) return res.status(404).json({ ok: false, error: "ticket_not_found" });
  const event = await findEvent(ticket.eventId);
  return res.json({ ok: true, ticket, event });
});

export default tickets;
