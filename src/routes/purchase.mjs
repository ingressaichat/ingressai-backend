import { Router } from "express";
import { body, validationResult } from "express-validator";
import { findEvent, addTicket } from "../lib/db.mjs";
import { sendText, sendDocument } from "../lib/wa.mjs";

const purchase = Router();

// helpers
const onlyDigits = (s = "") => String(s).replace(/\D+/g, "");
const baseUrl = (req) => {
  // funciona atrás de proxy (trust proxy já está habilitado no server.mjs)
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https");
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
};

/** =========================
 *  GET /api/purchase/start
 *  Deep link do site/bot
 *  Ex.: /api/purchase/start?ev=demo-1&to=5534912345678&name=Fulano&qty=1
 * ========================= */
purchase.get("/start", async (req, res) => {
  try {
    const { ev, to, name, qty = "1" } = req.query;
    if (!ev || !to) {
      return res.status(400).json({ ok: false, error: "missing_params" });
    }
    const event = await findEvent(String(ev));
    if (!event) {
      return res.status(404).json({ ok: false, error: "event_not_found" });
    }

    const amount = Math.max(1, parseInt(qty, 10) || 1);
    const buyerName = String(name || "Participante");
    const phone = onlyDigits(String(to));

    // emite N tickets (normalmente 1)
    const tickets = [];
    for (let i = 0; i < amount; i++) {
      const t = await addTicket({
        eventId: event.id,
        buyerName,
        buyerPhone: phone,
      });
      tickets.push(t);
    }

    // envia confirmação + PDF(s)
    // (para não lotar a conversa, envia 1 txt e 1 pdf – se amount>1, responde com lista)
    const first = tickets[0];
    const pdfUrl = `${baseUrl(req)}/api/tickets/${first.id}.pdf`;

    const summary =
      amount === 1
        ? `🎉 *${event.title}*\nCidade: ${event.city}\nLocal: ${event.venue}\n\n🎟️ Código: ${first.code}\n\nSeu ingresso em PDF foi enviado!`
        : `🎉 *${event.title}*\nForam emitidos ${amount} ingressos para ${buyerName}.\n` +
          `Primeiro código: ${first.code}\n\nEnviei o PDF do 1º ingresso; você pode baixar os demais no painel.`;

    await sendText(phone, summary);
    await sendDocument(phone, pdfUrl, `Ingresso-${event.title}-${first.id}.pdf`);

    return res.json({
      ok: true,
      eventId: event.id,
      qty: amount,
      firstTicket: { id: first.id, code: first.code },
      tickets: tickets.map((t) => ({ id: t.id, code: t.code })),
      pdf: pdfUrl,
    });
  } catch (err) {
    console.error("purchase.start.error", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/** =========================
 *  POST /api/purchase/start
 *  JSON API
 *  body: { eventId, to, name?, qty? }
 * ========================= */
purchase.post(
  "/start",
  body("eventId").isString().notEmpty(),
  body("to").isString().notEmpty(),
  body("name").optional().isString(),
  body("qty").optional().isInt({ min: 1 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ ok: false, errors: errors.array() });

      const { eventId, to, name, qty = 1 } = req.body;
      const event = await findEvent(String(eventId));
      if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

      const amount = Math.max(1, parseInt(qty, 10) || 1);
      const buyerName = String(name || "Participante");
      const phone = onlyDigits(String(to));

      const tickets = [];
      for (let i = 0; i < amount; i++) {
        const t = await addTicket({
          eventId: event.id,
          buyerName,
          buyerPhone: phone,
        });
        tickets.push(t);
      }

      const first = tickets[0];
      const pdfUrl = `${baseUrl(req)}/api/tickets/${first.id}.pdf`;

      const summary =
        amount === 1
          ? `🎉 *${event.title}*\nCidade: ${event.city}\nLocal: ${event.venue}\n\n🎟️ Código: ${first.code}\n\nSeu ingresso em PDF foi enviado!`
          : `🎉 *${event.title}*\nForam emitidos ${amount} ingressos para ${buyerName}.\n` +
            `Primeiro código: ${first.code}\n\nEnviei o PDF do 1º ingresso; você pode baixar os demais no painel.`;

      await sendText(phone, summary);
      await sendDocument(phone, pdfUrl, `Ingresso-${event.title}-${first.id}.pdf`);

      return res.json({
        ok: true,
        eventId: event.id,
        qty: amount,
        firstTicket: { id: first.id, code: first.code },
        tickets: tickets.map((t) => ({ id: t.id, code: t.code })),
        pdf: pdfUrl,
      });
    } catch (err) {
      console.error("purchase.start.error", err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  }
);

export default purchase;
