// Banco em memória (PoC). Interface estável para futura troca por Postgres.
import { uid, onlyDigits } from "../utils.mjs";

function nowIso(){ return new Date().toISOString(); }

export const store = {
  events: new Map(),           // id -> {id,title,city,venue,date,price,status,ownerPhone,createdAt,...}
  organizers: new Map(),       // phone -> { phone, name?, createdAt }
  orgApplications: new Map(),  // id -> { id, phone, title, city, venue, date, status }
  tickets: new Map(),          // code -> { code, eventId, holder, phone, status, createdAt, usedAt? }
  sessions: new Map(),         // sid -> { sid, phone, createdAt, expAt }
  userSessions: new Map(),     // phone -> { state, ctx }
  validatorSessions: new Map(),
  cities: new Set()
};

// seeds
(function seed(){
  const sample = [
    { id:"101", title:"Tech Fest 2025", city:"São Paulo", date:new Date(Date.now()+7*864e5).toISOString(), venue:"Expo Center SP", price:199.9, status:"published" },
    { id:"102", title:"Rock Night",     city:"Belo Horizonte", date:new Date(Date.now()+14*864e5).toISOString(), venue:"Arena BH", price:149.9, status:"published" },
    { id:"103", title:"Conf. Dados & IA", city:"Curitiba", date:new Date(Date.now()+21*864e5).toISOString(), venue:"Expo Curitiba", price:349.9, status:"published" }
  ];
  for(const ev of sample){ store.events.set(ev.id, { ...ev, createdAt:nowIso() }); store.cities.add(ev.city); }
})();

// organizers
export function ensureOrganizer(phone){
  const p = onlyDigits(phone);
  if(!p) return null;
  if(!store.organizers.has(p)) store.organizers.set(p, { phone:p, createdAt: nowIso() });
  return store.organizers.get(p);
}

// applications
export function createOrgApplication(payload){
  const id = uid("app");
  const app = {
    id,
    phone: onlyDigits(payload.phone||""),
    title: (payload.title||"").trim(),
    city: (payload.city||"").trim(),
    venue: (payload.venue||"").trim(),
    date: payload.date || null,
    status: "pending",
    createdAt: nowIso()
  };
  if (!app.phone || !app.title || !app.city) throw new Error("missing_fields");
  store.orgApplications.set(id, app);
  return app;
}
export function listOrgApplications(status){
  const arr = Array.from(store.orgApplications.values());
  return status ? arr.filter(a=>a.status===status) : arr;
}
export function approveOrgApplication(id){
  const app = store.orgApplications.get(id);
  if(!app) throw new Error("not_found");
  app.status="approved"; app.decidedAt = nowIso();
  const evId = uid("ev");
  const ev = { id:evId, title:app.title, city:app.city, venue:app.venue||"", date:app.date, price:0, ownerPhone:app.phone, status:"draft", createdAt:nowIso() };
  store.events.set(evId, ev);
  if(ev.city) store.cities.add(ev.city);
  return { app, ev };
}
export function rejectOrgApplication(id){
  const app = store.orgApplications.get(id);
  if(!app) throw new Error("not_found");
  app.status="rejected"; app.decidedAt = nowIso();
  return app;
}

// events
export function listEvents({publishedOnly=true}={}){
  const arr = Array.from(store.events.values());
  return publishedOnly ? arr.filter(e=>e.status==="published") : arr;
}
export function findEvent(id){ return store.events.get(String(id)); }
export function publishEvent(id){
  const ev = store.events.get(String(id));
  if(!ev) throw new Error("not_found");
  ev.status="published"; ev.publishedAt = nowIso();
  if(ev.city) store.cities.add(ev.city);
  return ev;
}
export function eventsByOwner(phone){
  const p = onlyDigits(phone);
  return Array.from(store.events.values()).filter(e=>onlyDigits(e.ownerPhone||"")===p);
}

// tickets
export function createTickets(eventId, buyers){
  const ev = findEvent(eventId);
  if(!ev) throw new Error("event_not_found");
  const out = [];
  for(const b of buyers){
    const code = "ingressai:ticket:"+uid("t");
    const tk = { code, eventId, holder:b.name||"Participante", phone:onlyDigits(b.phone||""), status:"valid", createdAt:nowIso() };
    store.tickets.set(code, tk);
    out.push(tk);
  }
  return out;
}
export function getTicketByCode(code){
  const key = String(code).startsWith("ingressai:ticket:") ? String(code) : `ingressai:ticket:${code}`;
  return store.tickets.get(key) || null;
}
export function validateTicketCode(code){
  const tk = getTicketByCode(code);
  if(!tk) return { valid:false, reason:"not_found" };
  if(tk.status==="void") return { valid:false, reason:"void" };
  if(tk.status==="used") return { valid:false, reason:"already_used" };
  tk.status="used"; tk.usedAt = nowIso();
  const ev = store.events.get(tk.eventId);
  return { valid:true, ticketId:tk.code, eventId:ev?.id, event:ev?.title, holder:tk.holder };
}
export function listCities(){ return Array.from(store.cities.values()).sort(); }

// chatbot sessions
export function getUserSession(phone){
  const p = onlyDigits(phone); if(!p) return null;
  if(!store.userSessions.has(p)) store.userSessions.set(p, { phone:p, state:"home", ctx:{} });
  return store.userSessions.get(p);
}
export function setUserState(phone, state, patchCtx={}){
  const s = getUserSession(phone); if(!s) return null;
  s.state = state; s.ctx = { ...(s.ctx||{}), ...patchCtx };
  return s;
}
