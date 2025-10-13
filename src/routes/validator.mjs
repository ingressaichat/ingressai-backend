import { Router } from "express";
import { validateTicketCode, getTicketByCode } from "../lib/db.mjs";

const router = Router();

router.post("/check", (req,res)=>{
  const code = String(req.body?.code||"").trim();
  if(!code) return res.status(400).json({ ok:false, error:"missing_code" });
  const v = validateTicketCode(code);
  if(!v.valid) return res.json({ valid:false, reason:v.reason||"invalid" });
  return res.json({ valid:true, ticketId:v.ticketId, eventId:v.eventId, holder:v.holder, event:v.event });
});

router.get("/ticket/:code", (req,res)=>{
  const tk = getTicketByCode(req.params.code);
  if(!tk) return res.status(404).json({ ok:false, error:"not_found" });
  res.json({ code:tk.code, status:tk.status, holder:tk.holder, eventId:tk.eventId, usedAt: tk.usedAt||null });
});

export default router;
