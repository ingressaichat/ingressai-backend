import { Router } from "express";

const router = Router();

// stub de upload (recebe {url} ou {base64})
router.post("/upload", (req, res) => {
  const { url, base64, filename="file.bin" } = req.body || {};
  if (!url && !base64) return res.status(400).json({ error: "send url or base64" });
  // Em prod você faria upload para S3/GCS e retornaria a URL pública
  const publicUrl = url || `data:application/octet-stream;base64,${base64}`;
  return res.json({ ok: true, url: publicUrl, filename });
});

export default router;
