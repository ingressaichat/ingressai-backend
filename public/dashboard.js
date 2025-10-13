/* eslint-disable no-console */
console.log("[IngressAI] dashboard.js boot");

const API_BASE = (typeof window !== "undefined" && window.INGRESSAI_API)
  ? window.INGRESSAI_API.replace(/\/$/, "")
  : "https://ingressai-backend-production.up.railway.app/api";

const BASE_ROOT = API_BASE.replace(/\/api$/, "");

// ---------- helpers ----------
async function fetchJson(url, opts) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", ...(opts?.headers||{}) },
    mode: "cors",
    credentials: opts?.credentials || "include",
    ...opts
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(()=>null) : await res.text();
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}
const $ = (s)=>document.querySelector(s);
function moneyBRL(n){ return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(+n||0); }
function formatDate(iso){ try{ return new Date(iso).toLocaleString("pt-BR",{dateStyle:"medium",timeStyle:"short"});}catch{return iso;} }

// ---------- UI refs ----------
const btnLogout = $("#btn-logout");
const sessionIndicator = $("#session-indicator");

// tabs
const tabEvents = $("#tab-events");
const tabValidator = $("#tab-validator");
const panelEvents = $("#panel-events");
const panelValidator = $("#panel-validator");

// events UI
const eventsList = $("#events-list");
const eventsEmpty = $("#events-empty");

// validator UI
const valCode = $("#val-code");
const valCheck = $("#val-check");
const valResult = $("#val-result");

// ---------- session check ----------
async function loadSession() {
  try {
    // tenta endpoint de sessão; se não existir, fazemos inferência pela resposta de /org/events
    const s = await fetchJson(`${API_BASE}/auth/session`, { credentials:"include" })
      .catch(()=> null);
    if (s && (s.phone || s.user || s.ok)) {
      sessionIndicator.textContent = s.phone ? `logado: +${s.phone}` : "logado";
    } else {
      sessionIndicator.textContent = "logado";
    }
  } catch {
    sessionIndicator.textContent = "sessão ativa";
  }
}

// ---------- events ----------
async function loadEvents() {
  eventsList.innerHTML = "";
  eventsEmpty.style.display = "none";

  let items = [];
  try {
    // rota principal para organizador
    const j = await fetchJson(`${API_BASE}/org/events`, { credentials:"include" });
    items = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
  } catch (e) {
    console.warn("[dashboard] /org/events falhou, tentando /events", e);
    try {
      const j2 = await fetchJson(`${API_BASE}/events`, { credentials:"include" });
      items = Array.isArray(j2?.items) ? j2.items : (Array.isArray(j2) ? j2 : []);
    } catch (e2) {
      console.error("[dashboard] /events também falhou", e2);
      items = [];
    }
  }

  if (!items.length) {
    eventsEmpty.style.display = "block";
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach(ev=>{
    const wrap = document.createElement("div");
    wrap.className = "event";
    wrap.innerHTML = `
      <div>
        <div style="font-weight:900">${ev.title||"-"}</div>
        <div class="muted">${ev.city||""} • ${formatDate(ev.date||ev.startsAt||ev.start)||""}</div>
        ${Number.isFinite(+ev.price) ? `<div class="muted">Preço médio: <strong>${moneyBRL(ev.price)}</strong></div>` : ""}
      </div>
      <div style="display:grid;gap:8px;justify-items:end">
        <a class="btn" href="${BASE_ROOT}/app/validator.html" style="display:none">Abrir validador</a>
        <span class="muted">#${ev.id}</span>
      </div>
    `;
    frag.appendChild(wrap);
  });
  eventsList.appendChild(frag);
}

// ---------- validator ----------
function stripTicket(raw){
  return String(raw||"").trim().replace(/^ingressai:ticket:/i,"");
}

async function runValidation() {
  const raw = String(valCode.value||"").trim();
  if (!raw) {
    valResult.innerHTML = `<span class="status-bad">Informe um código.</span>`;
    return;
  }
  const code = stripTicket(raw);
  try{
    valResult.textContent = "Checando…";
    const j = await fetchJson(`${API_BASE}/validator/check`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ code }),
      credentials: "include"
    });

    if (j.valid) {
      valResult.innerHTML = `<div class="status-ok">✅ Válido — Ticket #${j.ticketId} • Evento: ${j.eventId} • Nome: ${j.buyerName||"-"}</div>`;
    } else {
      valResult.innerHTML = `<div class="status-bad">❌ Inválido (${j.reason||"desconhecido"})</div>`;
    }
  } catch (e) {
    console.error(e);
    valResult.innerHTML = `<div class="status-bad">❌ Erro na validação (CORS/Network)</div>`;
  }
}

// ---------- tabs behaviour ----------
function selectTab(which){
  const isEvents = which === "events";
  tabEvents.setAttribute("aria-selected", String(isEvents));
  tabValidator.setAttribute("aria-selected", String(!isEvents));
  panelEvents.hidden = !isEvents;
  panelValidator.hidden = isEvents;
}

tabEvents?.addEventListener("click", ()=> selectTab("events"));
tabValidator?.addEventListener("click", ()=> selectTab("validator"));

// ---------- logout ----------
btnLogout?.addEventListener("click", async ()=>{
  try{
    await fetchJson(`${API_BASE}/auth/logout`, { method:"POST", credentials:"include" }).catch(()=>{});
  } finally {
    // volta para a landing (mesma origem do build estático)
    location.assign(`${BASE_ROOT}/index.html`);
  }
});

// ---------- validator handlers ----------
valCheck?.addEventListener("click", runValidation);
valCode?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); runValidation(); }});

// ---------- init ----------
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadSession();
  await loadEvents();
  selectTab("events");
  console.log("[IngressAI] dashboard ready", { API_BASE, BASE_ROOT });
});
