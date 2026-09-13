/* =====================================================================
   tap-check — can you actually tap the thing the challenge asks for?

   The bug this exists to catch: two tappable things in the same picture
   whose hit shapes overlap, listed in the wrong order, so the big one
   swallows the small one. It shipped: in Egg to Wings the caterpillars
   sat inside the milkweed's rectangle and the milkweed was checked
   first, so "tap a caterpillar" opened the milkweed card and the badge
   could not be earned with a pointer at all.

   The invariant is small and total: for every item in every chapter of
   every tool, tapping that item's OWN centre must return that item.
   Anything else means something is on top of it.

   It also re-checks the same thing after the controls have been used,
   because most of these pictures only grow their small items once a
   child has pressed something — an empty garden has nothing to swallow.

   Run:  npm i -D playwright && node tests/tap-check.mjs
   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome skips the browser download.
   Exits non-zero on any unreachable item.
   ===================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const APPS = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'index.html')))
  .filter(d => !d.name.startsWith('.') && d.name !== 'tests' && d.name !== 'node_modules')
  .map(d => d.name);

/* Only the tools that expose items()/hitTest() can be checked this way. The
   older five hit-test against their own scene data and are skipped rather
   than reported as failures. */
const TESTABLE = ['under-your-feet', 'egg-to-wings', 'city-explorer'];

/* What to press before the second pass, so the pictures are full rather than
   empty. Every one of these is a chapter control; a selector that is not on
   the current chapter is simply skipped. */
const WARMUP = {
  'under-your-feet': ['#btnDrill', '#togHeat', '#togThick', '#togWeigh', '#btnIce',
    '#btnPush', '#btnPush', '#btnPush', '#btnPush', '#btnRain', '#togMelt', '#btnErupt',
    '#btnSqueeze', '#btnSqueeze', '#btnSqueeze', '#btnSqueeze', '#btnSnap'],
  'egg-to-wings': ['#togGlass', '#btnDay', '#btnDay', '#btnDay', '#btnDay',
    '#btnEat', '#btnEat', '#btnEat', '#btnEat', '#togSizes',
    '#btnStep', '#btnStep', '#togInside', '#btnHatch', '#btnHatch', '#btnHatch', '#togTongue',
    '#btnMilk', '#btnMilk', '#btnMilk', '#btnBloom', '#btnBloom', '#btnSouth'],
  /* City Explorer: btnGrow cycles 1764 → today and back, so four presses end
     where they started with every era's items having been built along the way;
     togSizes appears twice so the comparison overlay is opened and closed. */
  'city-explorer': ['#btnGrow', '#btnGrow', '#btnGrow', '#btnGrow', '#togBlock',
    '#togSizes', '#togSizes',
    '[data-dens="flat"]', '[data-dens="apt"]', '#togWalk',
    '#togZones', '#btnTaller', '#btnTaller', '#togNight',
    '#btnTap', '#btnFlush', '#btnPower', '#btnStorm',
    '#togReach', '#btnAddFire', '#btnAddFire', '#btnCall',
    '#togHeat', '#togWalkPark', '#togFair'],
};

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* Ask the page itself: sample points spread across each item's own hit shape
   and see how many of them come back as that item.

   Not just the exact centre: things move. A butterfly drifting over the
   flower bed legitimately takes the tap where it is, and a flower bed that
   is reachable everywhere except one pixel is not broken. What IS broken is
   a thing that is covered so thoroughly there is nowhere left to press —
   which is what happened to the caterpillars. So the bar is a quarter of the
   shape, which a moving butterfly never reaches and a milkweed rectangle
   lying on top of you always does.

   Items may legitimately repeat an id (three caterpillars, two wings), so a
   match on id counts — it is the card that opens that matters. */
const NEED = 0.25;
const PROBE = `(()=>{
  const G = window.underYourFeet || window.eggToWings || window.cityExplorer;
  if (!G || !G.items || !G.hitTest) return { error: 'no test global' };
  const pts = h => {
    const P = [];
    if (h.t === 'r') { for (let i=1;i<=5;i++) for (let j=1;j<=5;j++)
      P.push([h.x + h.w*i/6, h.y + h.h*j/6]); }
    else if (h.t === 'c') { P.push([h.x, h.y]);
      for (const f of [0.5, 0.8]) for (let k=0;k<8;k++){ const a=k/8*Math.PI*2;
        P.push([h.x + Math.cos(a)*h.r*f, h.y + Math.sin(a)*h.r*f]); } }
    else if (h.t === 'ring') { const m=(h.r0+h.r1)/2;
      for (let k=0;k<16;k++){ const a=k/16*Math.PI*2;
        P.push([h.x + Math.cos(a)*m, h.y + Math.sin(a)*m]); } }
    return P;
  };
  const bad = [], list = G.items();
  list.forEach(it => {
    if (!it.hit) { bad.push({ id: it.id, pct: 0, got: '(no hit shape)' }); return; }
    const P = pts(it.hit);
    let ok = 0; const stealers = {};
    P.forEach(q => { const g = G.hitTest(q[0], q[1]);
      if (g && g.id === it.id) ok++;
      else stealers[g ? g.id : '(nothing)'] = (stealers[g ? g.id : '(nothing)'] || 0) + 1; });
    const pct = ok / P.length;
    if (pct < ${NEED}) {
      const top = Object.entries(stealers).sort((a,b) => b[1]-a[1])[0];
      bad.push({ id: it.id, pct: Math.round(pct*100), got: top ? top[0] : '(nothing)' });
    }
  });
  return { bad, n: list.length };
})()`;

/* A rough finger: a 44px target at the narrowest phone the layout check uses
   is about 118 units of the 1000x620 design space these scenes are drawn in.
   Reported separately from the overlap failures — a small card is a wart, a
   swallowed one is a bug. */
const SIZE_PROBE = `(()=>{
  const G = window.underYourFeet || window.eggToWings || window.cityExplorer;
  const MIN = 118, out = [];
  G.items().forEach(it => {
    const h = it.hit; if (!h) return;
    const w = h.t === 'r' ? Math.min(h.w, h.h) : h.t === 'c' ? h.r * 2 : (h.r1 - h.r0) * 2;
    if (w < MIN) out.push(it.id + ' (' + Math.round(w) + ')');
  });
  return out;
})()`;

const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const fails = [], warns = [];

await Promise.all(APPS.filter(a => TESTABLE.includes(a)).map(async app => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${app}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  const n = await p.evaluate(() => document.querySelectorAll('.lvl').length);

  for (const pass of ['fresh', 'used']) {
    for (let i = 0; i < n; i++) {
      await p.evaluate(i => document.querySelectorAll('.lvl')[i].click(), i);
      await p.waitForTimeout(900);
      if (pass === 'used') {
        for (const sel of WARMUP[app] || []) {
          const on = await p.evaluate(s => { const b = document.querySelector(s);
            return !!(b && b.offsetParent !== null); }, sel);
          if (on) { await p.click(sel).catch(() => {}); await p.waitForTimeout(260); }
        }
        await p.waitForTimeout(500);
      }
      const id = await p.evaluate(() => {
        const G = window.underYourFeet || window.eggToWings || window.cityExplorer;
        const k = [...document.querySelectorAll('.lvl')].findIndex(b => b.classList.contains('on'));
        return G.CHAPTERS[k].id;
      });
      const r = await p.evaluate(PROBE);
      if (r.error) { fails.push(`${app}: ${r.error}`); continue; }
      r.bad.forEach(b => fails.push(
        `${app} / ${id} (${pass}): "${b.id}" is reachable from only ${b.pct}% of itself — "${b.got}" is on top of it`));
      if (pass === 'used') (await p.evaluate(SIZE_PROBE)).forEach(s =>
        warns.push(`${app} / ${id}: ${s} is smaller than a fingertip`));
    }
  }
  await ctx.close();
}));

await browser.close();
server.close();

if (warns.length) {
  console.warn(`${warns.length} small targets (not failures):`);
  [...new Set(warns)].slice(0, 12).forEach(w => console.warn('  ' + w));
  console.warn('');
}
if (fails.length) {
  console.error(`FAIL — ${fails.length} things you cannot tap\n`);
  [...new Set(fails)].slice(0, 40).forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log(`PASS — ${APPS.filter(a => TESTABLE.includes(a)).length} tools: every tappable thing in every chapter is reachable over at least ${Math.round(NEED*100)}% of itself, before and after the controls are used.`);
