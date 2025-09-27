import { Router } from "express";
import axios from "axios";

const media = Router();

/** GET /api/media/proxy?url=https://... */
media.get("/proxy", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    if (!/^https?:\/\//i.test(url)) return res.sendStatus(400);

    const r = await axios.get(url, { responseType: "stream" });
    // repassa headers úteis (tipo, tamanho, etc.)
    if (r.headers) {
      Object.entries(r.headers).forEach(([k, v]) => {
        if (k && typeof v !== "undefined") res.set(k, String(v));
      });
    }
    r.data.pipe(res);
  } catch (err) {
    console.error("[media.proxy] error", err?.message || err);
    res.sendStatus(502);
  }
});

export default media;
