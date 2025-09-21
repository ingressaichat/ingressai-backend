import { Router } from "express";
import axios from "axios";

const router = Router();

/* proxy simples de mídia pública (opcional) */
router.get("/proxy", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    if (!/^https?:\/\//i.test(url)) return res.sendStatus(400);
    const r = await axios.get(url, { responseType: "stream" });
    res.set(r.headers);
    r.data.pipe(res);
  } catch {
    res.sendStatus(502);
  }
});

export default router;
