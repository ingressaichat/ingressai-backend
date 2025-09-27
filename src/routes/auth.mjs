import { Router } from "express";
import crypto from "node:crypto";
import { sendOtp } from "../lib/wa.mjs";

const router = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const otps = new Map(); // phone -> { hash, exp, attempts }

function onlyDigits(v = "") { return String(v).replace(/\D+/g, ""); }
function makeCode() { return String(crypto.randomInt(100000, 1000000)); }
function hashOtp(code) { return crypto.createHash("sha256").update(code).digest("hex"); }

// gera/renova token CSRF (double-submit)
router.get("/csrf", (req, res) => {
  const token = crypto.randomBytes(16).toString("base64url");
  res.cookie("ia_csrf", token, {
    httpOnly: false,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 3600e3,
  });
  res.json({ ok:true, token });
});
function checkCsrf(req, res, next) {
  const hdr = req.get("X-CSRF-Token");
  const cki = req.cookies?.ia_csrf;
  if (!hdr || !cki || hdr !== cki) return res.status(403).json({ ok:false, error:"csrf" });
  next();
}

router.post("/request", checkCsrf, async (req, res) => {
  try {
    const raw = req.body?.phone || "";
    const phone = onlyDigits(raw);
    if (phone.length < 10) return res.status(400).json({ ok:false, error:"phone_invalid" });

    const code = makeCode();
    const exp = Date.now() + OTP_TTL_MS;
    otps.set(phone, { hash: hashOtp(code), exp, attempts: 0 });

    console.log("[AUTH] OTP gerado para %s", phone);
    await sendOtp(phone, code).catch(err => console.error("sendOtp.error", err?.message || err));
    return res.json({ ok:true });
  } catch (e) {
    console.error("auth.request.error", e?.stack || e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
});

router.post("/verify", checkCsrf, (req, res) => {
  try {
    const phone = onlyDigits(req.body?.phone || "");
    const code  = String(req.body?.code || "").trim();
    const item = otps.get(phone);
    if (!item) return res.status(401).json({ ok:false, error:"otp_invalid" });
    if (item.exp < Date.now()) { otps.delete(phone); return res.status(401).json({ ok:false, error:"otp_expired" }); }
    if (item.attempts >= 5) { otps.delete(phone); return res.status(429).json({ ok:false, error:"otp_locked" }); }
    if (item.hash !== hashOtp(code)) { item.attempts++; return res.status(401).json({ ok:false, error:"otp_invalid" }); }
    otps.delete(phone);

    const sid = crypto.randomBytes(32).toString("base64url");
    // salva sessão num storage atrelado ao server (ex.: req.app.locals.sessions)
    const store = req.app.locals.sessions;
    const now = Date.now();
    store.set(sid, { phone, isOrganizer: true, exp: now + 7*24*3600e3 }); // ajuste isOrganizer conforme sua regra

    res.cookie("ia_session", sid, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
      maxAge: 7*24*3600e3,
    });

    return res.json({ ok:true, isOrganizer: true });
  } catch (e) {
    console.error("auth.verify.error", e?.stack || e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
});

export default router;
