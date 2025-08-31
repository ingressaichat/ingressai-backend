// Evento mínimo + utilitários. Mantém in-memory (Railway FS é efêmero)
export const events = [
  {
    id: "1",
    slug: "ingressai-sp",
    title: "IngressAI • São Paulo",
    city: "São Paulo",
    date: "2025-09-10T19:00:00-03:00",
    venue: "Av. Paulista, 1000",
    imageUrl: "",
    img: "" // alias pra frontend
  }
];

export function findEvent(idOrSlug) {
  const key = String(idOrSlug || "");
  return events.find(
    (ev) => String(ev.id) === key || String(ev.slug || "") === key
  );
}

export function pureEventName(ev) {
  const t = String(ev?.title || "");
  // remove " • Cidade" no final, se houver
  return t.replace(/\s*•\s*[^•]+$/, "").trim() || t;
}

export function upsertEvent(input = {}) {
  const id = String(input.id || input.slug || "").trim();
  if (!id) throw new Error("id/slug obrigatório");
  let ev = findEvent(id);
  if (ev) {
    Object.assign(ev, input);
  } else {
    ev = {
      id: input.id || id,
      slug: input.slug || id,
      title: input.title || "Evento",
      city: input.city || "",
      date: input.date || new Date(Date.now() + 86400000).toISOString(),
      venue: input.venue || "",
      imageUrl: input.imageUrl || "",
      img: input.imageUrl || ""
    };
    events.push(ev);
  }
  // manter alias img atualizado
  ev.img = ev.imageUrl || ev.img || "";
  return ev;
}
