// src/routes/org.mjs
import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import {
  submitOrgApplication,
  listOrgApplications,
  setOrgApplicationStatusById,
  setOrgApplicationStatusByPhone,
  approveOrganizer,
  isOrganizer,
  getOrganizer,
} from "../lib/db.mjs";
import { sendText } from "../lib/wa.mjs";

const router = Router();

// Admins: números separados por vírgula (só dígitos)
const ADMIN_PHONES = String(process.env.ADMIN_WA || process.env.ADMIN_PHONES || "")
  .split(",")
  .map(s => s.replace(/\D+/g,""))
  .filter(Boolean);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // opcional pra proteger endpoints admin

const onlyDigits = (s="") => String(s).replace(/\D+/g,"");

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next(); // sem token, libera (dev)
  if (req.headers["x-admin-token"] === ADMIN_TOKEN) return next();
  return res.status(403).json({ ok:false, error:"forbidden" });
}

// POST /api/org/apply
router.post("/apply",
  body("phone").notEmpty().withMessage("phone obrigatório"),
  body("name").optional().isString(),
  body("pixKey").optional().isString(),
  body("plan").optional().isIn(["atl","prod"]),
  body("price").optional().isNumeric(),
  body("qty").optional().isInt({ min: 0 }),
  body("eventName").optional().isString(),
  body("city").optional().isString(),
  body("venue").optional().isString(),
  body("date").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok:false, errors: errors.array() });

    const phone = onlyDigits(req.body.phone);
    const {
      name = "",
      pixKey = "",
      plan = "atl",
      price = 0,
      qty = 0,
      eventName = "",
      city = "",
      venue = "",
      date = ""
    } = req.body;

    const feePercent = plan === "prod" ? 10 : 8;
    const fixedFee   = plan === "prod" ? 2  : 1.5;

    const app = submitOrgApplication({
      phone, name, pixKey, plan,
      feePercent, fixedFee,
      price: Number(price) || 0,
      qty: Number(qty) || 0,
      eventName, city, venue, date
    });

    // WhatsApp: solicitante
    try {
      await sendText(phone, [
        "✅ Solicitação recebida!",
        "",
        `Olá${name ? ` ${name}` : ""}! Recebemos seu pedido para criar eventos no IngressAI.`,
        `Plano: ${plan==="prod" ? "Produtoras & Locais (10% + R$ 2,00)" : "Atléticas & Repúblicas (8% + R$ 1,50)"}`,
        pixKey ? `Pix: ${pixKey}` : null,
        eventName ? `Pré-evento: ${eventName} (${city||"Cidade"} • ${venue||"Local"})` : null,
        "",
        "Aguarde a aprovação — avisaremos por aqui."
      ].filter(Boolean).join("\n"));
    } catch {}

    // WhatsApp: admins
    const adminMsg = [
      "📥 Nova solicitação de organizador",
      `#${app.id} • ${name||"Sem nome"} • +${phone}`,
      `Plano: ${plan} | Taxa: ${feePercent}% + R$ ${fixedFee.toFixed(2)}`,
      pixKey ? `Pix: ${pixKey}` : null,
      eventName ? `Pré-evento: ${eventName} • ${city||"-"} • ${venue||"-"}` : null,
      price ? `Preço: R$ ${Number(price).toFixed(2)} • Qtd: ${qty||0}` : null,
      "",
      `Aprovar: POST /api/org/approve { "phone":"${phone}" }`
    ].filter(Boolean).join("\n");

    await Promise.all(ADMIN_PHONES.map(a => sendText(a, adminMsg).catch(()=>null)));

    return res.json({ ok:true, applicationId: app.id, status: "pending" });
  }
);

// POST /api/org/approve
router.post("/approve",
  requireAdmin,
  body("phone").notEmpty(),
  body("applicationId").optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok:false, errors: errors.array() });

    const phone = onlyDigits(req.body.phone);
    const { name="", pixKey="", applicationId } = req.body;

    const org = approveOrganizer(phone, { name, pixKey });

    if (applicationId) {
      setOrgApplicationStatusById(applicationId, "approved");
    } else {
      setOrgApplicationStatusByPhone(phone, "approved");
    }

    try {
      await sendText(phone, [
        "🎉 Sua solicitação foi aprovada!",
        "Você já pode acessar o Dashboard do IngressAI.",
        "Entre com seu WhatsApp para receber o OTP."
      ].join("\n"));
    } catch {}

    return res.json({ ok:true, organizer: org });
  }
);

// GET /api/org/check?phone=55...
router.get("/check",
  query("phone").notEmpty(),
  async (req, res) => {
    const phone = onlyDigits(String(req.query.phone||""));
    return res.json({ ok:true, organizer: isOrganizer(phone), data: getOrganizer(phone) });
  }
);

// GET /api/org/applications (admin)
router.get("/applications", requireAdmin, (_req, res) => {
  return res.json({ ok:true, items: listOrgApplications() });
});

export default router;
