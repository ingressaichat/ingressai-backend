import { Router } from "express";
import { body, validationResult } from "express-validator";
import { organizerApprove } from "../lib/db.mjs";
import { onlyDigits } from "../utils.mjs";

const organizers = Router();

organizers.post(
  "/admin/organizers/approve",
  body("phone").isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const phone = onlyDigits(req.body.phone);
    await organizerApprove(phone);
    return res.json({ ok: true });
  }
);

export default organizers;
