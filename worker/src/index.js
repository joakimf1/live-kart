// Bergen live – push-varsler (Cloudflare Worker)
//
// Hva den gjør:
//  * Tar imot push-abonnement fra appen (POST /subscribe) sammen med brukerens
//    busvarsler («si fra når 20 er 5 min unna») og Min morgen-oppsett.
//  * Hvert minutt (cron) sjekker den Entur og sender push når et varsel skal ut,
//    eller når en avgang i Min morgen-tidsrommet blir innstilt / over 5 min forsinket.
//  * Pushen sendes uten innhold (slipper kryptering). Appens service worker henter
//    selve meldingen fra GET /messages.
//
// Lagring: én KV-nøkkel «subs» med alle abonnementer, og «msg:<id>» for ventende meldinger.
// Det holder godt for en håndfull brukere innenfor gratisnivået til Cloudflare KV.

const ENTUR_JP = 'https://api.entur.io/journey-planner/v3/graphql';
const CLIENT = 'privat-bergenlivekart-push';
const DELAY_MIN = 5;

// ---------------------------------------------------------------- HTTP
export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/vapid') return json({ key: env.VAPID_PUBLIC }, cors);

      if (url.pathname === '/subscribe' && req.method === 'POST') {
        const body = await req.json();
        const sub = body.subscription;
        if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'ugyldig abonnement' }, cors, 400);
        const id = await idFor(sub.endpoint);
        const subs = await loadSubs(env);
        const prev = subs[id] || {};
        subs[id] = {
          subscription: { endpoint: sub.endpoint, keys: sub.keys },
          appUrl: safeAppUrl(body.appUrl, env),
          alerts: (body.alerts || []).slice(0, 20).map(cleanAlert).filter(Boolean),
          morning: cleanMorning(body.morning),
          notified: prev.notified || {},
          updated: Date.now(),
        };
        await saveSubs(env, subs);
        return json({ ok: true }, cors);
      }

      if (url.pathname === '/unsubscribe' && req.method === 'POST') {
        const { endpoint } = await req.json();
        const subs = await loadSubs(env);
        delete subs[await idFor(endpoint)];
        await saveSubs(env, subs);
        return json({ ok: true }, cors);
      }

      if (url.pathname === '/messages') {
        const endpoint = url.searchParams.get('endpoint') || '';
        const key = 'msg:' + (await idFor(endpoint));
        const msgs = (await env.SUBS.get(key, 'json')) || [];
        if (msgs.length) await env.SUBS.delete(key);
        return json(msgs, cors);
      }

      if (url.pathname === '/') return new Response('Bergen live push-tjeneste kjører.', { headers: cors });
      return json({ error: 'ukjent adresse' }, cors, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, cors, 500);
    }
  },

  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(runChecks(env));
  },
};

// ---------------------------------------------------------------- Sjekk hvert minutt
export async function runChecks(env, now = Date.now(), fetchImpl = fetch) {
  const subs = await loadSubs(env);
  const ids = Object.keys(subs);
  if (!ids.length) return { checked: 0 };

  // Hvilke holdeplasser må vi spørre Entur om?
  const stops = new Set();
  for (const id of ids) {
    const s = subs[id];
    for (const a of s.alerts || []) stops.add(a.stopId);
    if (s.morning && morningWindow(s.morning, now)) stops.add(s.morning.stopId);
  }
  if (!stops.size) return { checked: 0 };

  const calls = {};
  await Promise.all([...stops].map(async stopId => {
    try { calls[stopId] = await departures(stopId, fetchImpl); } catch (e) { calls[stopId] = null; }
  }));

  let changed = false, sent = 0;
  const today = osloDate(now);
  for (const id of ids) {
    const s = subs[id];
    const msgs = [];
    const base = s.appUrl || '';

    // 1) Varsler satt fra avgangstavla
    const keep = [];
    for (const a of s.alerts || []) {
      const list = calls[a.stopId];
      const c = list?.find(x => x.serviceJourney?.id === a.sj);
      if (!list) { keep.push(a); continue; }               // Entur svarte ikke – prøv igjen neste minutt
      if (!c) { if (now - a.t < 2 * 60000) keep.push(a); else changed = true; continue; }
      const t = Date.parse(c.expectedDepartureTime), left = (t - now) / 60000;
      if (c.cancellation) {
        msgs.push({ title: `${a.line} mot ${a.dest} er innstilt`, body: `Avgangen fra ${a.stopName} kl. ${clock(t)} er innstilt.`, tag: 'al-' + a.sj, url: base + '#stopp/' + num(a.stopId) });
        changed = true;
      } else if (left <= a.mins) {
        const when = left <= 0.5 ? 'nå' : `om ${Math.max(1, Math.round(left))} min (kl. ${clock(t)})`;
        msgs.push({ title: `${a.line} mot ${a.dest}`, body: `Går fra ${a.stopName} ${when}.`, tag: 'al-' + a.sj, url: base + '#stopp/' + num(a.stopId) });
        changed = true;
      } else {
        if (a.t !== t) { a.t = t; }
        keep.push(a);
      }
    }
    s.alerts = keep;

    // 2) Min morgen: innstilt eller over 5 min forsinket
    const m = s.morning;
    if (m && morningWindow(m, now) && calls[m.stopId]) {
      s.notified = pruneNotified(s.notified || {}, today);
      for (const c of calls[m.stopId]) {
        const code = c.serviceJourney?.line?.publicCode, sj = c.serviceJourney?.id;
        if (!sj || (m.lines?.length && !m.lines.includes(code))) continue;
        const t = Date.parse(c.expectedDepartureTime), aimed = Date.parse(c.aimedDepartureTime);
        if (t - now > 75 * 60000 || t < now) continue;     // bare avganger den neste timen
        const delay = Math.round((t - aimed) / 60000);
        const dest = c.destinationDisplay?.frontText || '';
        if (c.cancellation && !s.notified[sj + ':cx']) {
          msgs.push({ title: `⚠ ${code} kl. ${clock(aimed)} er innstilt`, body: `${code} mot ${dest} fra ${m.stopName} går ikke.`, tag: 'mm-' + sj, url: base + '#morgen' });
          s.notified[sj + ':cx'] = today; changed = true;
        } else if (!c.cancellation && delay >= DELAY_MIN && !s.notified[sj + ':d']) {
          msgs.push({ title: `${code} er ${delay} min forsinket`, body: `${code} mot ${dest} fra ${m.stopName}: ny tid kl. ${clock(t)} (rutetid ${clock(aimed)}).`, tag: 'mm-' + sj, url: base + '#morgen' });
          s.notified[sj + ':d'] = today; changed = true;
        }
      }
    }

    if (msgs.length) {
      const key = 'msg:' + id;
      const pending = (await env.SUBS.get(key, 'json')) || [];
      await env.SUBS.put(key, JSON.stringify([...pending, ...msgs].slice(-10)), { expirationTtl: 3600 });
      const status = await sendPush(s.subscription, env, fetchImpl);
      sent++;
      if (status === 404 || status === 410) { delete subs[id]; changed = true; }   // abonnementet er borte
    }
  }
  if (changed) await saveSubs(env, subs);
  return { checked: ids.length, stops: stops.size, sent };
}

async function departures(stopId, fetchImpl) {
  const q = `{ stopPlace(id:${JSON.stringify(stopId)}) { estimatedCalls(numberOfDepartures:80, timeRange:14400) {
    cancellation aimedDepartureTime expectedDepartureTime destinationDisplay{frontText} serviceJourney{id line{publicCode}} } } }`;
  const r = await fetchImpl(ENTUR_JP, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': CLIENT }, body: JSON.stringify({ query: q }) });
  if (!r.ok) throw new Error('Entur HTTP ' + r.status);
  const j = await r.json();
  return j.data?.stopPlace?.estimatedCalls || [];
}

// ---------------------------------------------------------------- Web Push (VAPID, uten innhold)
export async function vapidAuth(endpoint, env, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const header = b64uStr(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64uStr(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:ingen@example.com' }));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(header + '.' + payload));
  return `vapid t=${header}.${payload}.${b64uBytes(new Uint8Array(sig))}, k=${env.VAPID_PUBLIC}`;
}
async function sendPush(subscription, env, fetchImpl) {
  try {
    const r = await fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: { Authorization: await vapidAuth(subscription.endpoint, env), TTL: '900', Urgency: 'high', 'Content-Length': '0' },
    });
    return r.status;
  } catch (e) { return 0; }
}

// ---------------------------------------------------------------- Hjelpere
async function loadSubs(env) { return (await env.SUBS.get('subs', 'json')) || {}; }
async function saveSubs(env, subs) { await env.SUBS.put('subs', JSON.stringify(subs)); }

async function idFor(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(endpoint)));
  return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
function cleanAlert(a) {
  if (!a?.sj || !a?.stopId) return null;
  return { stopId: String(a.stopId), stopName: String(a.stopName || '').slice(0, 80), sj: String(a.sj), line: String(a.line || '').slice(0, 10),
           dest: String(a.dest || '').slice(0, 80), mins: Math.max(0, Math.min(60, +a.mins || 5)), t: +a.t || Date.now() };
}
function cleanMorning(m) {
  if (!m?.stopId) return null;
  const hm = x => /^\d{2}:\d{2}$/.test(x || '') ? x : null;
  return { stopId: String(m.stopId), stopName: String(m.stopName || '').slice(0, 80), lines: (m.lines || []).slice(0, 20).map(String),
           from: hm(m.from) || '06:00', to: hm(m.to) || '09:30', days: (m.days || [1, 2, 3, 4, 5]).map(Number).filter(d => d >= 1 && d <= 7) };
}
function safeAppUrl(u, env) {
  try { const x = new URL(u); if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*' || x.origin === env.ALLOWED_ORIGIN) return x.origin + x.pathname; } catch (e) {}
  return env.APP_URL || '';
}
function pruneNotified(n, today) { const out = {}; for (const [k, v] of Object.entries(n)) if (v === today) out[k] = v; return out; }

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function osloParts(t) {
  const p = fmt.formatToParts(new Date(t)), g = k => p.find(x => x.type === k)?.value;
  return { wd: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[g('weekday')], hm: `${g('hour')}:${g('minute')}` };
}
export function morningWindow(m, t) { const { wd, hm } = osloParts(t); return m.days.includes(wd) && hm >= m.from && hm <= m.to; }
const osloDate = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const clock = t => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
const num = id => String(id).split(':').pop();

function b64uBytes(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const b64uStr = s => b64uBytes(new TextEncoder().encode(s));

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allow = !env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*' ? '*' : (origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN);
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}
function json(data, headers, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } }); }
