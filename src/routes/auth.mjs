import { Router } from "express";

const router = Router();

// store em memória (trocar por Redis/DB em prod)
const otpStore = new Map(); // key: phone, value: { code, exp }

function genCode() {
  // 4–6 dígitos
  return String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6);
}

router.post("/request", async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").replace(/\D+/g, "");
    if (!phone || phone.length < 12) {
      return res.status(400).json({ ok: false, error: "phone_invalid" });
    }
    const code = genCode();
    const exp = Date.now() + 5 * 60 * 1000; // 5 min
    otpStore.set(phone, { code, exp });

    // TODO: enviar via WhatsApp aqui (wa.sendMessage...)
    console.log(`[AUTH] OTP para ${phone}: ${code}`);

    return res.json({ ok: true });
  } catch (e) {
    console.error("auth.request.error", e);
    return res.status(500).json({ ok: false });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").replace(/\D+/g, "");
    const code = String(req.body?.code || "").replace(/\D+/g, "");
    const item = otpStore.get(phone);

    if (!item || Date.now() > item.exp || item.code !== code) {
      return res.status(401).json({ ok: false, error: "otp_invalid" });
    }

    // “validação” ok → emite um token simples (substitua por JWT real)
    const token = Buffer.from(`${phone}:${Date.now()}`).toString("base64");

    // seta cookie cross-site (landing -> backend)
    res.cookie("ia_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30d
    });

    // (opcional) limpa OTP após uso
    otpStore.delete(phone);

    return res.json({ ok: true });
  } catch (e) {
    console.error("auth.verify.error", e);
    return res.status(500).json({ ok: false });
  }
});

router.get("/session", (req, res) => {
  const has = Boolean(req.cookies?.ia_session);
  return res.json({ ok: has });
});

export default router;
