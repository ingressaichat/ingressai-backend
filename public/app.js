/* ========= BOOT / CONFIG ========= */
console.log("[IngressAI] app.js boot");

const API_PARAM = new URLSearchParams(location.search).get("api");
const ENV_API   = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
const BASE_WITH_API = String(API_PARAM || ENV_API || "https://ingressai-backend-production.up.railway.app/api").replace(/\/$/, "");
const BASE_ROOT     = BASE_WITH_API.replace(/\/api$/, "");
const WHATSAPP_NUMBER = "5534999992747"; // suporte/comercial

// util: tenta várias URLs até a primeira que responder 2xx
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
    credentials: opts?.credentials || "omit", // usar "include" apenas nos endpoints de auth
    ...opts
  });
  let j = null; try { j = await res.json(); } catch {}
  if (!res.ok) throw new Error(j?.error || res.statusText || "Request failed");
  return j;
}

function waHref(text){return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`}

/* ========= ESTADO ========= */
let eventos = [];
let evIndex = {};
let isOrganizer = false;
let authPhone = "";

/* ========= HELPERS ========= */
const BRL = new Intl.NumberFormat("pt-BR",{ style:"currency", currency:"BRL" });
const parseBR = v => Number(String(v).replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",", ".")) || 0;
const money   = v => BRL.format(isFinite(v)?v:0);
const $ = sel => document.querySelector(sel);

function formatDate(iso){
  try { const d = new Date(iso); return d.toLocaleString("pt-BR",{ dateStyle:"medium", timeStyle:"short" }); }
  catch { return iso }
}
function normalizeStatusLabel(s){ if(!s) return ""; return s.replace("Últimos ingressos","Último lote"); }

/* ========= AUTH/UI STATE ========= */
function setAuthState(state, phone="", organizerFlag=false){
  isOrganizer = !!state && !!organizerFlag;
  authPhone = phone || "";
  if (isOrganizer) {
    localStorage.setItem("ingr_isOrg","1");
    localStorage.setItem("ingr_phone",authPhone);
  } else {
    localStorage.removeItem("ingr_isOrg");
    localStorage.removeItem("ingr_phone");
  }
  applyAuthState();
}
function applyAuthState(){
  const tag = $("#auth-indicator");
  const navVal = $("#nav-val");
  const orgPanel = $("#org-detail");
  const preco = $("#preco");
  const qtd = $("#qtd");
  const orgQuick = $("#org-quick");

  if (isOrganizer) {
    tag.textContent = "organizador";
    tag.classList.remove("off"); tag.classList.add("on");
    navVal.hidden = false;
    orgPanel?.classList.remove("is-disabled");
    if (preco) preco.disabled = false;
    if (qtd)   qtd.disabled = false;
    if (orgQuick) { orgQuick.classList.remove("is-disabled"); orgQuick.removeAttribute("aria-disabled"); }
  } else {
    tag.textContent = "offline";
    tag.classList.add("off"); tag.classList.remove("on");
    navVal.hidden = true;
    orgPanel?.classList.add("is-disabled");
    if (preco) preco.disabled = true;
    if (qtd)   qtd.disabled = true;
    if (orgQuick) { orgQuick.classList.add("is-disabled"); orgQuick.setAttribute("aria-disabled","true"); orgQuick.removeAttribute("href"); }
  }
  // Validador: visível só p/ organizador
  const valSection = $("#validador");
  if (valSection) valSection.hidden = !isOrganizer;
}
function initAuthFromStorage(){
  const f = localStorage.getItem("ingr_isOrg") === "1";
  const p = localStorage.getItem("ingr_phone") || "";
  isOrganizer = f; authPhone = p;
  applyAuthState();
}

/* ========= HEADER/ANIMAÇÃO ========= */
function initHeader(){
  document.addEventListener("click",e=>{
    const el=e.target.closest(".btn,.view");
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

/* ========= VITRINE ========= */
const MAIN_CITIES = ["Uberaba","Uberlândia","Belo Horizonte","Ribeirão Preto","Franca"];
let selectedCity='Todas';
let query='';

const lista         = $("#lista-eventos");
const inputBusca    = $("#busca-eventos");
const chipsRow      = $("#filtro-cidades");
const sheet         = $("#sheet");
const sheetBody     = $("#sheet-body");
const sheetBackdrop = $("#sheet-backdrop");

function filterEventos(data,q,city){
  const qn=(q||"").trim().toLowerCase();
  const citySel=city||"Todas";
  return data.filter(ev=>{
    const evCidade=(ev.cidade||"").toLowerCase();
    const matchCity = citySel==="Todas" ? true : evCidade===citySel.toLowerCase();
    const nome=(ev.nome||"").toLowerCase();
    const desc=(ev.descricao||"").toLowerCase();
    const matchQuery = !qn ? true : (nome.includes(qn)||desc.includes(qn));
    return matchCity && matchQuery;
  });
}
function buildChips(){
  if (!chipsRow) return;
  chipsRow.innerHTML="";
  const cities = Array.from(new Set(MAIN_CITIES.concat(eventos.map(e=>e.cidade).filter(Boolean))));
  ["Todas", ...cities].forEach(c=>{
    const btn=document.createElement("button");
    btn.className="chip"; btn.type="button"; btn.textContent=c; btn.setAttribute("role","tab");
    btn.setAttribute("aria-selected", c===selectedCity ? "true":"false");
    btn.dataset.city=c; chipsRow.appendChild(btn);
  });
}
function buildStatusChip(statusLabel){
  const key = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote" ? "low" : "soon");
  const lbl = statusLabel || "Em breve";
  return `<span class="status-chip ${key}"><span class="dot" aria-hidden="true"></span>${lbl}</span>`;
}
function renderCards(){
  if (!lista) return;
  const data = filterEventos(eventos, query, selectedCity);
  lista.innerHTML = "";
  if (!data.length){
    const empty=document.createElement("div");
    empty.className="std-card";
    empty.innerHTML='<strong>Sem eventos publicados ainda.</strong><br><span class="subtle">Volte em breve — estamos preparando novidades ✨</span>';
    lista.appendChild(empty);
    return;
  }
  data.forEach(ev=>{
    const statusLabel = normalizeStatusLabel(ev.status||"");
    const statusKey   = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote" ? "low" : "soon");
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.key = ev.id;
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-labelledby", `card-title-${ev.id}`);
    card.innerHTML = `
      <div class="card-media">${ev.img?`<img src="${ev.img}" alt="Imagem do evento ${ev.nome}" loading="lazy" decoding="async">`:'Mídia do evento'}</div>
      <div class="card-header">
        <div>
          <div class="card-title" id="card-title-${ev.id}">${ev.nome}</div>
          <div class="card-city">${ev.cidade||""}</div>
          <div class="status-line status--${statusKey}">
            <span class="status-dot" aria-hidden="true"></span>
            <span class="status-label">${statusLabel || "Em breve"}</span>
          </div>
        </div>
      </div>
      <button type="button" class="view" data-open="${ev.id}" aria-label="Ver detalhes de ${ev.nome}">Ver detalhes</button>`;
    lista.appendChild(card);
  });
}
function openSheet(ev){
  ev = ev || {};
  const nome = ev.nome || "Evento";
  const cidade = ev.cidade || "";
  const dataISO = ev.dataISO || "";
  const localNome = ev.localNome || "Local a confirmar";
  const localUrl = ev.localUrl || "";
  const descricao = ev.descricao || nome;
  const statusLabel = normalizeStatusLabel(ev.status || "");
  const sold = statusLabel === "Esgotado";

  sheetBody.innerHTML = "";

  const media=document.createElement("div");
  media.className="sheet-media";
  if (ev.img){
    const img=document.createElement("img");
    img.src=ev.img; img.alt="Imagem do evento "+nome; img.loading="lazy"; img.decoding="async";
    media.appendChild(img);
  } else { media.textContent="Mídia do evento"; }

  const head=document.createElement("div");
  head.className="sheet-head";
  head.innerHTML=`<h3 id="sheet-title">${nome} — ${cidade}</h3>${buildStatusChip(statusLabel)}`;

  const meta1=document.createElement("div"); meta1.className="meta-line";
  meta1.innerHTML=`<strong>Data:</strong> <span>${dataISO?formatDate(dataISO):"A confirmar"}</span>`;

  const meta2=document.createElement("div"); meta2.className="meta-line";
  meta2.innerHTML= localUrl ? `<strong>Local:</strong> <a href="${localUrl}" target="_blank" rel="noopener noreferrer">${localNome}</a>` : `<strong>Local:</strong> <span>${localNome}</span>`;

  const meta3=document.createElement("div"); meta3.className="meta-line";
  meta3.innerHTML=`<strong>Categoria:</strong> <span>${ev.categoria||"IngressAI"}</span>`;

  const desc=document.createElement("p"); desc.className="subtle"; desc.textContent=descricao;

  const actions=document.createElement("div"); actions.className="actions";
  const btns=[];
  if (sold) {
    btns.push(`<span class="status-line status--sold"><span class="status-dot"></span><span class="status-label">Esgotado</span></span>`);
    btns.push(`<a class="btn btn--secondary btn--sm" href="#vitrine">Ver outros eventos</a>`);
  } else {
    btns.push(`<button type="button" class="btn btn--secondary btn--sm" data-buy="${ev.id}">Comprar ingresso (teste)</button>`);
  }
  if (isOrganizer) {
    btns.push(`<a class="btn btn--ghost btn--sm" href="${BASE_ROOT}/app/login?ev=${encodeURIComponent(ev.id)}" target="_blank" rel="noopener noreferrer">Editar no Dashboard</a>`);
  }
  actions.innerHTML = btns.join(" ");
  sheetBody.replaceChildren(media, head, meta1, meta2, meta3, desc, actions);

  actions.querySelector("[data-buy]")?.addEventListener("click", async ()=>{
    const to = prompt("Seu WhatsApp (DDI+DDD+NÚMERO, ex: 5534991551802):")?.trim();
    if (!/^\d{10,15}$/.test(to||"")) { alert("Número inválido."); return; }
    try {
      const qs = new URLSearchParams({ ev: ev.id, to, name: "Visitante", qty: "1" }).toString();
      const endpoints = [
        `${BASE_WITH_API}/purchase/start?${qs}`,
        `${BASE_ROOT}/purchase/start?${qs}`
      ];
      await tryFetch(endpoints, {});
      alert("🎟️ Ingresso enviado no seu WhatsApp!");
    } catch(e) {
      console.error(e);
      alert("Não consegui enviar agora. Você pode tentar pelo WhatsApp: "+ waHref(`ingressai:start ev=${ev.id} qty=1 autopay=1 name=`));
    }
  });

  sheet.setAttribute("aria-hidden","false"); sheet.setAttribute("aria-labelledby","sheet-title");
  sheetBackdrop.setAttribute("aria-hidden","false");
  sheet.classList.add("is-open"); sheetBackdrop.classList.add("is-open");
  document.body.style.overflow="hidden";
}
function closeSheetSafe(e){
  try{ e && e.preventDefault && e.preventDefault(); }catch{}
  try{
    sheet?.classList?.remove("is-open"); sheetBackdrop?.classList?.remove("is-open");
    sheet?.removeAttribute?.("aria-labelledby"); sheet?.setAttribute?.("aria-hidden","true");
    sheetBackdrop?.setAttribute?.("aria-hidden","true"); document.body.style.overflow="";
  }catch(err){ console.error("closeSheet fail:", err); }
}

/* ========= ORGANIZADORES (calculadora/setup) ========= */
const std        = $("#std-card");
const modelsBox  = $("#org-models");
const feeRow     = $("#fee-row");
const feeChip    = $("#fee-chip");
const detail     = $("#org-detail");
const calcBox    = $("#calc-box");
const calcNote   = $("#calc-note");
const calcNet    = $("#calc-net");
const calcGross  = $("#calc-gross");
const orgQuick   = $("#org-quick");

const commonFeatures=[
  "Criação de evento 100% pelo WhatsApp",
  "Geração automática de ingresso com QR Code",
  "Link público de vendas e acompanhamento em tempo real",
  "Repasse na hora ao organizador",
  "Página de validador liberada ao criar o evento",
  "Lista de compradores atualizada"
];
if (std) std.innerHTML = "<ul class='std-list'>" + commonFeatures.map(f=>"<li>"+f+"</li>").join("") + "</ul>";

const categorias=[
  {key:"aret",   title:"Atléticas & Repúblicas",          taxa:"8%",  feePct:8,  ctaMsg:"Olá! Quero criar um evento como Atléticas & Repúblicas. Nome do evento: . Cidade: . Data: . Lotes: ."},
  {key:"prodloc",title:"Produtoras & Locais Independentes",taxa:"10%", feePct:10, ctaMsg:"Olá! Quero criar um evento como Produtoras & Locais Independentes. Nome do evento: . Cidade: . Data: . Capacidade/Lotes: ."},
];
if (modelsBox) modelsBox.innerHTML = categorias.map(m=>`<button type="button" class="model" role="tab" aria-selected="false" data-key="${m.key}">${m.title}</button>`).join("");

function computeGross(preco,qtd){ return Math.max(0, Number(preco)||0) * Math.max(1, parseInt(qtd||1,10)); }
function computeNet(preco,qtd,feePct){ const bruto = computeGross(preco,qtd); return Number((bruto*(1-(Number(feePct)||0)/100)).toFixed(2)); }
function applyPlan(key){
  const plan=categorias.find(x=>x.key===key)||null;
  if(plan){ feeChip.textContent="Taxa "+plan.taxa; feeRow.classList.add("is-visible"); detail.classList.remove("is-disabled"); }
  else    { feeRow.classList.remove("is-visible"); detail.classList.add("is-disabled"); }
  const fee=plan?plan.feePct:""; calcBox.dataset.fee = fee;
  calcNote.innerHTML = plan ? `Taxa aplicada: <strong>${plan.taxa}</strong>. O restante é repassado na hora.` : "Selecione um plano acima para aplicar a taxa.";

  const preco = $("#preco"); const qtd = $("#qtd");
  if (preco&&qtd){
    preco.disabled = !plan; qtd.disabled = !plan;
    calcGross.textContent=BRL.format(0); calcNet.textContent=BRL.format(0);
    if(plan){
      orgQuick.classList.remove("is-disabled"); orgQuick.removeAttribute("aria-disabled");
      orgQuick.onclick = (e)=>{ e.currentTarget.href = waHref(plan.ctaMsg); e.currentTarget.target="_blank"; e.currentTarget.rel="noopener noreferrer"; };
    } else {
      orgQuick.classList.add("is-disabled"); orgQuick.setAttribute("aria-disabled","true"); orgQuick.removeAttribute("href"); orgQuick.onclick=null;
    }
    const recompute=()=>{
      const p=parseBR(preco.value||"0");
      const q=Math.max(1,parseInt(qtd.value||"1",10));
      const bruto=computeGross(p,q);
      calcGross.textContent=money(bruto);
      calcNet.textContent=money(computeNet(p,q,fee));
    };
    preco.oninput = recompute; qtd.oninput = recompute;
  }
}
modelsBox?.addEventListener("click", e=>{
  const b = e.target.closest("button.model");
  if (!b) return;
  modelsBox.querySelectorAll("button.model").forEach(x=>x.setAttribute("aria-selected","false"));
  b.setAttribute("aria-selected","true");
  applyPlan(b.dataset.key);
});
applyPlan(null);

// Solicitação de criação (campos → WhatsApp)
$("#org-request")?.addEventListener("click", ()=>{
  const title = $("#f-title")?.value?.trim() || "";
  const city  = $("#f-city")?.value?.trim() || "";
  const venue = $("#f-venue")?.value?.trim() || "";
  const date  = $("#f-date")?.value?.trim() || "";
  const phone = $("#f-phone")?.value?.replace(/[^\d]/g,"") || "";
  const fee   = calcBox?.dataset?.fee || "";
  const msg = [
    "Quero solicitar criação de evento:",
    `• Nome: ${title||"—"}`,
    `• Cidade: ${city||"—"}`,
    `• Local: ${venue||"—"}`,
    `• Data/hora: ${date||"—"}`,
    `• Meu WhatsApp: ${phone||"—"}`,
    fee?`• Plano: ${fee}%`:""
  ].filter(Boolean).join("\n");
  location.href = waHref(msg);
});

/* ========= LOGIN (OTP) ========= */
const loginModal   = $("#login-modal");
const loginSendBtn = $("#login-send");
const loginCancelBtn = $("#login-cancel");
const loginPhone   = $("#login-phone");
const codeBlock    = $("#code-block");
const codeBack     = $("#code-back");
const codeVerify   = $("#code-verify");
const codeInput    = $("#login-code");
const loginHint    = $("#login-hint");

function openLogin(){
  if (!loginModal) return;
  loginHint.textContent=""; codeBlock.style.display="none";
  loginModal.classList.add("is-open"); loginModal.setAttribute("aria-hidden","false");
  loginPhone?.focus();
}
function closeLogin(){
  if (!loginModal) return;
  loginModal.classList.remove("is-open"); loginModal.setAttribute("aria-hidden","true");
}
// intercepta todos [data-login]
document.addEventListener("click", (e)=>{
  const link = e.target.closest("[data-login]");
  if (link) { e.preventDefault(); openLogin(); }
});
loginCancelBtn?.addEventListener("click", ()=> closeLogin());
codeBack?.addEventListener("click", ()=>{ codeBlock.style.display="none"; loginHint.textContent=""; });

loginSendBtn?.addEventListener("click", async ()=>{
  const phone = String(loginPhone.value||"").replace(/[^\d]/g,"");
  if (!/^\d{10,15}$/.test(phone)) { loginHint.textContent="Número inválido. Use DDI+DDD+NÚMERO (ex.: 5534999999999)"; return; }
  try {
    loginHint.textContent="Enviando código…";
    await fetchJson(`${BASE_WITH_API}/auth/request`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone }),
      credentials: "include"
    });
    loginHint.textContent="Código enviado no seu WhatsApp. Digite abaixo para verificar.";
    codeBlock.style.display="block";
    codeInput.focus();
    authPhone = phone;
  } catch (e) {
    console.error(e);
    loginHint.textContent="Falha ao enviar código (CORS ou indisponível).";
  }
});

codeVerify?.addEventListener("click", async ()=>{
  const code = String(codeInput.value||"").trim();
  if (!/^\d{3,6}$/.test(code)) { loginHint.textContent="Código inválido."; return; }
  try {
    loginHint.textContent="Verificando…";
    const res = await fetchJson(`${BASE_WITH_API}/auth/verify`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone: authPhone, code }),
      credentials: "include"
    });
    setAuthState(true, authPhone, !!res.isOrganizer);
    // abre dashboard no backend (cookie de sessão foi setado no domínio do backend)
    window.open(`${BASE_ROOT}/app/login`, "_blank","noopener,noreferrer");
    loginHint.textContent="Pronto! Você está autenticado.";
    closeLogin();
  } catch (e) {
    console.error(e);
    loginHint.textContent="Código inválido, expirado ou bloqueado por CORS.";
  }
});

/* ========= VALIDADOR ========= */
const valCode = $("#val-code");
const valBtn  = $("#val-check");
const valRes  = $("#val-result");
valBtn?.addEventListener("click", async ()=>{
  const raw = String(valCode.value||"").trim();
  if (!raw) { valRes.innerHTML = '<span class="invalid">Informe um código.</span>'; return; }
  const code = raw.replace(/^ingressai:ticket:/i,'');
  try {
    valRes.textContent="Checando…";
    const j = await fetchJson(`${BASE_WITH_API}/validator/check`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ code }),
      credentials: "include"
    });
    if (j.valid) {
      valRes.innerHTML = `<div class="valid">✅ Válido — Ticket #${j.ticketId} • Evento: ${j.eventId} • Nome: ${j.buyerName}</div>`;
    } else {
      valRes.innerHTML = `<div class="invalid">❌ Inválido (${j.reason||"desconhecido"})</div>`;
    }
  } catch (e) {
    console.error(e);
    valRes.innerHTML = `<div class="invalid">❌ Erro na validação (CORS/Network)</div>`;
  }
});

/* ========= LOAD EVENTS ========= */
async function fetchEventosDoBackend() {
  let arr = [];
  try {
    const endpoints = [
      `${BASE_WITH_API}/events`,
      `${BASE_ROOT}/events`
    ];
    const r = await tryFetch(endpoints, { headers:{ Accept:"application/json" } });
    const j = await r.json().catch(()=> ({}));
    if (Array.isArray(j?.items)) arr = j.items;
    else if (Array.isArray(j?.events)) arr = j.events;
    else if (Array.isArray(j)) arr = j;
  } catch (e) {
    console.warn("events load failed", e);
  }

  const mapped = arr.map(e => ({
    id: String(e.id ?? e._id ?? e.code ?? "EV"),
    nome: e.title || e.nome || "Evento",
    cidade: e.city || e.cidade || "",
    dataISO: e.date || e.startsAt || e.dataISO || new Date().toISOString(),
    localNome: e.venue || e.local || "",
    localUrl: "https://maps.google.com/?q=" + encodeURIComponent(`${e.venue||e.local||""} ${e.city||e.cidade||""}`),
    categoria: e.category || "IngressAI",
    status: e.statusLabel || e.status || "Em breve",
    descricao: e.description || e.title || e.nome || "",
    img: e.image || e.bannerUrl || ""
  }));

  if (!mapped.length) {
    const dt = new Date(Date.now()+2*24*60*60*1000).toISOString();
    mapped.push({ id:"TST-INGRESSAI", nome:"Evento Teste IngressAI", cidade:"Uberaba-MG", dataISO:dt, localNome:"Espaço Demo", localUrl:"https://maps.google.com/?q=Espaço%20Demo%20Uberaba", categoria:"IngressAI", status:"Último lote", descricao:"Evento Teste IngressAI", img:"" });
  }

  eventos = mapped;
  evIndex = Object.fromEntries(eventos.map(e=>[e.id,e]));
}

function injectEventsLdJson(){
  try{
    const nodes = eventos.map(ev=>({
      "@context":"https://schema.org","@type":"Event","name":ev.nome,"startDate":ev.dataISO,
      "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode","eventStatus":"https://schema.org/EventScheduled",
      "location":{"@type":"Place","name":ev.localNome,"address":ev.cidade,"url":ev.localUrl},
      "organizer":{"@type":"Organization","name":"IngressAI","url":"https://ingressai.chat/"}
    }));
    if (nodes.length){
      const script=document.createElement("script"); script.type="application/ld+json";
      script.textContent=JSON.stringify(nodes); document.head.appendChild(script);
    }
  } catch {}
}

/* ========= NAV / SHEET BINDINGS ========= */
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-close='sheet']");
  if (btn) { closeSheetSafe(e); }
});
sheetBackdrop?.addEventListener("click", closeSheetSafe);
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && sheet?.classList?.contains("is-open")) closeSheetSafe(e); });
$("#lista-eventos")?.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-open]");
  if (!btn) return;
  const ev = evIndex[btn.dataset.open];
  if (!ev) return;
  openSheet(ev);
});

/* ========= NAV ORGANIZADORES ========= */
$("#nav-org")?.addEventListener("click", ()=>{
  const sec=$("#organizadores");
  if (sec && sec.hasAttribute("hidden")) sec.removeAttribute("hidden");
});

/* ========= INIT ========= */
document.addEventListener("DOMContentLoaded", async ()=>{
  initHeader();
  initAuthFromStorage();

  // Abrir seção organizadores ao navegar com #hash
  const sec=$("#organizadores");
  const cta=$("#cta-organizadores");
  function openOrganizadores(){ if(sec){ sec.removeAttribute("hidden"); sec.setAttribute("tabindex","-1"); sec.focus?.(); } }
  cta?.addEventListener("click", (e)=>{ if (cta.getAttribute("href")?.startsWith("#organizadores")) { e.preventDefault(); openOrganizadores(); } });
  if (location.hash === "#organizadores") openOrganizadores();

  // Carregar eventos
  await fetchEventosDoBackend();
  buildChips();
  renderCards();
  injectEventsLdJson();

  // Filtros
  chipsRow?.addEventListener("click", e=>{
    const b=e.target.closest("button.chip"); if(!b) return;
    selectedCity=b.dataset.city;
    chipsRow.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-selected","false"));
    b.setAttribute("aria-selected","true");
    renderCards();
  });
  let debounce;
  inputBusca?.addEventListener("input", ()=>{
    clearTimeout(debounce);
    debounce=setTimeout(()=>{ query=inputBusca.value; renderCards(); }, 180);
  });

  console.log("[IngressAI] ready", { BASE_WITH_API, BASE_ROOT });
});
