import { Router } from "express";
import health from "./health.mjs";
import events from "./events.mjs";
import org from "./org.mjs";
import tickets from "./tickets.mjs";
import validator from "./validator.mjs";
import webhook from "./webhook.mjs";

const router = Router();

router.use("/health", health);
router.use("/events", events);
router.use("/organizers", org);
router.use("/tickets", tickets);
router.use("/validator", validator);
router.use("/webhook", webhook);

// compat antigo
router.get("/cities", (_req,res) => res.redirect(307, "/api/events/cities"));

export default router;
