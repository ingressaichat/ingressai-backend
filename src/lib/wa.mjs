// src/lib/wa.mjs
import axios from "axios";
import { log } from "../utils.mjs";

/**
 * Envia payload para a WhatsApp Business API (Graph).
 */
async function waRequest(path, payload) {
  const GRAPH_VERSION = process.env.GRAPH_VERSION || process.env.GRAPH_API_VERSION || "v20.0";
  const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const WHATSAPP_TOKEN =
    process.env.WHATSAPP_TOKEN ||
    process.env.WABA_TOKEN ||
    process.env.META_TOKEN ||
    process.env.ACCESS_TOKEN ||
    "";

  if (!PHONE_NUMBER_ID) throw new Error("PHONE_NUMBER_ID ausente");
  if (!WHATSAPP_TOKEN) throw new Error("WHATSAPP_TOKEN ausente");

  const url = `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/${path}`.replace(/([^:])\/{2,}/g, "$1/");

  try {
    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    return data;
  } catch (e) {
    const detail = e?.response?.data || e.message;
    log("wa.request.error", { url, payload, detail });
    throw e;
  }
}

/**
 * Envia texto simples.
 */
export async function sendText(to, text, previewUrl = false) {
  return waRequest("messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text, preview_url: !!previewUrl },
  });
}

/**
 * Envia LIST message (menu de seções/rows).
 * sections: [{ title, rows: [{ id, title, description? }] }]
 */
export async function sendList(to, { header, body, button, sections }) {
  return waRequest("messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: header ? { type: "text", text: header } : undefined,
      body: { text: body || "Escolha uma opção:" },
      action: { button: button || "Selecionar", sections: sections || [] },
    },
  });
}

/**
 * Envia botões rápidos (até 3).
 * buttons: [{ id, title }]
 */
export async function sendButtons(to, body, buttons) {
  const btns = (buttons || []).slice(0, 3).map((b) => ({
    type: "reply",
    reply: { id: String(b.id), title: String(b.title).slice(0, 20) },
  }));

  return waRequest("messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body || "Escolha:" },
      action: { buttons: btns },
    },
  });
}

/**
 * Envia template (útil para OTP).
 */
export async function sendTemplate(to, name, langCode = "pt_BR", components) {
  return waRequest("messages", {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: langCode },
      components: components || [],
    },
  });
}

export default { sendText, sendList, sendButtons, sendTemplate };
