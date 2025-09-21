import { Router } from "express";
import { body, validationResult } from "express-validator";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { issueTicket } from "../lib/db.mjs";
import pg from "pg";
import { DATABASE_URL } from "../config.mjs";

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const tickets = Router();

/** Helper: carrega ticket + join com order + event */
async function getTicketFull(idOrCode) {
  const byId = /^[0-9a-f-]{36}$/i.test(String(idOrCode));
  const rows = await pool.query(`
    select t.*, o.event_id, o.buyer_name, o.buyer_phone, e.title as event_title, e.city, e.venue, e.date
    from tickets t
      join orders o on o.id = t.order_id
      join events e on e.id = o.event_id
    where ${byId ? "t.id = $1" : "t.code = $1"}
    limit 1
  `, [String(idOrCode)]);
  return rows.rows[0] || null;
}

/** JSON básico */
tickets.get("/:id", async (req, res) => {
  const t = await getTicketFull(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, ticket: t });
});

/** Emite (utilitário) — se precisar reemitir */
tickets.post("/issue",
  body("orderId").isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const t = await issueTicket(req.body.orderId);
    return res.json({ ok: true, ticketId: t.id, code: t.code });
  }
);

/** Validação (bipagem) — GET /tickets/validate?code=XXXX */
tickets.get("/validate", async (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "missing_code" });
  const t = await getTicketFull(code);
  if (!t) return res.status(404).json({ ok: false, error: "not_found" });

  // regras: used => vermelho, issued => verde, revoked => vermelho, pending => amarelo
  let status = t.status || "issued";
  let ui = { color: "green", label: "Válido" };

  if (status === "issued") {
    // marca como scanneado na primeira leitura
    await pool.query(`update tickets set status='used', scanned_at=now() where id=$1 and status='issued'`, [t.id]);
    status = "used";
    ui = { color: "green", label: "OK • 1ª leitura" };
  } else if (status === "used") {
    ui = { color: "red", label: "Já utilizado" };
  } else if (status === "revoked" || status === "blocked") {
    ui = { color: "red", label: "Rejeitado" };
  } else {
    ui = { color: "yellow", label: "Pendente" };
  }

  return res.json({
    ok: true,
    status,
    ui,
    holder: t.holder_name,
    event: { id: t.event_id, title: t.event_title, date: t.date, venue: t.venue, city: t.city },
    code: t.code
  });
});

/** PDF com QR — GET /tickets/:id/pdf */
tickets.get("/:id/pdf", async (req, res) => {
  const t = await getTicketFull(req.params.id);
  if (!t) return res.status(404).send("Ticket não encontrado");

  const qrText = `INGRESSAI:${t.code}`;
  const dataUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 512 });
  const pngBuffer = Buffer.from(dataUrl.split(",")[1], "base64");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ticket-${t.id}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  doc.pipe(res);

  doc.fontSize(22).font("Helvetica-Bold").text("IngressAI — Ingresso", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(12).font("Helvetica").text(`Evento: ${t.event_title}`);
  doc.text(`Quando: ${new Date(t.date).toLocaleString("pt-BR")}`);
  doc.text(`Local: ${t.venue} — ${t.city}`);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").text(`Nome: ${t.holder_name}`);
  doc.font("Helvetica").text(`Código: ${t.code}`);
  doc.rect(48, 220, 200, 200).strokeColor("#e5ecff").stroke();

  doc.image(pngBuffer, 54, 226, { width: 188, height: 188 });

  doc.moveDown(8);
  doc.fontSize(10).fillColor("#555").text("Apresente este QR Code na entrada. Uso único. Documento válido somente com identificação do portador.", { width: 480 });

  doc.end();
});

export default tickets;
