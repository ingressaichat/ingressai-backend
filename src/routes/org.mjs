import { Router } from "express";
import { createOrgApplication, listOrgApplications, approveOrgApplication, rejectOrgApplication, ensureOrganizer, eventsByOwner } from "../lib/db.mjs";
import { notifyAdmin, sendText } from "../lib/wa.mjs";

const router = Router();

router.post("/request", async (req,res)=>{
  try{
    const app = createOrgApplication(req.body||{});
    await notifyAdmin(`📥 Nova solicitação:\n• Tel: +${app.phone}\n• Evento: ${app.title}\n• Cidade: ${app.city}`);
    await sendText(app.phone, "Recebemos sua solicitação ✅. Assim que aprovarmos, você receberá o fluxo no WhatsApp para configurar/publicar.");
    res.json({ ok:true, application: app });
  }catch(e){
    res.status(400).json({ ok:false, error:e.message||"bad_request" });
  }
});

router.get("/applications", (req,res)=>{
  const items = listOrgApplications(req.query.status||"");
  res.json({ items });
});

router.post("/applications/:id/approve", async (req,res)=>{
  try{
    const { app, ev } = approveOrgApplication(req.params.id);
    await ensureOrganizer(app.phone);
    await sendText(app.phone, `✅ Aprovado! Vamos criar seu evento no WhatsApp.\nEvento: ${ev.title}\nID: ${ev.id}\n\nQuando estiver pronto para publicar, me peça: "Publicar ${ev.title}"`);
    res.json({ ok:true, event: ev });
  }catch(e){
    res.status(400).json({ ok:false, error:e.message||"bad_request" });
  }
});

router.post("/applications/:id/reject", async (req,res)=>{
  try{
    const app = rejectOrgApplication(req.params.id);
    await sendText(app.phone, "Sua solicitação foi analisada e não pôde ser aprovada no momento.");
    res.json({ ok:true });
  }catch(e){
    res.status(400).json({ ok:false, error:e.message||"bad_request" });
  }
});

router.get("/events", (req,res)=>{
  const phone = String(req.query.phone||"").trim();
  const items = phone ? eventsByOwner(phone) : [];
  res.json({ items });
});

export default router;
