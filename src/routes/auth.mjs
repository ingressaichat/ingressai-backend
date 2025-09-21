// src/routes/auth.mjs
import { Router } from "express";
import { requestOTPInternal, verifyOTPInternal, setSessionCookie } from "../lib/auth.mjs";
import { sendText } from "../lib/wa.mjs";

const router = Router();

/** POST /api/auth/request { phone } */
router.post("/auth/request", async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ ok:false, error:"phone_required" });
    await requestOTPInternal(sendText, String(phone));
    res.json({ ok: true });
  } catch (err) {
    console.error("auth.request", err?.message || err);
    res.status(500).json({ ok:false, error:"server_error" });
  }
});

/** POST /api/auth/verify { phone, code } */
router.post("/auth/verify", async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ ok:false, error:"missing_params" });
    const r = verifyOTPInternal(String(phone), String(code));
    if (!r.ok) return res.status(401).json({ ok:false, error: r.reason || "invalid_code" });
    setSessionCookie(res, { phone: String(phone), isOrganizer: !!r.isOrganizer, isAdmin: !!r.isAdmin });
    res.json({ ok: true, isOrganizer: !!r.isOrganizer });
  } catch (err) {
    console.error("auth.verify", err?.message || err);
    res.status(500).json({ ok:false, error:"server_error" });
  }
});

/** GET /api/auth/session */
router.get("/auth/session", (req, res) => {
  try {
    // a leitura da sessão é feita via /app/login no server; aqui mantemos simples
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok:false, error:"server_error" });
  }
});

/** POST /api/auth/logout */
router.post("/auth/logout", (_req, res) => {
  try {
    res.clearCookie("ia_session", { path:"/" });
    res.json({ ok:true });
  } catch (err) {
    console.error("auth.logout", err?.message || err);
    res.status(500).json({ ok:false, error:"server_error" });
  }
});

export default router;
