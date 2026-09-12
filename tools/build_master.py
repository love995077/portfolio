#!/usr/bin/env python3
"""
Crossfade-concat chapter clips into a master film, slice into WebP scrub
frames, and emit a manifest + chapter scroll fractions for captions.

  python3 build_master.py '<config-json>'

Config:
{
  "clips_dir":  "/abs/path/assets/clips",
  "frames_dir": "/abs/path/frames",          # site's frames folder
  "master":     "/abs/path/assets/master.mp4",
  "fps": 12, "width": 1400, "xfade": 0.4,
  "chapters": [
    {"name": "beans",    "file": "ch1-beans.mp4"},
    {"name": "assembly", "file": "ch2-explode.mp4", "reverse": true},
    ...
  ]
}

Reversed chapters are cached as <file>-rev.mp4. ffmpeg builds without a
WebP encoder are handled by extracting PNG and converting via Pillow.
Prints per-chapter scroll fractions — use them to calibrate caption
data-in/hold/out values in the site.
"""

import json
import os
import sys as _sys

try:  # Windows consoles default to cp1252 and choke on the arrow glyphs
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
import subprocess
import sys

from PIL import Image


def run(cmd):
    print("+", " ".join(cmd[:8]), "..." if len(cmd) > 8 else "")
    subprocess.run(cmd, check=True)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def main():
    cfg = json.loads(sys.argv[1])
    clips_dir = cfg["clips_dir"]
    frames_dir = cfg["frames_dir"]
    master = cfg["master"]
    fps = cfg.get("fps", 12)
    width = cfg.get("width", 1400)
    xfade = cfg.get("xfade", 0.4)

    inputs = []
    for ch in cfg["chapters"]:
        src = os.path.join(clips_dir, ch["file"])
        if not os.path.exists(src):
            sys.exit(f"missing clip: {src}")
        if ch.get("reverse"):
            revd = src.replace(".mp4", "-rev.mp4")
            if not os.path.exists(revd):
                run(["ffmpeg", "-y", "-v", "error", "-i", src,
                     "-vf", "reverse", "-an", "-crf", "16", revd])
            src = revd
        inputs.append((ch["name"], src, duration(src)))

    args = ["ffmpeg", "-y", "-v", "error"]
    for _, src, _ in inputs:
        args += ["-i", src]

    # normalize every input to the first clip's geometry — xfade requires
    # identical sizes/fps and clips can differ (pro=1080p, standard=720p)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v",
         "-show_entries", "stream=width,height", "-of", "csv=p=0",
         inputs[0][1]], capture_output=True, text=True, check=True)
    W, H = probe.stdout.strip().split(",")
    filters = []
    for i in range(len(inputs)):
        filters.append(
            f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1[n{i}]")

    meta = [{"name": inputs[0][0], "start": 0.0}]
    prev, prev_end = "[n0]", inputs[0][2]
    for i in range(1, len(inputs)):
        name, _, dur = inputs[i]
        offset = prev_end - xfade
        out = f"[v{i}]"
        filters.append(
            f"{prev}[n{i}]xfade=transition=fade:duration={xfade}:offset={offset:.4f}{out}")
        meta.append({"name": name, "start": offset})
        prev, prev_end = out, offset + dur
    total = prev_end

    os.makedirs(os.path.dirname(master), exist_ok=True)
    args += ["-filter_complex", ";".join(filters), "-map", prev]
    args += ["-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", master]
    run(args)

    os.makedirs(frames_dir, exist_ok=True)
    for f in os.listdir(frames_dir):
        if f.endswith((".webp", ".png")):
            os.remove(os.path.join(frames_dir, f))
    run(["ffmpeg", "-y", "-v", "error", "-i", master,
         "-vf", f"fps={fps},scale={width}:-2",
         os.path.join(frames_dir, "frame_%04d.png")])

    pngs = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))
    for f in pngs:
        p = os.path.join(frames_dir, f)
        Image.open(p).save(p.replace(".png", ".webp"), "WEBP",
                           quality=cfg.get("quality", 82), method=6)
        os.remove(p)

    manifest = {"count": len(pngs), "pattern": "frames/frame_%04d.webp"}
    with open(os.path.join(frames_dir, "frames.json"), "w") as f:
        json.dump(manifest, f)

    size = sum(os.path.getsize(os.path.join(frames_dir, f))
               for f in os.listdir(frames_dir)) / 1e6
    print(f"\nmaster: {total:.1f}s → {len(pngs)} frames, {size:.1f} MB")
    print("\nchapter scroll fractions (calibrate captions with these):")
    for m in meta:
        print(f"  {m['name']:<12} starts at {m['start'] / total:.3f}")


if __name__ == "__main__":
    main()
