import { Router } from "express";
import { createTickets } from "../lib/db.mjs";
import { sendText } from "../lib/wa.mjs";

const router = Router();

// GET /purchase/start?ev=<id>&to=<phone>&name=<nome>&qty=1
router.get("/start", async (req,res)=>{
  try{
    const eventId = String(req.query.ev||"");
    const to   = String(req.query.to||"");
    const name = String(req.query.name||"Participante");
    const qty  = Math.min(10, Math.max(1, parseInt(req.query.qty||"1",10)||1));

    const buyers = Array.from({length:qty}).map(()=>({ name, phone: to }));
    const tickets = createTickets(eventId, buyers);

    for (const tk of tickets){
      if (tk.phone) await sendText(tk.phone, `🎟️ Ingresso gerado: ${tk.code}\nApresente este QR Code no evento.`);
    }
    res.json({ ok:true, count: tickets.length });
  }catch(e){
    res.status(400).json({ ok:false, error: e.message||"bad_request" });
  }
});

export default router;
