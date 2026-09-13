/* =====================================================================
   smoke-check — does each tool still work end to end?

   Walks every chapter of every tool and checks the things that have
   actually broken here before: a caption that vanished, a tap prompt that
   was hidden, a challenge with no right answer, badges that did not
   survive a reload, and console errors nobody saw.

   Run:  npm i -D playwright && node tests/smoke-check.mjs
   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome skips the browser download.
   Exits non-zero on any failure.
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
const READ_ALOUD = ['flower-explorer', 'forest-elevator', 'zoom-out', 'under-your-feet', 'egg-to-wings'];   // grades 1-3 and below

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

const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

await Promise.all(APPS.map(async app => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  /* a blocked or offline web font is the environment's problem, not the tool's */
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push(m.text().slice(0, 120)); });
  await p.goto(`${BASE}/${app}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  /* read-aloud tools open quiet */
  if (READ_ALOUD.includes(app)) {
    const label = await p.evaluate(() => { const b = document.getElementById('btnRead'); return b && b.getAttribute('aria-pressed'); });
    check(label === 'false', `${app}: read-aloud should start quiet, aria-pressed was ${label}`);
  }

  /* every chapter: a caption with words in it, and a tap prompt if the tool has one */
  const n = await p.evaluate(() => document.querySelectorAll('.lvl,.prt,.rail button').length);
  check(n > 0, `${app}: no chapter buttons found`);
  for (let i = 0; i < n; i++) {
    await p.evaluate(i => document.querySelectorAll('.lvl,.prt,.rail button')[i].click(), i);
    /* wait for the scene to settle rather than guessing: Zoom Out's tween runs up
       to five seconds on a big jump between scales */
    await p.waitForFunction(() => {
      const h = document.querySelector('.hint');
      const maker = document.getElementById('maker');
      if (maker && !maker.hidden) return true;            /* a modal owns the screen */
      if (!h) return true;                                 /* this tool has no tap prompt */
      return !h.hidden && getComputedStyle(h).display !== 'none';
    }, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(app === 'build-a-house' ? 400 : 700);
    const r = await p.evaluate(() => {
      const shown = e => { if (!e) return null; const b = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !e.hidden; };
      const cap = document.querySelector('.caption'), hint = document.querySelector('.hint');
      const maker = document.getElementById('maker');
      return { cap: shown(cap), capWords: (cap ? cap.innerText : '').trim().length,
               hint: shown(hint), hintWords: (hint ? hint.innerText : '').trim().length,
               modalOpen: !!(maker && !maker.hidden) };
    });
    check(r.cap !== false, `${app} chapter ${i}: caption is hidden`);
    check(r.capWords > 10, `${app} chapter ${i}: caption is empty`);
    if (r.hint !== null && !r.modalOpen) {
      check(r.hint === true, `${app} chapter ${i}: tap prompt is hidden`);
      check(r.hintWords > 3, `${app} chapter ${i}: tap prompt is empty`);
    }
  }

  /* every chapter has a challenge, and every multiple-choice step has a right answer */
  const quests = await p.evaluate(() => {
    const G = window.zoomOut || window.insideATree || window.forestElevator || window.howACarWorks
           || window.flowerExplorer || window.flyway || window.buildAHouse
           || window.underYourFeet || window.eggToWings || window.cityExplorer;
    if (!G) return { error: 'no test global' };
    const list = G.CHAPTERS || G.LEVELS || G.CH || G.chapters || [];
    return list.map(c => {
      let steps = Array.isArray(c.quest) ? c.quest : null;   /* build-a-house keeps them on the chapter */
      if (!steps && G.QUESTS && G.QUESTS[c.id]) {          /* Zoom Out exposes the whole map */
        const q = G.QUESTS[c.id];
        const got = typeof q === 'function' ? q() : q;
        if (got && Array.isArray(got.steps)) steps = got.steps;
      }
      if (!steps && G.startQuest) {
        try { G.startQuest(c.id); const a = G.quest && G.quest.active; if (a && Array.isArray(a.steps)) steps = a.steps; } catch (e) {}
      }
      if (!steps) return { id: c.id, steps: null };
      return { id: c.id, steps: steps.map(s => {
        const opts = s.options || s.opts;
        if (!opts) return 'action';
        return opts.filter(o => o.ok).length;
      }) };
    });
  });
  if (quests.error) check(false, `${app}: ${quests.error}`);
  else quests.forEach(q => {
    check(q.steps !== null, `${app}: chapter "${q.id}" has no challenge`);
    (q.steps || []).forEach((s, i) => check(s === 'action' || s > 0,
      `${app}: chapter "${q.id}" step ${i + 1} is multiple choice with no correct answer`));
  });

  /* a badge survives a reload */
  const badgeId = await p.evaluate(() => {
    const G = window.zoomOut || window.insideATree || window.forestElevator || window.howACarWorks
           || window.flowerExplorer || window.flyway || window.buildAHouse
           || window.underYourFeet || window.eggToWings || window.cityExplorer;
    const list = G.CHAPTERS || G.LEVELS || G.CH || G.chapters || [];
    if (!list[0] || !G.award) return null;
    G.award(list[0].id); return list[0].id;
  });
  if (badgeId) {
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    const lit = await p.evaluate(() => document.querySelectorAll('.badge.won').length);
    check(lit > 0, `${app}: badge "${badgeId}" did not survive a reload`);
  } else check(false, `${app}: could not award a badge through the test global`);

  check(errs.length === 0, `${app}: console errors — ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}));

await browser.close();
server.close();

if (fails.length) {
  console.error(`FAIL — ${fails.length} problems\n`);
  fails.slice(0, 30).forEach(f => console.error('  ' + f));
  if (fails.length > 30) console.error(`  …and ${fails.length - 30} more`);
  process.exit(1);
}
console.log(`PASS — ${APPS.length} tools: captions and tap prompts on every chapter, every challenge answerable, badges survive a reload, read-aloud starts quiet, no console errors.`);
