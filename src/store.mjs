// /src/store.mjs
// Camada fina para o webhook. Mantém compat com import "../store.mjs".
import { listEvents as listEventsFromDb } from "./lib/db.mjs";

export function listEvents() {
  return listEventsFromDb();
}

export default { listEvents };
