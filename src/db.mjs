// src/db.mjs
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const DATA_FILE = path.join(DATA_DIR, "data.json");

// estrutura base do arquivo
const DEFAULT_STORE = {
  events: [],           // [{ id, title, city, date, venue, statusLabel, imageUrl }]
  orders: [],           // [{ id, evId, to, name, qty, pdfUrl, createdAt }]
  contacts: {},         // { waId: { profileName, lastSeenAt } }
};

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readJSON() {
  ensureDataDir();
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STORE, null, 2));
      return { ...DEFAULT_STORE };
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return { ...DEFAULT_STORE, ...parsed };
  } catch {
    // fallback seguro
    return { ...DEFAULT_STORE };
  }
}

function writeJSON(store) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// ================== API SIMPLES ==================
export function getStore() {
  return readJSON();
}
export function setStore(next) {
  writeJSON(next);
  return next;
}

// ======= EVENTS =======
export function getEvents() {
  return getStore().events || [];
}
export function saveEvents(list) {
  const store = getStore();
  store.events = Array.isArray(list) ? list : [];
  setStore(store);
  return store.events;
}
export function upsertEvent(ev) {
  const store = getStore();
  const list = store.events || [];
  const idx = list.findIndex(e => String(e.id) === String(ev.id));
  if (idx >= 0) list[idx] = { ...list[idx], ...ev };
  else list.push(ev);
  store.events = list;
  setStore(store);
  return ev;
}
export function deleteEventById(id) {
  const store = getStore();
  store.events = (store.events || []).filter(e => String(e.id) !== String(id));
  setStore(store);
}

// ======= ORDERS =======
export function addOrder(order) {
  const store = getStore();
  store.orders = store.orders || [];
  store.orders.push(order);
  setStore(store);
  return order;
}
export function findOrderById(id) {
  const store = getStore();
  return (store.orders || []).find(o => String(o.id) === String(id)) || null;
}
export function listOrdersByPhone(waId) {
  const store = getStore();
  return (store.orders || []).filter(o => String(o.to) === String(waId));
}
export function updateOrder(id, patch) {
  const store = getStore();
  const list = store.orders || [];
  const idx = list.findIndex(o => String(o.id) === String(id));
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  store.orders = list;
  setStore(store);
  return list[idx];
}

// ======= CONTACTS =======
export function touchContact(waId, { profileName } = {}) {
  const store = getStore();
  store.contacts = store.contacts || {};
  const prev = store.contacts[waId] || {};
  store.contacts[waId] = {
    ...prev,
    profileName: profileName ?? prev.profileName ?? "",
    lastSeenAt: new Date().toISOString(),
  };
  setStore(store);
  return store.contacts[waId];
}

export default {
  getStore, setStore,
  getEvents, saveEvents, upsertEvent, deleteEventById,
  addOrder, findOrderById, listOrdersByPhone, updateOrder,
  touchContact,
};
