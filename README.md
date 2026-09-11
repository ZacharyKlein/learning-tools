# Learning Tools

Small, playful, single-file web pages for big ideas. Served with GitHub Pages at
**https://zacharyklein.github.io/learning-tools/**

| Tool | Grades | |
|---|---|---|
| **Zoom Out!** | 1–3 | [zoom-out/](https://zacharyklein.github.io/learning-tools/zoom-out/) |
| **Inside a Tree** | 3–4 | [inside-a-tree/](https://zacharyklein.github.io/learning-tools/inside-a-tree/) |
| **Forest Elevator** | 1–3 | [forest-elevator/](https://zacharyklein.github.io/learning-tools/forest-elevator/) |
| **How a Car Works** | 3–4 | [how-a-car-works/](https://zacharyklein.github.io/learning-tools/how-a-car-works/) |
| **Flower Explorer** | K–1 | [flower-explorer/](https://zacharyklein.github.io/learning-tools/flower-explorer/) |
| **Flyway** | 3–4 | [flyway/](https://zacharyklein.github.io/learning-tools/flyway/) |
| **Build a House** | 3–4 | [build-a-house/](https://zacharyklein.github.io/learning-tools/build-a-house/) |
| **Under Your Feet** | 1–3 | [under-your-feet/](https://zacharyklein.github.io/learning-tools/under-your-feet/) |
| **Egg to Wings** | 1–3 | [egg-to-wings/](https://zacharyklein.github.io/learning-tools/egg-to-wings/) |

What each one is about lives in the `TOOLS` array in the root `index.html`, and
the landing page renders its cards from there. This table deliberately does not
repeat those descriptions — it used to, and the two copies had already drifted
apart in wording and order.

## How it's organized

Each tool lives in its own folder as a self-contained `index.html` (no build step, no dependencies), so it works from the site, from a local double-click, or from a USB stick in a classroom.

The root `index.html` is the landing page. Its cards are rendered from a single `TOOLS` array near the bottom of that file, and the sort buttons (grade / A–Z / newest) and the grade and subject filters are all built from that same data. To add a tool, drop its folder in and add one entry:

```js
{
  slug: "my-tool", title: "My Tool", added: "2026-09-09T12:00",
  grades: [3, 4], subjects: ["Science"], tag: "Interactive", cta: "🔭 Explore",
  blurb: "One or two sentences.",
  art: [["🔭",34],["🌙",28],["⭐",44]]   // emoji + font size for the card banner
}
```

`grades` is `[low, high]`, with `0` for kindergarten; it drives both the chip and the grade filter. A new value in `subjects` gets its own filter button automatically.

## House rules

A child who has played one of these should already know how to play the next
one. Every tool after the seventh inherits these.

**Words.** One label per action, everywhere: **Back** and **Next**;
**🔁 Back to the start** on the last chapter (it wraps round — say so, don't
say "start over", which sounds like it throws work away); **✅ Badge earned**
for a finished challenge; **↺ Reset the &lt;thing&gt;** only for a control that
genuinely resets a simulation, and name the thing it resets.

Two deliberate exceptions, because they carry the metaphor the tool is built
on: Forest Elevator says **GO DOWN / Up / STEP OUT**, and Zoom Out says
**ZOOM OUT! / Zoom in**.

**The picture.** Every chapter sets a hint naming what to tap there, and it
stays visible at every screen size — it is the only thing that says the picture
is tappable, and about half of all challenge steps require a tap.

**Touch.** Every interactive target is at least 44px at phone and tablet width.
Canvas hit radii too, not just DOM buttons.

**The dock.** The chapter rail gets a row of its own and scrolls inside it; the
buttons and the chapter controls share the row below. Never size the rail's grid
column to its content — an `auto` track sizes to max-content and will shove the
other columns into each other. `tests/layout-check.mjs` exists because that
shipped once.

**Chapter state.** Wipe all transient state on every move, then let the chapter
being entered switch on what it needs and the chapter being left put back what
it borrowed. No chains of `if (id !== 'roots')` — every new control means
another negative to remember, and forgetting one is how a lifted log ended up
hiding the caption on every floor below it.

**Progress.** Badges persist to `localStorage` under
`learningTools.<tool>.badges`, restored silently. The ↺ in the badge meter
clears them so a second child can start fresh; it takes two taps.

**Read-aloud** (Grades 1–3 and below: Flower Explorer, Forest Elevator, Zoom
Out). Starts quiet — a voice talking as the page loads is a surprise in a
classroom and talks over whoever is helping. The choice is remembered under
`learningTools.<tool>.readAloud`. Each panel's own 🔊 reads that panel on demand
even while quiet.

**Announcements.** The badge meter, the challenge feedback line and the toast
are all `aria-live` regions.

**Keyboard.** Each chapter renders a list of buttons named for the things in the
picture, off-screen until focused, wired to the same handler as a tap — so a
"tap the ..." challenge step can be answered without a pointer. Done in Flower
Explorer and Forest Elevator, Under Your Feet and Egg to Wings; the other five still need it.

**Testing.** Every tool exposes `window.<toolName>` for the headless tests. Run
`node tests/layout-check.mjs` before pushing.

## Publishing

GitHub Pages serves the `main` branch from the repository root (Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`). Every push to `main` goes live within a minute or two.
