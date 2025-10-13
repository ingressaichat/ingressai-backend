// login.js
const API_PARAM = new URLSearchParams(location.search).get("api");
const ENV_API   = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
const BASE_WITH_API = String(API_PARAM || ENV_API || "https://ingressai-backend-production.up.railway.app/api").replace(/\/$/, "");
const BASE_ROOT     = BASE_WITH_API.replace(/\/api$/, "");

const $ = (s) => document.querySelector(s);
const phone = $("#phone");
const code  = $("#code");
const hint  = $("#hint");

function onlyDigits(v=""){ return String(v).replace(/\D+/g,""); }
function setHint(t){ hint.textContent = t || ""; }

// se já estiver logado, pula para o dashboard
(async () => {
  try{
    const r = await fetch(`${BASE_WITH_API}/auth/session`, { credentials: "include" });
    const j = await r.json().catch(()=>({}));
    if (j?.ok) {
      location.replace("./dashboard.html");
      return;
    }
  }catch {}
})();

$("#btnSend").onclick = async () => {
  setHint("");
  const body = { phone: onlyDigits(phone.value) };
  if (!/^\d{10,15}$/.test(body.phone)) { setHint("Número inválido. Use DDI+DDD+NÚMERO (ex.: 5534999999999)"); return; }

  try{
    const r = await fetch(`${BASE_WITH_API}/auth/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // cookie cross-site (SameSite=None) vindo da API
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(()=>({}));
    if (j?.ok) {
      sessionStorage.setItem("ingr_phone", body.phone);
      setHint("Código enviado no seu WhatsApp.");
    } else {
      setHint("Falha ao enviar código.");
    }
  }catch(e){
    setHint("Erro de rede/CORS ao enviar o código.");
  }
};

$("#btnVerify").onclick = async () => {
  setHint("");
  const body = { phone: onlyDigits(phone.value || sessionStorage.getItem("ingr_phone") || ""), code: String(code.value||"").trim() };
  if (!/^\d{10,15}$/.test(body.phone)) { setHint("Preencha um telefone válido."); return; }
  if (!/^\d{3,6}$/.test(body.code)) { setHint("Código inválido."); return; }

  try{
    const r = await fetch(`${BASE_WITH_API}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(()=>({}));
    if (j?.ok || j?.isOrganizer !== undefined) {
      // sessão confirmada (cookie setado pela API)
      location.replace("./dashboard.html");
    } else {
      setHint("Código inválido ou expirado.");
    }
  }catch(e){
    setHint("Erro de rede/CORS ao verificar o código.");
  }
};

// suporte a Enter
[phone, code].forEach(el=>{
  el?.addEventListener("keydown", (e)=>{
    if (e.key === "Enter") {
      if (el === phone) $("#btnSend").click();
      else $("#btnVerify").click();
    }
  });
});
