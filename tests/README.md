# tests

    npm i -D playwright
    node tests/layout-check.mjs
    node tests/smoke-check.mjs

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
