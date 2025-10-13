// src/routes/auth.mjs
import { Router } from "express";
import { sendOtp } from "../lib/wa.mjs";

const router = Router();

// armazenamento simples em memória (troque pelo seu store/redis se quiser)
const OTP_TTL_MS = 5 * 60 * 1000;
const otps = new Map(); // key: phone, value: { code, exp }

function onlyDigits(v = "") { return String(v).replace(/\D+/g, ""); }
function makeCode() { return String(Math.floor(100000 + Math.random()*900000)); }

router.post("/request", async (req, res) => {
  try {
    const raw = req.body?.phone || "";
    const phone = onlyDigits(raw);
    if (phone.length < 10) return res.status(400).json({ ok:false, error:"phone_invalid" });

    const code = makeCode();
    const exp = Date.now() + OTP_TTL_MS;
    otps.set(phone, { code, exp });

    // LOG local
    console.log("[AUTH] OTP para %s: %s", phone, code);

    // Enviar via WhatsApp
    await sendOtp(phone, code).catch(err => {
      console.error("sendOtp.error", err?.message || err);
    });

    return res.json({ ok:true });
  } catch (e) {
    console.error("auth.request.error", e?.stack || e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
});

router.post("/verify", (req, res) => {
  try {
    const phone = onlyDigits(req.body?.phone || "");
    const code  = String(req.body?.code || "").trim();
    const item = otps.get(phone);
    if (!item || item.exp < Date.now() || item.code !== code) {
      return res.status(401).json({ ok:false, error:"otp_invalid" });
    }
    otps.delete(phone); // one-time

    // cria cookie de sessão
    const sid = `ia_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    res.cookie("ia_session", sid, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return res.json({ ok:true });
  } catch (e) {
    console.error("auth.verify.error", e?.stack || e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
});

export default router;
