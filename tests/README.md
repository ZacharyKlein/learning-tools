# tests

    npm i -D playwright
    node tests/layout-check.mjs
    node tests/smoke-check.mjs
    node tests/tap-check.mjs

`smoke-check.mjs` walks every chapter of every tool and checks the things that
have actually broken here: a caption that vanished, a tap prompt that was
hidden, a challenge with no right answer, badges that did not survive a reload,
read-aloud that did not start quiet, and console errors nobody saw.

`layout-check.mjs` opens every tool, walks every chapter, and checks that no
interactive control overlaps another or sits off the edge of the screen — at
eleven real device sizes, and again across every width from 320 to 2000 px at
two heights. It serves the repo itself, so nothing else needs to be running.

If your environment already has a Chromium, point at it with
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome` and skip the browser download.

It exists because a layout bug of exactly this kind shipped: giving the chapter
rail labels made its grid column size to its content, which squeezed the
chapter controls until they sat on top of the Challenge button. It looked fine
at the window the author had open and was broken at most other sizes.

Two things the check deliberately tolerates, because they are not bugs:
a chip scrolled out of the horizontally scrolling rail (every element is
measured clipped by whatever clips it), and a pinned bar floating over the page
as it scrolls — though it does verify that nothing stays buried under one.

`tap-check.mjs` asks a different question from the other two: not whether a
control is in the right place, but whether the things *in the picture* can be
pressed at all. For every item in every chapter of the tools that expose
`items()` and `hitTest()`, it samples points across that item's own hit shape
and counts how many of them actually come back as that item. The bar is a
quarter of the shape — deliberately loose, because a butterfly drifting over a
flower bed is allowed to take the tap where it is, and deliberately not zero,
because something covered everywhere has nowhere left to press. It runs twice
per chapter, once on a fresh scene and once after every chapter control has
been used, since most of these pictures only grow their small items once a
child has pressed something.

It exists because that shipped. In Egg to Wings the caterpillars sat inside
the milkweed's rectangle and the milkweed was listed first, so "tap a
caterpillar" — a challenge step — opened the milkweed card, and that badge
could not be earned with a pointer at all. The same check then found sixteen
more of the same kind across both tools, including a layer map in Under Your
Feet that was indexed inside-out: tapping the middle of the Earth opened
"The crust" and tapping the ground opened "Inner core". Nothing on screen
looked wrong, because the drawing does not use those numbers.

The rule it encodes, for anything added later: **small things first, big
background regions last.** A hit list is tried in order and the first match wins.

It also prints hit shapes narrower than about 118 units of the 1000x620 design
space — roughly a 44px fingertip on the narrowest phone the layout check uses —
as warnings rather than failures. Some are thin by nature (the sea is a thin
layer; so is oceanic crust) and fattening them would only create the overlaps
this check is here to prevent. All of them are reachable from the keyboard list.
