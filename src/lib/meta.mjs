// src/lib/meta.mjs
import crypto from "crypto";
import { APP_SECRET } from "../config.mjs";

export function makeAppSecretProof(accessToken) {
  return crypto.createHmac("sha256", APP_SECRET).update(accessToken).digest("hex");
}
