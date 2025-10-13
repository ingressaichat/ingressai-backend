/* eslint-disable no-console */
console.log("[IngressAI] app.js boot");

/* ================== config de API ================== */
function normalizeApi(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // remove barras finais
  s = s.replace(/\/+$/g, "");
  if (!/\/api$/i.test(s)) s += "/api";
  // normaliza // duplas (exceto em https://)
  s = s.replace(/([^:])\/{2,}/g, "$1/");
  return s;
}

(function bootstrapApi() {
  const qsApi = new URLSearchParams(location.search).get("api") || "";
  const metaApi = document.querySelector('meta[name="ingressai-api"]')?.getAttribute("content") || "";
  const winApi = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
  const pref = qsApi || metaApi || winApi || "https://ingressai-backend-production.up.railway.app/api";
  window.INGRESSAI_API = normalizeApi(pref);
})();

const API_PARAM = new URLSearchParams(location.search).get("api");
const ENV_API   = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
const BASE_WITH_API = String(API_PARAM || ENV_API || "https://ingressai-backend-production.up.railway.app/api").replace(/\/$/, "");
const BASE_ROOT     = BASE_WITH_API.replace(/\/api$/, "");
const WHATSAPP_NUMBER = "5534999992747";

/* ================== helpers ================== */
async function tryFetch(paths, opts) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(p, { mode: "cors", ...opts });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} @ ${p}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Falha na requisição");
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", ...(opts?.headers || {}) },
    mode: "cors",
    credentials: opts?.credentials || "omit", // "include" só p/ auth/validator
    ...opts
  });
  const ct = res.headers.get("content-type") || "";
  const j = ct.includes("application/json") ? await res.json().catch(()=>null) : await res.text();
  if (!res.ok) {
    const msg = (j && j.error) || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return j;
}

const BRL = new Intl.NumberFormat("pt-BR",{ style:"currency", currency:"BRL" });
const money = v => BRL.format(isFinite(v)?v:0);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
function safePreventAnchor(e){
  const a = e.target.closest("a[href='#']");
  if (a) { e.preventDefault(); e.stopPropagation(); }
}

function formatDate(iso){
  try { const d = new Date(iso); return d.toLocaleString("pt-BR",{ dateStyle:"medium", timeStyle:"short" }); }
  catch { return iso }
}
function normalizeStatusLabel(s){ if(!s) return ""; return s.replace("Últimos ingressos","Último lote"); }
function waHref(text){return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`}

/* ================== estado/UI ================== */
let eventos = [];
let evIndex = {};
let backendOnline = false;

const lista         = $("#lista-eventos");
const inputBusca    = $("#busca-eventos");
const chipsRow      = $("#filtro-cidades");
const sheet         = $("#sheet");
const sheetBody     = $("#sheet-body");
const sheetBackdrop = $("#sheet-backdrop");
const authTag       = $("#auth-indicator");

// diag
const dApi    = $("#d-api");
const dHealth = $("#d-health");
const dEv     = $("#d-ev");
const errOverlay = $("#err-overlay");
const errPre     = $("#err-pre");

/* ================== header/hero ================== */
function initHeader(){
  // micro animação nos botões
  document.addEventListener("click",e=>{
    safePreventAnchor(e);
    const el=e.target.closest(".btn,.view,.link-like");
    if(!el) return;
    el.style.transform="translateY(0) scale(.98)";
    setTimeout(()=>{ el.style.transform=""; }, 120);
  });
  const hero=$(".hero"); const header=$("header");
  const HIDE_START=16,HIDE_END=240; let ticking=false;
  function onScroll(){
    if(ticking) return;
    ticking=true;
    requestAnimationFrame(()=>{
      const y=window.scrollY||document.documentElement.scrollTop||0;
      header&&header.classList.toggle("is-scrolled", y>8);
      const p=Math.min(1,Math.max(0,(y-HIDE_START)/(HIDE_END-HIDE_START)));
      if(hero){ hero.style.setProperty("--hero-p", p.toFixed(3)); hero.classList.toggle("is-hidden", p>=1); }
      ticking=false;
    });
  }
  onScroll(); window.addEventListener("scroll", onScroll, { passive:true });
}

/* ================== vitrine ================== */
function buildChips(){
  if (!chipsRow) return;
  chipsRow.innerHTML="";
  const cities = Array.from(new Set(eventos.map(e=>e.city).filter(Boolean)));
  const all = document.createElement("button");
  all.className="chip"; all.type="button"; all.textContent="Todas"; all.setAttribute("role","tab"); all.setAttribute("aria-selected","true");
  chipsRow.appendChild(all);
  cities.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip"; b.type="button"; b.textContent=c; b.dataset.city=c; b.setAttribute("role","tab"); b.setAttribute("aria-selected","false");
    chipsRow.appendChild(b);
  });
}

function renderCards(filterCity="", q=""){
  if (!lista) return;
  lista.innerHTML="";
  const qn=(q||"").toLowerCase();
  const data = eventos.filter(ev=>{
    const byCity = filterCity ? ev.city===filterCity : true;
    const byQ = qn ? (ev.title||"").toLowerCase().includes(qn) || (ev.description||"").toLowerCase().includes(qn) : true;
    return byCity && byQ;
  });

  if (!data.length){
    const empty=document.createElement("div");
    empty.className="std-card";
    empty.innerHTML='<strong>Sem eventos publicados ainda.</strong><br><span class="subtle">Volte em breve — estamos preparando novidades ✨</span>';
    lista.appendChild(empty);
    dEv && (dEv.textContent = "0");
    return;
  }

  data.forEach(ev=>{
    const statusLabel = normalizeStatusLabel(ev.statusLabel||ev.status||"");
    const statusKey   = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote" ? "low" : "soon");
    const card=document.createElement("article");
    card.className="card";
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-labelledby", `card-title-${ev.id}`);
    card.innerHTML=`
      <div class="card-header">
        <div>
          <div class="card-title" id="card-title-${ev.id}">${ev.title}</div>
          <div class="card-city">${ev.city||""}</div>
          <div class="status-line status--${statusKey}"><span class="status-dot"></span> <span class="status-label">${statusLabel||"Em breve"}</span></div>
        </div>
        <button class="view" data-open="${ev.id}" type="button" aria-label="Ver detalhes de ${ev.title}">Ver detalhes</button>
      </div>
      <div class="card-media">${ev.image?`<img src="${ev.image}" alt="Imagem do evento ${ev.title}" loading="lazy" decoding="async">`:"Ingresso"}</div>
    `;
    lista.appendChild(card);
  });

  dEv && (dEv.textContent = String(data.length));
}

function buildStatusChip(statusLabel){
  const key = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote" ? "low" : "soon");
  const lbl = statusLabel || "Em breve";
  return `<span class="status-chip ${key}"><span class="dot" aria-hidden="true"></span>${lbl}</span>`;
}

function openSheet(ev){
  if (!sheet || !sheetBody || !sheetBackdrop) return;
  sheetBody.innerHTML = `
    <div class="sheet-head">
      <h3 id="sheet-title">${ev.title} — ${ev.city||""}</h3>
      ${buildStatusChip(normalizeStatusLabel(ev.statusLabel||ev.status||""))}
    </div>
    <div class="sheet-media">${ev.image?`<img src="${ev.image}" alt="Imagem do evento ${ev.title}" loading="lazy" decoding="async">`:""}</div>
    <div class="std-card">
      <p style="margin-top:0"><strong>Local:</strong> ${ev.venue || "-"}<br/>
      <strong>Quando:</strong> ${formatDate(ev.date)}<br/>
      ${Number.isFinite(+ev.price) ? `<strong>Preço:</strong> ${money(ev.price)}` : ""}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn--secondary btn--sm" id="buy-demo" href="#">Comprar (demo)</a>
      </div>
    </div>
  `;

  sheet.setAttribute("aria-hidden","false");
  sheet.setAttribute("aria-labelledby","sheet-title");
  sheetBackdrop.setAttribute("aria-hidden","false");
  sheet.classList.add("is-open");
  sheetBackdrop.classList.add("is-open");

  $("#buy-demo").onclick = async (e) => {
    e.preventDefault();
    const to = prompt("Seu WhatsApp (DDI+DDD+NÚMERO):",""); if(!to) return;
    const qs = new URLSearchParams({ ev: ev.id, to, name: "Participante", qty: "1" }).toString();
    try{
      await tryFetch([ `${BASE_WITH_API}/purchase/start?${qs}` ], {});
      alert("🎟️ Ingresso enviado no seu WhatsApp!");
    }catch(err){
      console.error(err);
      alert("Não consegui enviar agora. Você pode tentar pelo WhatsApp: "+ waHref(`ingressai:start ev=${ev.id} qty=1 autopay=1 name=`));
    }
  };
}

function closeSheet(){
  if (!sheet || !sheetBackdrop) return;
  sheet.classList.remove("is-open");
  sheetBackdrop.classList.remove("is-open");
  sheet.removeAttribute("aria-labelledby");
  sheet.setAttribute("aria-hidden","true");
  sheetBackdrop.setAttribute("aria-hidden","true");
}

/* ================== organizadores / calc (texto + categoria) ================== */
(function initOrgCalc(){
  const std = $("#std-card");
  if (!std) return;
  const features=[
    "Criação de evento 100% pelo WhatsApp",
    "Geração automática de ingresso com QR Code",
    "Link público de vendas e acompanhamento em tempo real",
    "Repasse na hora ao organizador",
    "Página de validador liberada no Dashboard",
    "Lista de compradores atualizada"
  ];
  std.innerHTML = "<ul class='std-list'>" + features.map(f=>`<li>${f}</li>`).join("") + "</ul>";
})();

function recalcForCategory(){
  // simples: valores de demo (você pode evoluir depois)
  const feeByCat = { promotor: 0.10, casa: 0.07 };
  const cat = (document.querySelector('input[name="org-cat"]:checked')?.value) || "promotor";
  const fee = feeByCat[cat] ?? 0.10;

  // valores fictícios (sem inputs por ora)
  const price = 0;
  const qty   = 0;
  const gross = price * qty;
  const net   = gross * (1 - fee);

  $("#calc-gross") && ($("#calc-gross").textContent = money(gross));
  $("#calc-net") && ($("#calc-net").textContent = money(net));
}

/* ================== login modal (OTP) ================== */
const loginModal   = $("#login-modal");
const loginSendBtn = $("#login-send");
const loginCancel  = $("#login-cancel");
const loginPhone   = $("#login-phone");
const codeBlock    = $("#code-block");
const codeBack     = $("#code-back");
const codeVerify   = $("#code-verify");
const codeInput    = $("#login-code");
const loginHint    = $("#login-hint");

function openLogin(){
  if(!loginModal) return;
  loginHint && (loginHint.textContent="");
  codeBlock && (codeBlock.style.display="none");
  loginModal.classList.add("is-open");
  loginModal.setAttribute("aria-hidden","false");
  loginPhone?.focus();
  // trava rolagem atrás do modal
  document.documentElement.style.overflow = "hidden";
}
function closeLogin(){
  if(!loginModal) return;
  loginModal.classList.remove("is-open");
  loginModal.setAttribute("aria-hidden","true");
  document.documentElement.style.overflow = "";
}

document.addEventListener("click",(e)=>{
  // qualquer coisa com data-login abre o modal (e previne #)
  const trg = e.target.closest("[data-login]");
  if (trg){ e.preventDefault(); openLogin(); }
});

loginCancel?.addEventListener("click", (e)=>{ e.preventDefault(); closeLogin(); });
codeBack?.addEventListener("click", (e)=>{ e.preventDefault(); codeBlock.style.display="none"; loginHint.textContent=""; });

loginSendBtn?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const phone = String(loginPhone.value||"").replace(/[^\d]/g,"");
  if (!/^\d{10,15}$/.test(phone)) { loginHint.textContent="Número inválido. Use DDI+DDD+NÚMERO (ex.: 5534999999999)"; return; }
  try {
    loginHint.textContent="Enviando código…";
    await fetchJson(`${BASE_WITH_API}/auth/request`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone }),
      credentials: "include" // seta cookie da API (sessão)
    });
    loginHint.textContent="Código enviado no seu WhatsApp. Digite abaixo para verificar.";
    codeBlock.style.display="block";
    codeInput.focus();
    sessionStorage.setItem("ingr_phone", phone);
  } catch (e2) {
    console.error(e2);
    loginHint.textContent="Falha ao enviar código (CORS ou indisponível).";
  }
});

codeVerify?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const phone = sessionStorage.getItem("ingr_phone") || String(loginPhone.value||"").replace(/[^\d]/g,"");
  const code  = String(codeInput.value||"").trim();
  if (!/^\d{3,6}$/.test(code)) { loginHint.textContent="Código inválido."; return; }
  try {
    loginHint.textContent="Verificando…";
    await fetchJson(`${BASE_WITH_API}/auth/verify`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone, code }),
      credentials: "include"
    });
    loginHint.textContent="Pronto! Você está autenticado.";
    // redireciona MESMA ABA (evita popup bloqueado)
    location.assign(`${BASE_ROOT}/app/dashboard.html`);
  } catch (e3) {
    console.error(e3);
    loginHint.textContent="Código inválido, expirado ou bloqueado por CORS.";
  }
});

/* ================== solicitação de criação de evento ================== */
const reqForm  = $("#req-form");
const reqSend  = $("#req-send");
const reqHint  = $("#req-hint");
const reqPhone = $("#req-phone");
const reqTitle = $("#req-title");
const reqCity  = $("#req-city");
const reqVenue = $("#req-venue");
const reqDate  = $("#req-date");

reqSend?.addEventListener("click", async (e)=>{
  e.preventDefault();
  // força login modal primeiro (fluxo: usuário autentica e cai no dashboard)
  openLogin();

  // também tenta registrar a solicitação no backend (se rota existir)
  const phone = String(reqPhone?.value||"").replace(/[^\d]/g,"");
  const title = String(reqTitle?.value||"").trim();
  const city  = String(reqCity?.value||"").trim();
  const venue = String(reqVenue?.value||"").trim();
  const date  = String(reqDate?.value||"").trim();

  if (!/^\d{10,15}$/.test(phone)) {
    reqHint && (reqHint.textContent = "Informe um WhatsApp válido (DDI+DDD+Número).");
    return;
  }
  if (!title || !city) {
    reqHint && (reqHint.textContent = "Preencha ao menos Nome do evento e Cidade.");
    return;
  }

  const payload = { phone, title, city, venue, date: date || null, category: (document.querySelector('input[name="org-cat"]:checked')?.value)||"promotor" };

  try {
    reqHint && (reqHint.textContent = "Enviando solicitação…");
    // tenta em /org/request; se não existir, tenta /events/request
    const res = await tryFetch(
      [
        `${BASE_WITH_API}/org/request`,
        `${BASE_WITH_API}/events/request`
      ],
      {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Accept":"application/json" },
        body: JSON.stringify(payload),
        credentials:"include"
      }
    );
    // se vier JSON, só para log
    await res.clone().json().catch(()=>null);
    reqHint && (reqHint.textContent = "Solicitação enviada! Você será avisado no WhatsApp após a aprovação.");
  } catch (err) {
    console.warn("Falha ao registrar solicitação — usando fallback WhatsApp", err);
    reqHint && (reqHint.textContent = "Não consegui registrar agora. Vou abrir o WhatsApp com sua solicitação.");
    const texto = `Solicitação de criação de evento:%0A• Tel: ${phone}%0A• Evento: ${title}%0A• Cidade: ${city}%0A• Local: ${venue||"-"}%0A• Data: ${date||"-"}`;
    const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${texto}`;
    // abre em nova aba para não perder a landing
    window.open(href, "_blank", "noopener,noreferrer");
  }
});

/* ================== navegação / sheet bindings ================== */
document.addEventListener("click", (e)=>{
  safePreventAnchor(e);
  if (e.target.closest("[data-close='sheet']")) { e.preventDefault(); closeSheet(); }
  const openBtn = e.target.closest("[data-open]");
  if (openBtn){
    const ev = evIndex[openBtn.dataset.open]; if (ev) openSheet(ev);
  }
});
sheetBackdrop?.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && sheet?.classList?.contains("is-open")) closeSheet(); });

/* ================== init ================== */
async function initLanding(){
  // header/hero
  initHeader();

  // Abrir seção organizadores ao navegar com #hash
  const sec=$("#organizadores");
  const cta=$("#cta-organizadores");
  function openOrganizadores(){ if(sec){ sec.removeAttribute("hidden"); sec.setAttribute("tabindex","-1"); sec.focus?.(); } }
  cta?.addEventListener("click", (e)=>{ const href = cta.getAttribute("href")||""; if (href.startsWith("#organizadores")) { e.preventDefault(); openOrganizadores(); } });
  if (location.hash === "#organizadores") openOrganizadores();

  // diagnostico
  dApi && (dApi.textContent = BASE_WITH_API);

  // Health → indicador online/offline
  try{
    const h = await fetchJson(`${BASE_WITH_API}/health`, {});
    backendOnline = !!h?.ok || h === "ok" || h === true;
  }catch{ backendOnline = false; }
  if (authTag){
    authTag.textContent = backendOnline ? "online" : "offline";
    authTag.classList.toggle("off", !backendOnline);
    authTag.classList.toggle("on", !!backendOnline);
  }
  dHealth && (dHealth.textContent = backendOnline ? "ok" : "off");

  // Carregar eventos (shape compatível com /api/events)
  try{
    const r = await tryFetch([ `${BASE_WITH_API}/events`, `${BASE_ROOT}/events` ], { headers:{ Accept:"application/json" } });
    const j = await r.json().catch(()=> ({}));
    const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
    eventos = arr.length ? arr : [{
      id:"TST-INGRESSAI",
      title:"Evento Teste IngressAI",
      city:"Uberaba-MG",
      venue:"Espaço Demo",
      date:new Date(Date.now()+2*86400e3).toISOString(),
      price: 60,
      statusLabel:"Último lote",
      image:""
    }];
    evIndex = Object.fromEntries(eventos.map(e=>[String(e.id), e]));
  }catch(e){
    console.warn("falha /events", e);
    eventos = [{
      id:"TST-INGRESSAI",
      title:"Evento Teste IngressAI",
      city:"Uberaba-MG",
      venue:"Espaço Demo",
      date:new Date(Date.now()+2*86400e3).toISOString(),
      price: 60,
      statusLabel:"Último lote",
      image:""
    }];
    evIndex = Object.fromEntries(eventos.map(e=>[String(e.id), e]));
  }

  buildChips();
  renderCards();
  recalcForCategory();

  // Filtros
  chipsRow?.addEventListener("click", e=>{
    const b=e.target.closest("button.chip"); if(!b) return;
    chipsRow.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-selected","false"));
    b.setAttribute("aria-selected","true");
    renderCards(b.dataset.city||"", inputBusca?.value||"");
  });

  let debounce;
  inputBusca?.addEventListener("input", ()=>{
    clearTimeout(debounce);
    debounce=setTimeout(()=>{
      const active = chipsRow?.querySelector('.chip[aria-selected="true"]');
      renderCards(active?.dataset.city||"", inputBusca.value);
    }, 180);
  });

  // categoria calculadora
  $$('.disclosure input[name="org-cat"]').forEach(radio=>{
    radio.addEventListener("change", recalcForCategory);
  });

  console.log("[IngressAI] ready", { BASE_WITH_API, BASE_ROOT });
}

document.addEventListener("DOMContentLoaded", initLanding);

/* ================== erro global (debug) ================== */
window.addEventListener("error", (ev)=>{
  if (!errOverlay || !errPre) return;
  errPre.textContent = String(ev?.error?.stack || ev?.message || ev).slice(0, 4000);
  errOverlay.style.display = "flex";
});
window.addEventListener("unhandledrejection", (ev)=>{
  if (!errOverlay || !errPre) return;
  errPre.textContent = String(ev?.reason?.stack || ev?.reason || ev).slice(0, 4000);
  errOverlay.style.display = "flex";
});
