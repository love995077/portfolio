# Love Kumar Todawat — Portfolio

An Apple-style scroll-film portfolio: a 69-second animated career film scrubbed
frame-by-frame by scroll position, flowing into a full portfolio page below it.

**AI/ML Engineer — Udaipur, India**
[lovetodawat15@gmail.com](mailto:lovetodawat15@gmail.com) ·
+91 80055 03192 ·
[LinkedIn](https://www.linkedin.com/in/love-todawat) ·
[GitHub](https://github.com/love995077)

---

## How it works

`#track` is a tall (1100vh) div holding a `position: sticky` full-viewport
canvas. Scroll progress (`scrollY / (trackHeight - viewportHeight)`) maps to a
frame index across 826 WebP stills. A time-based lerp (`1 - exp(-dt*14)`)
smooths the playhead so fast flicks glide instead of strobing.

Frames are fetched as compressed blobs up front; only a sliding window of
±120 decoded `ImageBitmap`s exists at once, so memory stays flat on mobile.

Captions are absolutely-positioned divs carrying `data-in` / `data-hold` /
`data-out` scroll fractions; opacity is computed per frame.

## The film

Nine 8-second clips, crossfaded 0.4s, sliced at 12fps and 1152px wide →
**826 frames, 28 MB**. The source footage is local (`assets/clips/`, gitignored)
— no AI generation was run for this build, so it cost zero image/video credits.

| # | Chapter | Starts at | What it shows |
|---|---------|-----------|---------------|
| 1 | `origin` | 0.000 | College workshop — B.Tech, Mining Engineering |
| 2 | `pivot` | 0.110 | Riding out under the AI/ML Engineer gate |
| 3 | `craft` | 0.221 | Udaipur lakeside — "Python · SQL · GenAI" |
| 4 | `role` | 0.331 | City street, the Warrgyizmorsch billboard |
| 5 | `identity` | 0.442 | Arrival — the name and summary panel |
| 6 | `certs` | 0.552 | Lobby — Deep Learning / NLP holograms |
| 7 | `expertise` | 0.663 | Elevator — multi-agent, RAG, NL-to-SQL |
| 8 | `arrival` | 0.773 | The office floor |
| 9 | `projects` | 0.884 | The desk — project panels light up |

### Two quirks that drive the layout

1. **The footage carries its own burnt-in text** across the upper and centre
   thirds (neon signs, billboards, holographic HUD panels). Site captions are
   therefore anchored to the **bottom edge** and swap sides (`.cap-bl` /
   `.cap-br`) in chapters 5 and 7, where the film's own panel occupies the
   left. Moving a caption up or across without checking the frame behind it
   will collide with the film's text.
2. **Frames are 16:9, not the template's 4:3.** Wide viewports get contain-fit
   with a vignette hiding the seam; narrow/portrait viewports blend toward
   cover-fit (`drawFrame` in `main.js`) so the film fills a phone screen
   instead of floating between two large bars.

## Layout

```
index.html          the page — captions, brand sections, all styling
main.js             the scrubber engine — edit rarely
frames/             826 WebP frames + frames.json manifest (shipped)
stills/             6 re-framed crops for the page below the film (shipped)
assets/clips/       source mp4s (gitignored — not needed to serve)
tools/              build + verification scripts
```

## Rebuilding

```bash
python -m venv venv
./venv/Scripts/python.exe -m pip install pypdf Pillow

# re-slice the film (rewrites frames/ and prints chapter scroll fractions)
./venv/Scripts/python.exe tools/build_master.py "$(cat tools/film.json)"

# re-cut the brand-page stills from the frames
./venv/Scripts/python.exe tools/build_stills.py
```

`tools/film.json` holds fps, width, WebP quality, crossfade and the chapter
list. If you change `fps` or `xfade`, the printed chapter fractions move and
**every caption's `data-in/hold/out` in `index.html` must be recalibrated**.

## Serving

```bash
./serve.sh          # http://localhost:4190
```

Fully static — any file server works. There is no build step.

## Verifying

A canvas scroll-film page can't be checked in a normal browser tab: a
backgrounded tab suspends `requestAnimationFrame`, so the canvas reads blank
and captions never update. Verify through a real headless render instead:

```bash
NODE_PATH=<dir containing puppeteer-core> node tools/shoot.js 1512 950 d
NODE_PATH=<dir containing puppeteer-core> node tools/shoot.js 390 844 m
```

It scrolls to every caption's hold point plus each page section, reports how
many captions are visible at each stop (should always be exactly 1), checks the
nav appears after the film, counts un-revealed blocks, and fails loudly on
console errors or failed requests. Screenshots land in `work/shots/`.
