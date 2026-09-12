/* LOVE KUMAR TODAWAT — Apple-style scroll film
   Canvas image-sequence scrubber: scroll position drives frame index.
   Frames are kept as compressed blobs; only a sliding window around the
   current frame is decoded to ImageBitmaps (keeps RAM sane on mobile). */

const canvas = document.getElementById("film");
const ctx = canvas.getContext("2d");
const track = document.getElementById("track");
const loader = document.getElementById("loader");
const loadbar = document.getElementById("loadbar");
const scrollCue = document.getElementById("scroll-cue");
const captions = [...document.querySelectorAll(".caption")];

const KEEP = 120;      // evict decoded bitmaps further than this from the playhead
const AHEAD = 30;      // decode this many frames ahead (scroll-direction weighted)

const state = {
  blobs: [],           // Blob per frame (compressed, ~45KB each)
  bitmaps: new Map(),  // index → ImageBitmap (decoded window only)
  count: 0,
  pattern: "",
  current: -1,
  target: 0,
  smooth: 0,
  dir: 1,
  ready: false,
  decoding: new Set(),
  fetching: new Set(),
};

/* ── loading ───────────────────────────────────────────── */

async function loadManifest() {
  const res = await fetch("frames/frames.json");
  if (!res.ok) throw new Error("no manifest");
  return res.json(); // { count, pattern }
}

function frameURL(i) {
  return state.pattern.replace("%04d", String(i + 1).padStart(4, "0"));
}

async function fetchBlob(i) {
  if (state.blobs[i]) return state.blobs[i];
  // A burst of ~800 parallel requests can exhaust local sockets
  // (ERR_NO_BUFFER_SPACE); one retry turns that into a blip rather than a
  // frame that stays missing for the whole session.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(frameURL(i));
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.blobs[i] = await res.blob();
      return state.blobs[i];
    } catch (err) {
      if (attempt === 1) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

async function decode(i) {
  if (state.bitmaps.has(i) || state.decoding.has(i) || !state.blobs[i]) return;
  state.decoding.add(i);
  try {
    const bmp = await createImageBitmap(state.blobs[i]);
    state.bitmaps.set(i, bmp);
  } catch { /* transient decode failure — retried next tick */ }
  state.decoding.delete(i);
}

function want(i) {
  if (i < 0 || i >= state.count) return;
  // a blob the background loader gave up on: refetch it once we actually
  // scroll near it, so a transient network failure self-heals
  if (!state.blobs[i]) {
    if (!state.fetching.has(i)) {
      state.fetching.add(i);
      fetchBlob(i).catch(() => {}).finally(() => state.fetching.delete(i));
    }
    return;
  }
  decode(i);
}

function manageWindow(center) {
  // decode ahead in scroll direction, a little behind too
  for (let d = 0; d <= AHEAD; d++) {
    want(center + d * state.dir);
    want(center - Math.min(d, 8) * state.dir);
  }
  if (state.bitmaps.size > KEEP * 2) {
    for (const [idx, bmp] of state.bitmaps) {
      if (Math.abs(idx - center) > KEEP) {
        bmp.close();
        state.bitmaps.delete(idx);
      }
    }
  }
}

async function preload() {
  const { count } = state;
  const EAGER = Math.min(Math.ceil(count * 0.15), 80);

  // eager: fetch the opening chapter and decode its start — gates the loader
  let done = 0;
  await Promise.all(
    Array.from({ length: EAGER }, (_, i) =>
      fetchBlob(i).then(() => {
        done++;
        loadbar.style.width = `${(done / EAGER) * 100}%`;
      })
    )
  );
  await decode(0);
  state.ready = true;
  loader.classList.add("done");

  // background: fetch remaining blobs in order, limited concurrency
  let next = EAGER;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < count) {
        const i = next++;
        try { await fetchBlob(i); } catch { /* refetched on demand */ }
      }
    })
  );
}

/* ── drawing ───────────────────────────────────────────── */

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  state.current = -1; // force redraw
}

function nearestDecoded(i) {
  if (state.bitmaps.has(i)) return i;
  for (let d = 1; d < state.count; d++) {
    if (state.bitmaps.has(i - d)) return i - d;
    if (state.bitmaps.has(i + d)) return i + d;
  }
  return -1;
}

function drawFrame(i) {
  const j = nearestDecoded(i);
  if (j < 0) return;
  const bmp = state.bitmaps.get(j);
  const cw = canvas.width, ch = canvas.height;
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, cw, ch);
  // Frames are 16:9. Wide viewports get contain-fit (vignette hides the seam);
  // narrow/portrait ones blend toward cover so the film still fills the screen
  // instead of floating between two huge bars.
  const contain = Math.min(cw / bmp.width, ch / bmp.height) * 1.04;
  const cover = Math.max(cw / bmp.width, ch / bmp.height);
  const t = Math.min(1, Math.max(0, (1.35 - cw / ch) / 0.55));
  const s = contain + (cover - contain) * t;
  const w = bmp.width * s, h = bmp.height * s;
  ctx.drawImage(bmp, (cw - w) / 2, (ch - h) / 2, w, h);
  state.current = j;
}

/* ── scroll mapping ────────────────────────────────────── */

function progress() {
  const max = track.offsetHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function updateCaptions(p) {
  for (const el of captions) {
    const tIn = +el.dataset.in, tHold = +el.dataset.hold, tOut = +el.dataset.out;
    const rise = Math.max((tHold - tIn) * 0.4, 0.008);
    const fall = Math.max((tOut - tHold) * 0.6, 0.008);
    let o = 0;
    if (p >= tIn && p <= tOut) {
      o = Math.min((p - tIn) / rise, 1) * Math.min((tOut - p) / fall, 1);
      o = Math.min(Math.max(o, 0), 1);
    }
    el.style.opacity = o.toFixed(3);
    const drift = (p - tHold) * -40; // gentle parallax
    el.style.transform = `${transformBase(el)} translateY(${drift.toFixed(1)}px)`;
  }
  scrollCue.style.opacity = p < 0.015 ? 1 : 0;
}

function transformBase(el) {
  if (el.classList.contains("cap-center")) return "translate(-50%, -50%)";
  if (el.classList.contains("cap-top") || el.classList.contains("cap-bottom")) return "translateX(-50%)";
  // bottom-anchored captions sit clear of the film's own burnt-in HUD text
  if (el.classList.contains("cap-bl") || el.classList.contains("cap-br")) return "translateY(0)";
  return "translateY(-50%)";
}

/* ── main loop ─────────────────────────────────────────── */

let lastT = performance.now();
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.5) || 0.016;
  lastT = now;
  if (state.ready) {
    const p = progress();
    const prevTarget = state.target;
    state.target = p * (state.count - 1);
    if (state.target !== prevTarget) state.dir = state.target >= prevTarget ? 1 : -1;
    // time-based lerp: fast flicks glide, throttled tabs still converge
    const k = 1 - Math.exp(-dt * 14);
    state.smooth += (state.target - state.smooth) * k;
    if (Math.abs(state.target - state.smooth) < 0.5) state.smooth = state.target;
    const i = Math.round(state.smooth);
    manageWindow(i);
    if (i !== state.current) drawFrame(i);
    updateCaptions(p);
  }
  requestAnimationFrame(tick);
}

/* ── boot ──────────────────────────────────────────────── */

function devPlaceholder(msg) {
  loader.classList.add("done");
  const draw = () => {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#0d1420");
    g.addColorStop(1, "#05070a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(90,209,230,0.85)";
    ctx.font = `${16 * (window.devicePixelRatio || 1)}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
  };
  draw();
  window.addEventListener("resize", () => { resize(); draw(); });
}

window.addEventListener("resize", resize);
resize();

loadManifest()
  .then((m) => {
    state.count = m.count;
    state.pattern = m.pattern;
    state.blobs = new Array(m.count).fill(null);
    requestAnimationFrame(tick);
    return preload();
  })
  .catch(() => devPlaceholder("frames not built yet — run tools/build_master.py"));
