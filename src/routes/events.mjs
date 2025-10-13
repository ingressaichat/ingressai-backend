import { Router } from "express";
import { listEvents, listCities, publishEvent, findEvent, createTickets } from "../lib/db.mjs";
import { sendText } from "../lib/wa.mjs";

const router = Router();

router.get("/", (_req,res)=> res.json({ items: listEvents({ publishedOnly:true }) }) );
router.get("/cities", (_req,res)=> res.json(listCities()) );

router.post("/:id/publish", (req,res)=>{
  try { const ev = publishEvent(req.params.id); res.json({ ok:true, event:ev }); }
  catch(e){ res.status(404).json({ ok:false, error:e.message||"not_found" }); }
});

// util: gerar tickets de teste
router.post("/:id/tickets", async (req,res)=>{
  try{
    const buyers = Array.isArray(req.body?.buyers) ? req.body.buyers : [];
    const out = createTickets(req.params.id, buyers);
    for(const tk of out){ if(tk.phone) await sendText(tk.phone, `🎟️ Seu ingresso: ${tk.code}`); }
    res.json({ ok:true, items: out });
  }catch(e){
    res.status(400).json({ ok:false, error:e.message||"bad_request" });
  }
});

router.get("/:id", (req,res)=>{
  const ev = findEvent(req.params.id);
  if(!ev) return res.status(404).json({ ok:false, error:"not_found" });
  res.json(ev);
});

export default router;
