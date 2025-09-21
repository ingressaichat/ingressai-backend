import { Router } from "express";
import { body, validationResult } from "express-validator";
import { createOrder, issueTicket, findEvent } from "../lib/db.mjs";
import { sendText } from "../lib/wa.mjs";
import { onlyDigits } from "../utils.mjs";

const purchase = Router();

/** Start purchase (GET – deep link do site/bot) */
purchase.get("/start", async (req, res) => {
  const { ev, to, name, qty = "1" } = req.query;
  if (!ev || !to) return res.status(400).json({ ok: false, error: "missing_params" });
  const event = await findEvent(String(ev));
  if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

  const order = await createOrder({
    eventId: String(ev),
    qty: Number(qty) || 1,
    buyer: { name: String(name || "Participante"), phone: String(to) }
  });
  const t = await issueTicket(order.id);
  await sendText(onlyDigits(to), `🎟️ Ingresso emitido: ${t.code?.slice(0,8)}…`);

  return res.json({ ok: true, orderId: order.id, ticketId: t.id, code: t.code });
});

/** Start purchase (POST – se quiser usar via API) */
purchase.post("/start",
  body("eventId").isString().notEmpty(),
  body("to").isString().notEmpty(),
  body("name").optional().isString(),
  body("qty").optional().isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { eventId, to, name, qty = 1 } = req.body;
    const event = await findEvent(String(eventId));
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    const order = await createOrder({
      eventId: String(eventId),
      qty: Number(qty) || 1,
      buyer: { name: String(name || "Participante"), phone: String(to) }
    });
    const t = await issueTicket(order.id);
    await sendText(onlyDigits(to), `🎟️ Ingresso emitido: ${t.code?.slice(0,8)}…`);

    return res.json({ ok: true, orderId: order.id, ticketId: t.id, code: t.code });
  }
);

export default purchase;
