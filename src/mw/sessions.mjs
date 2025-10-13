// src/mw/sessions.mjs
export function requireSession(req, res, next) {
  const sid = req.cookies?.ia_session;
  if (!sid) return res.status(401).json({ ok: false, error: "no_session" });
  // se você persistir em DB/Redis, faça o lookup e injete dados aqui
  req.session = { sid };
  next();
}
