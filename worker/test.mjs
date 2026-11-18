// Enhetstester for push-Worker-en (kjører i Node 20+, uten nettverk):  node worker/test.mjs
import worker, { runChecks, vapidAuth, morningWindow } from './src/index.js';
import assert from 'node:assert/strict';

const { subtle } = globalThis.crypto;
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// --- Falsk KV
const store = new Map();
const KV = {
  async get(k, type) { const v = store.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); },
};
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const env = {
  SUBS: KV, ALLOWED_ORIGIN: 'https://joakimf1.github.io', APP_URL: 'https://joakimf1.github.io/live-kart/', VAPID_SUBJECT: 'mailto:test@example.com',
  VAPID_PUBLIC: b64u(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))),
  VAPID_PRIVATE_JWK: JSON.stringify(await subtle.exportKey('jwk', kp.privateKey)),
};

// 1) VAPID-signaturen kan verifiseres med den offentlige nøkkelen
{
  const auth = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', env, 1_800_000_000);
  const [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/);
  const [h, p, sig] = jwt.split('.');
  assert.equal(JSON.parse(fromB64u(p)).aud, 'https://fcm.googleapis.com');
  const pub = await subtle.importKey('raw', fromB64u(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64u(sig), new TextEncoder().encode(h + '.' + p)), 'VAPID-signatur gyldig');
  console.log('✅ VAPID-signatur verifiseres');
}

// 2) Abonnere via HTTP
const now = Date.parse('2026-11-19T06:40:00Z'); // torsdag 07:40 i Oslo
const endpoint = 'https://push.example.com/sub/123';
{
  const req = new Request('https://w/subscribe', { method: 'POST', headers: { Origin: 'https://joakimf1.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({
    subscription: { endpoint, keys: { p256dh: 'x', auth: 'y' } }, appUrl: 'https://joakimf1.github.io/live-kart/',
    alerts: [{ stopId: 'NSR:StopPlace:1', stopName: 'Danmarksplass', sj: 'SJ-A', line: '20', dest: 'Lagunen', mins: 5, t: now + 8 * 60000 }],
    morning: { stopId: 'NSR:StopPlace:1', stopName: 'Danmarksplass', lines: ['20'], from: '06:30', to: '08:30', days: [1, 2, 3, 4, 5] },
  }) });
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://joakimf1.github.io');
  console.log('✅ /subscribe lagrer abonnement');
}
assert.ok(morningWindow({ days: [4], from: '06:30', to: '08:30' }, now), 'torsdag 07:40 er innenfor');
assert.ok(!morningWindow({ days: [4], from: '06:30', to: '07:30' }, now), '07:40 er utenfor 06:30–07:30');
console.log('✅ Min morgen-tidsvindu (Oslo-tid)');

// --- Falsk Entur + push-tjeneste
let pushes = [], pushStatus = 201, sjADeparture = now + 4 * 60000;
const fakeFetch = async (url, opts) => {
  if (String(url).includes('entur')) {
    return new Response(JSON.stringify({ data: { stopPlace: { estimatedCalls: [
      { cancellation: false, aimedDepartureTime: new Date(sjADeparture).toISOString(), expectedDepartureTime: new Date(sjADeparture).toISOString(), destinationDisplay: { frontText: 'Lagunen' }, serviceJourney: { id: 'SJ-A', line: { publicCode: '20' } } },
      { cancellation: false, aimedDepartureTime: new Date(now + 10 * 60000).toISOString(), expectedDepartureTime: new Date(now + 17 * 60000).toISOString(), destinationDisplay: { frontText: 'Birkelundstoppen' }, serviceJourney: { id: 'SJ-B', line: { publicCode: '20' } } },
      { cancellation: true, aimedDepartureTime: new Date(now + 20 * 60000).toISOString(), expectedDepartureTime: new Date(now + 20 * 60000).toISOString(), destinationDisplay: { frontText: 'Lagunen' }, serviceJourney: { id: 'SJ-C', line: { publicCode: '20' } } },
      { cancellation: true, aimedDepartureTime: new Date(now + 9 * 60000).toISOString(), expectedDepartureTime: new Date(now + 9 * 60000).toISOString(), destinationDisplay: { frontText: 'Sentrum' }, serviceJourney: { id: 'SJ-X', line: { publicCode: '12' } } },
    ] } } }), { status: 200 });
  }
  pushes.push({ url, headers: opts.headers });
  return new Response(null, { status: pushStatus });
};

// 3) Første kjøring: busvarsel (4 min igjen ≤ 5), forsinkelse (+7) og innstilling på linje 20; linje 12 ignoreres
{
  const r = await runChecks(env, now, fakeFetch);
  assert.equal(r.sent, 1, 'én push per abonnement');
  assert.match(pushes[0].headers.Authorization, /^vapid t=/);
  const id = Object.keys(JSON.parse(store.get('subs')))[0];
  const msgs = JSON.parse(store.get('msg:' + id));
  const titles = msgs.map(m => m.title);
  assert.ok(titles.some(t => t.startsWith('20 mot Lagunen')), 'busvarsel');
  assert.ok(titles.some(t => /7 min forsinket/.test(t)), 'forsinkelse');
  assert.ok(titles.some(t => /innstilt/.test(t)), 'innstilt');
  assert.ok(!titles.some(t => /^⚠ 12/.test(t)), 'linje 12 er ikke valgt');
  assert.equal(JSON.parse(store.get('subs'))[id].alerts.length, 0, 'busvarselet er brukt opp');
  console.log('✅ Varsler:', titles.join(' | '));

  // /messages leverer og tømmer køen
  const res = await worker.fetch(new Request('https://w/messages?endpoint=' + encodeURIComponent(endpoint)), env);
  assert.equal((await res.json()).length, 3);
  assert.equal(store.get('msg:' + id), undefined);
  console.log('✅ /messages leverer og tømmer');
}

// 4) Andre kjøring: ingen duplikater
{
  pushes = [];
  const r = await runChecks(env, now + 60000, fakeFetch);
  assert.equal(r.sent, 0, 'ingen nye varsler');
  console.log('✅ Ingen dupliserte varsler');
}

// 5) Død push-adresse (410) fjernes
{
  const s = JSON.parse(store.get('subs')); const id = Object.keys(s)[0];
  s[id].alerts = [{ stopId: 'NSR:StopPlace:1', stopName: 'Danmarksplass', sj: 'SJ-A', line: '20', dest: 'Lagunen', mins: 10, t: sjADeparture }];
  store.set('subs', JSON.stringify(s));
  pushStatus = 410;
  await runChecks(env, now + 120000, fakeFetch);
  assert.equal(Object.keys(JSON.parse(store.get('subs'))).length, 0);
  console.log('✅ Utløpt abonnement (410) ryddes bort');
}
console.log('\nAlle Worker-tester bestått.');
