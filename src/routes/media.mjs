cat > src/routes/media.mjs <<'EOF'
import { Router } from "express";
import axios from "axios";
import crypto from "crypto";
import { log } from "../utils.mjs";

const r = Router();

const TOKEN = process.env.WHATSAPP_TOKEN || process.env.ACCESS_TOKEN || process.env.WABA_TOKEN || "";
const SECRET = process.env.APP_SECRET || "";
const GV = process.env.GRAPH_VERSION || "v20.0";

function appsecretProof(token, secret) {
  if (!token || !secret) return null;
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

const meta = axios.create({
  baseURL: `https://graph.facebook.com/${GV}`,
  headers: { Authorization: `Bearer ${TOKEN}` },
  params: { appsecret_proof: appsecretProof(TOKEN, SECRET) }
});

r.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const metaRes = await meta.get(`/${id}`);
    const file = await axios.get(metaRes.data.url, { responseType: "stream" });
    res.setHeader("Content-Type", metaRes.data.mime_type || "application/octet-stream");
    file.data.pipe(res);
  } catch (e) {
    log("media.proxy.error", e?.response?.data || e.message);
    res.status(500).send("Falha ao resolver mídia");
  }
});

export default r;
EOF
