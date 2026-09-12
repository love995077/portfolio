/* Headless render checks: scroll to every film caption hold + each brand
   section and save a screenshot. Canvas scroll-film pages can't be verified
   through a normal browser tab (a backgrounded tab suspends rAF, so the
   canvas reads blank), so verification runs through a real headless render.

   usage: NODE_PATH=<puppeteer-core dir> node tools/shoot.js [w] [h] [tag] */
const fs = require("fs");
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://127.0.0.1:4190/";
const OUT = "work/shots";
const SECTIONS = ["story", "journey", "work", "skills", "credentials", "gallery", "connect"];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  page.on("requestfailed", (r) => errors.push("failed: " + r.url() + " " + (r.failure()?.errorText || "")));
  page.on("response", (r) => r.status() >= 400 && errors.push("HTTP " + r.status() + ": " + r.url()));

  const w = Number(process.argv[2] || 1512);
  const h = Number(process.argv[3] || 950);
  const tag = process.argv[4] || "d";
  await page.setViewport({ width: w, height: h });
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 180000 });
  await page.waitForFunction("typeof state !== 'undefined' && state.ready", { timeout: 180000 });

  const trackH = await page.evaluate("document.getElementById('track').offsetHeight");
  // read the caption windows off the DOM so shots always track the current calibration
  const caps = await page.evaluate(
    "[...document.querySelectorAll('.caption')].map(e=>({hold:+e.dataset.hold, text:(e.querySelector('h1,h2')||{}).innerText||''}))"
  );

  for (const c of caps) {
    const y = Math.round(Math.max(0, c.hold) * (trackH - h));
    await page.evaluate((y) => scrollTo(0, y), y);
    await new Promise((r) => setTimeout(r, 900)); // let the frame lerp settle + decode
    const vis = await page.evaluate(
      "[...document.querySelectorAll('.caption')].filter(e=>+e.style.opacity>0.5).length"
    );
    const name = String(c.hold).replace("0.", "p").replace("-", "neg");
    await page.screenshot({ path: `${OUT}/${tag}-film-${name}.png` });
    console.log(`film ${String(c.hold).padStart(6)} → ${vis} caption(s) visible | ${c.text.replace(/\n/g, " / ")}`);
  }

  for (const id of SECTIONS) {
    const ok = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.scrollIntoView();
      return true;
    }, id);
    if (!ok) { errors.push("missing section #" + id); continue; }
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}/${tag}-sec-${id}.png` });
  }

  // nav must be showing once we're past the film
  const navOn = await page.evaluate("document.getElementById('brandnav').classList.contains('on')");
  const unrevealed = await page.evaluate("document.querySelectorAll('[data-reveal]:not(.in)').length");
  console.log(`\nnav visible after film: ${navOn}`);
  console.log(`un-revealed blocks:     ${unrevealed}`);
  console.log(errors.length ? "\nISSUES:\n" + [...new Set(errors)].join("\n") : "\nno console errors, no failed requests");
  await browser.close();
})();
