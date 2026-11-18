// Røyktest for Bergen live: åpner siden i ekte Chromium og sjekker at data fra
// Entur, MET, strømpris og nedbørkart faktisk kommer frem.
// Kjør lokalt:  npm i --no-save playwright && npx playwright install chromium
//               python3 -m http.server 8000   (i repo-roten)
//               BASE_URL=http://localhost:8000/ node tests/smoke.mjs
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const lines = [];
let failed = false;
const check = (name, ok, info = '') => { lines.push(`| ${ok ? '✅' : '❌'} | ${name} | ${info} |`); if (!ok) failed = true; };
const warn  = (name, ok, info = '') => { lines.push(`| ${ok ? '✅' : '⚠️'} | ${name} | ${info} |`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'nb-NO', timezoneId: 'Europe/Oslo' });
const page = await ctx.newPage();
const jsErrors = [];
page.on('pageerror', e => jsErrors.push(e.message));

async function step(name, fn) {
  try { await fn(); } catch (e) { check(name, false, String(e.message || e).split('\n')[0].slice(0, 160)); }
}

// 1) Kart + kjøretøy
await step('Kjøretøy fra Entur', async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const n = await page.waitForFunction(() => {
    const m = (document.getElementById('statusText')?.textContent || '').match(/(\d+) av (\d+) kjøretøy/);
    return m && +m[2] > 0 ? +m[2] : false;
  }, null, { timeout: 40000 }).then(h => h.jsonValue());
  check('Kjøretøy fra Entur', n > 0, `${n} kjøretøy`);
  await wait(4000);
  const tram = await page.evaluate(() => document.querySelectorAll('.veh.tram').length);
  warn('Bybanen (anslått posisjon)', tram > 0, tram ? `${tram} vogner` : 'ingen vogner – normalt om natten');
  await page.screenshot({ path: SHOTS + '1-kart.png' });
});

// 2) Holdeplass + avganger (via navnelenke → geocoder → Journey Planner)
await step('Avganger fra Byparken', async () => {
  await page.goto(BASE + '#stopp-byparken');
  const n = await page.waitForFunction(() => {
    const err = document.querySelector('#stopDeps .err-t');
    if (err) return -1;
    const k = document.querySelectorAll('#stopDeps .dep').length;
    return k > 0 ? k : false;
  }, null, { timeout: 30000 }).then(h => h.jsonValue());
  const title = await page.textContent('#stopBox .ttl').catch(() => '');
  check('Avganger fra Byparken', n > 0, n > 0 ? `${n} avganger fra «${title?.trim()}»` : await page.textContent('#stopDeps'));
  await page.screenshot({ path: SHOTS + '2-holdeplass.png' });
});

// 3) Følg et kjøretøy (neste stopp fra Journey Planner)
await step('Følg kjøretøy – neste stopp', async () => {
  const live = await page.$('#stopDeps .dep.live');
  if (!live) { warn('Følg kjøretøy – neste stopp', false, 'ingen avgang med live posisjon akkurat nå'); return; }
  await live.click();
  const n = await page.waitForFunction(() => {
    const t = document.getElementById('vehCalls')?.textContent || '';
    if (/Fant ikke|sender ikke/.test(t)) return -1;
    const k = document.querySelectorAll('#vehCalls .calls li').length;
    return k > 0 ? k : false;
  }, null, { timeout: 25000 }).then(h => h.jsonValue());
  warn('Følg kjøretøy – neste stopp', n > 0, n > 0 ? `${n} stopp vist` : await page.textContent('#vehCalls'));
  await page.screenshot({ path: SHOTS + '3-folg.png' });
});

// 4) Bergen nå: vær + strømpris
await step('Bergen nå', async () => {
  await page.goto(BASE + '#bergen-na');
  await page.waitForFunction(() => {
    const t = document.getElementById('tiles')?.textContent || '';
    return /°/.test(t) || /Kunne ikke hente vær/.test(t);
  }, null, { timeout: 25000 });
  await page.waitForFunction(() => /øre\/kWh|Kunne ikke hente strømpris/.test(document.getElementById('tiles')?.textContent || ''), null, { timeout: 25000 }).catch(() => {});
  const t = await page.textContent('#tiles');
  check('Vær fra MET', /°/.test(t) && !/Kunne ikke hente vær/.test(t), (t.match(/-?\d+,\d°[^R]*/) || [''])[0].slice(0, 40));
  check('Strømpris NO5', /\d+\s*øre\/kWh/.test(t), (t.match(/\d+\s*øre\/kWh/) || ['mangler'])[0]);
  await page.screenshot({ path: SHOTS + '4-bergen-na.png' });
});

// 5) Nedbørkart: radar + Yr-varsel lastes som kartfliser
await step('Nedbørkart', async () => {
  await page.goto(BASE + '#regn');
  await page.waitForFunction(() => !document.getElementById('rainBar')?.hidden && /kl\./.test(document.getElementById('rainTime')?.textContent || ''), null, { timeout: 20000 });
  await page.evaluate(() => { const s = document.getElementById('rainSlider'); s.value = String(+s.max - 10); s.dispatchEvent(new Event('input')); });
  await wait(8000);
  const r = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.leaflet-rain-pane img')];
    const ok = src => imgs.filter(i => i.src.includes(src) && i.complete && i.naturalWidth > 0).length;
    return { yr: ok('victoria.met.no'), radar: ok('rainviewer'), note: document.getElementById('rainNote').textContent };
  });
  check('Nedbørvarsel (MET Victoria WMS)', r.yr > 0, `${r.yr} kartfliser · ${r.note}`);
  warn('Radar (RainViewer)', r.radar > 0 || !/⚠/.test(r.note), r.radar ? `${r.radar} kartfliser` : r.note);
  await page.screenshot({ path: SHOTS + '5-nedbor.png' });
});

check('Ingen JavaScript-feil', jsErrors.length === 0, jsErrors.slice(0, 3).join(' · ').slice(0, 300));
await browser.close();

const report = [`### Røyktest – ${BASE}`, '', '| | Sjekk | Detaljer |', '|---|---|---|', ...lines].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
process.exit(failed ? 1 : 0);
