/* =====================================================================
   layout-check — every control, every chapter, every viewport.

   The bug this exists to catch: a control that lands on top of another
   one, or off the edge of the screen. It happened when the chapter rail
   grew labels: the rail column sized itself to its content, squeezed the
   other two columns, and the chapter controls ended up sitting on the
   Challenge button. It was invisible at the size the author happened to
   have open and obvious at several others.

   Run:  npm i -D playwright && node tests/layout-check.mjs
   Exits non-zero if anything overlaps, so CI can gate on it.
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

/* a plain static server so the check needs nothing but playwright */
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

/* What a person can actually see and touch. Two rules keep this honest:
   an element is measured clipped by every ancestor that clips it (so a chip
   scrolled out of the rail does not count), and a pinned bar is allowed to
   float over the page as it scrolls (that is what pinning is for). */
const PROBE = `(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!e.hidden;};
  const clipped=e=>{
    const r=e.getBoundingClientRect();
    let box={l:r.left,t:r.top,r:r.right,b:r.bottom},p=e.parentElement;
    while(p){ const s=getComputedStyle(p);
      if(s.overflowX!=='visible'||s.overflowY!=='visible'){
        const q=p.getBoundingClientRect();
        box={l:Math.max(box.l,q.left),t:Math.max(box.t,q.top),r:Math.min(box.r,q.right),b:Math.min(box.b,q.bottom)};
        if(box.r-box.l<=0||box.b-box.t<=0) return null; }
      p=p.parentElement; }
    return box; };
  const pinned=e=>{let p=e;while(p&&p!==document.body){const s=getComputedStyle(p);
    if(s.position==='sticky'||s.position==='fixed')return true;p=p.parentElement;}return false;};
  const ctrls=[...document.querySelectorAll('button,input,a[href]')].filter(vis)
    .filter(e=>!e.closest('#taplist'))   /* off-screen until focused, by design */
    .filter(e=>!e.closest('#maker'));    /* a modal is meant to sit above the page */
  const B=[];
  ctrls.forEach(e=>{ const c=clipped(e); if(!c) return;
    if(c.r-c.l<6||c.b-c.t<6) return;     /* a sliver at a scroller's edge is not a collision */
    c.id=e.id||String(e.className).split(' ')[0]||e.tagName;
    c.txt=(e.textContent||'').trim().slice(0,16); c.el=e; c.pin=pinned(e); B.push(c); });
  const hits=[];
  for(let i=0;i<B.length;i++)for(let j=i+1;j<B.length;j++){
    const a=B[i],c=B[j];
    if(a.el.contains(c.el)||c.el.contains(a.el)) continue;
    if(a.pin!==c.pin) continue;
    const ox=Math.min(a.r,c.r)-Math.max(a.l,c.l), oy=Math.min(a.b,c.b)-Math.max(a.t,c.t);
    if(ox>3&&oy>3) hits.push(a.id+' "'+a.txt+'" over '+c.id+' "'+c.txt+'"'); }
  const W=document.documentElement.clientWidth,H=document.documentElement.clientHeight;
  const canScrollY=document.documentElement.scrollHeight>H+2;
  const off=B.filter(x=>x.r>W+2||x.l<-2||(!canScrollY&&(x.b>H+2||x.t<-2))).map(x=>x.id+' "'+x.txt+'"');
  return {overlaps:[...new Set(hits)],offscreen:[...new Set(off)]};
})()`;

const chapters = p => p.evaluate(() => document.querySelectorAll('.lvl,.prt,.rail button').length);
const openChapter = (p, i, app) => p.evaluate(i => document.querySelectorAll('.lvl,.prt,.rail button')[i].click(), i)
  .then(() => p.waitForTimeout(app === 'build-a-house' ? 500 : 1800));

const GRID = [[1900,1660],[1512,982],[1366,768],[1280,800],[1100,780],[940,700],[880,620],[820,1180],[600,900],[390,844],[844,390]];
const WIDTHS = []; for (let w = 320; w <= 2000; w += 60) WIDTHS.push(w);

/* PLAYWRIGHT_CHROMIUM_PATH lets a sandbox or CI image point at a Chromium it
   already has, instead of downloading another one. Unset on a normal machine. */
const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const problems = [];
const note = (app, vp, where, r) => {
  if (r.overlaps.length) problems.push(`${app} @ ${vp} ${where}: ${r.overlaps.slice(0,3).join('; ')}`);
  if (r.offscreen.length) problems.push(`${app} @ ${vp} ${where}: off screen — ${r.offscreen.slice(0,3).join('; ')}`);
};

await Promise.all(APPS.map(async app => {
  /* 1. every chapter at a spread of real device sizes */
  for (const [width, height] of GRID) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${app}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const n = await chapters(p);
    for (let i = 0; i < n; i++) { await openChapter(p, i, app); note(app, `${width}x${height}`, `chapter ${i}`, await p.evaluate(PROBE)); }
    await ctx.close();
  }
  /* 2. the last chapter (widest buttons) across a continuous range of widths */
  for (const height of [760, 420]) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${app}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const n = await chapters(p);
    await openChapter(p, n - 1, app);
    for (const width of WIDTHS) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(150);
      note(app, `${width}x${height}`, 'last chapter', await p.evaluate(PROBE));
    }
    await ctx.close();
  }
}));

await browser.close();
server.close();

if (problems.length) {
  console.error(`FAIL — ${problems.length} layout problems\n`);
  problems.slice(0, 40).forEach(p => console.error('  ' + p));
  if (problems.length > 40) console.error(`  …and ${problems.length - 40} more`);
  process.exit(1);
}
console.log(`PASS — ${APPS.length} tools, every chapter at ${GRID.length} sizes, plus ${WIDTHS.length} widths x 2 heights. No control overlaps another or leaves the screen.`);
