# Phase Shift Bargraph

A single-page web app: an animated bar of little rectangles that fills left to right
through six stages — Requirement, Design, Produce, Test, Qualify, Supply.

Open `index.html` in any browser. No build step, no dependencies.

The bar is drawn on a canvas, so the same renderer that runs on screen is what the
video export records.

## Controls

| Control | Range | Notes |
| --- | --- | --- |
| Cycle time | 3–60 s | Duration of one full left-to-right sweep |
| Rectangles | 6–120 | Stepped in sixes so stage edges land on rectangle edges |
| Bar width | 280–1400 px | Clamped to the space available |
| Rectangle height | 12–180 px | The canvas grows and shrinks with it |
| Spacing | 0–24 px | Gap between rectangles; capped so a rectangle always remains |
| Colour | 6 presets + picker | Drives the lit rectangles, active stage number and name |
| Typeface | 6 faces | Applies to the bar labels and the headline |
| Stages | 2–6 | How many of the six milestones are active |
| Reveal by stage | Checkbox | Each stage's rectangles pop in together, not one by one |
| Stage names | 6 fields | Rename any stage; the bar updates live |
| Background | Auto + 5 presets + picker | Auto follows the page theme; a custom colour keeps its own text contrast |
| Hide text | Checkbox | Drops the numbers and names, leaving just the bar |
| Transport | Pause / Restart / Loop | Loop holds at the end for a beat, then resets |
| Record video | 1×–4× resolution | Records one full sweep in real time, then offers the file |

Each stage owns an equal share of the bar and shows only its number and name. When the
fill enters a stage, its label lifts and scales and turns the bar colour; stages already
cleared stay at full contrast, stages ahead stay muted.

The Stages slider (2–6) trims the milestone count down from the full six —
Requirement, Design, Produce, Test, Qualify, Supply — by using the first N. The other
name fields stay filled in and just step out of the way, so raising the count again
doesn't lose anything already typed.

By default the bar sweeps continuously, rectangle by rectangle. Reveal by stage changes
that: instead of filling gradually, all of a stage's rectangles grow in together the
instant that stage begins, so the bar advances in discrete blocks in time with the
stage labels rather than a continuous crawl.

Recording uses `MediaRecorder` on the canvas stream: MP4 where the browser supports it,
otherwise WebM. Above roughly HD dimensions it goes to VP9/WebM outright, since the
baseline H.264 profile most browsers expose can't encode much past that. It runs in
real time, so a 60 second cycle takes 60 seconds to capture, and the tab must stay in
front.

Export resolution is a separate multiplier (1×–4×) from the on-screen bar width, so a
compact bar on the page can still export at up to 3840px on its longest side — the
canvas is only resized for the duration of the recording, and the page layout doesn't
change. The controls that affect its dimensions (width, rectangle height, spacing,
count, typeface, resolution) are locked while a recording is in progress.

Settings persist per browser via `localStorage`, animation is suppressed under
`prefers-reduced-motion`, and light and dark themes are both defined.
