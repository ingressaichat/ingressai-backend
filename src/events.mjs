import { Router } from 'express';
export const eventsRouter = Router();

// Catálogo mínimo (2 por cidade)
const events = [
  { id:'hello-world-uberaba', city:'Uberaba', title:'Hello World — Uberaba', date:'2025-09-15T20:00:00-03:00', price:20, image:'https://picsum.photos/seed/hello-uba/800/450', venue:'Espaço Central', stock:999 },
  { id:'rock-na-praca-uberaba', city:'Uberaba', title:'Rock na Praça', date:'2025-09-20T18:00:00-03:00', price:0,  image:'https://picsum.photos/seed/rock-uba/800/450',  venue:'Praça Rui Barbosa', stock:999 },
  { id:'techno-night-uberlandia', city:'Uberlândia', title:'Techno Night', date:'2025-10-05T23:30:00-03:00', price:35, image:'https://picsum.photos/seed/techno-udi/800/450', venue:'Club 42', stock:999 },
  { id:'festival-gastronomia-udi', city:'Uberlândia', title:'Festival de Gastronomia', date:'2025-10-12T12:00:00-03:00', price:15, image:'https://picsum.photos/seed/food-udi/800/450',  venue:'Parque do Sabiá', stock:999 }
];

export function listEvents() { return events; }
export function findEvent(id) { return events.find(e => e.id === id); }

eventsRouter.get('/', (req, res) => {
  const byCity = {};
  for (const ev of events) {
    byCity[ev.city] = byCity[ev.city] || [];
    if (byCity[ev.city].length < 2) byCity[ev.city].push(ev);
  }
  res.json({ ok: true, cities: Object.keys(byCity), events: byCity });
});
