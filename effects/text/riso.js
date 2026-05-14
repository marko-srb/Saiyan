/* ============================================================
   RISO — text effect (static, layered patterns clipped to letters)

   Inspiration: CMYK-printed posters where each letter is filled
   with a stack of geometric patterns (diagonal lines, dots, plus
   signs, dashes) in different colors. Where layers overlap you
   get color mixing — the magenta + cyan + yellow charm of risograph
   prints.

   How it works:
     1. opentype.js parses the chosen font (using the existing
        REPEL_FONT_BUNDLE so this effect ships with every font local).
     2. For each line of typed text (split on '|'), we build a
        compound Path2D of all letter outlines.
     3. We use that path as a canvas clip region.
     4. Inside the clip, we draw THREE pattern layers — each with
        its own pattern type, color (palette slot), angle, and
        density. Layers stack with normal alpha (no special compositing
        so colors stay clean).

   Variant in this version:
     - Mode A: every letter shares the same pattern stack (uniform).
     - Mode B (per-letter randomization) is reserved for a later pass.

   Vector-clean: all primitives drawn with canvas paths (no images),
   so exports at any resolution stay sharp.
============================================================ */
(function () {
  'use strict';

  // ---- Font catalog (a slimmed mirror of Repel's, sharing the bundle) ----
  // Riso doesn't need per-weight selection (the letter is a clip;
  // the weight just changes the clip thickness). We expose one entry
  // per family using the Bold/heaviest weight when available, since
  // chunky letterforms hold patterns better than thin ones.
  const RISO_FONT_BUNDLE_KEY = {
    // family → bundle key. Heavy-weight preferred where available.
    'Inter':            'cm:Inter-Bold',
    'Source Serif':     'fonts/source-serif/SourceSerif4.ttf',
    'EB Garamond':      'fonts/eb-garamond/EBGaramond.ttf',
    'Aktiv Grotesk':    'fonts/aktiv-grotesk/AktivGrotesk-Bold.ttf',
    'Proxima Nova':     'fonts/proxima-nova/ProximaNova-Bold.otf',
    'Recoleta':         'fonts/recoleta/Recoleta-Bold.ttf',
    'DM Mono':          'fonts/dm-mono/DMMono-Regular.ttf',
    'Söhne Breit':      'fonts/sohne-breit/SohneBreit-Extrafett.otf',
    'Knockout':         'fonts/knockout/Knockout-50-Welterweight.otf',
    // Custom-mode fonts
    'Anton':            'cm:Anton',
    'Playfair Display': 'cm:Playfair',
    'Instrument Serif': 'cm:InstrumentSerif',
    'IBM Plex Mono':    'cm:IBMPlex-Bold',
  };

  const RISO_CUSTOM_FONTS = ['Inter', 'Anton', 'Instrument Serif', 'Playfair Display', 'IBM Plex Mono'];

  // Mirrors Repel's supported brand-font filter. Anything in
  // ctx.fonts that isn't in this list gets dropped from the
  // dropdown — same UX as Repel (silent filter; the brand falls
  // back to whatever it has that we support).
  const RISO_SUPPORTED = new Set([
    'Inter', 'Source Serif', 'EB Garamond', 'Aktiv Grotesk',
    'Proxima Nova', 'Recoleta', 'DM Mono', 'Söhne Breit', 'Knockout',
  ]);

  // ---- Patterns ----
  // Each pattern is a function (ctx, bbox, color, angle, density)
  // that draws a tile of the pattern across the given bounding box.
  // The caller has already pushed a clip region of letter shapes,
  // so we draw across the whole bbox and the clip masks it.
  //
  // Density slider value (1..100) maps to spacing between primitives:
  //   1   → loose (lots of negative space)
  //   100 → tight (heavy coverage)
  // The exact px range is per-pattern so each one looks balanced
  // across its own density extremes.
  const PATTERNS = {
    none: () => {},

    diagonalUp: (ctx, bbox, color, angle, density) => {
      // Spacing 4..40 px (tight..loose flipped: high density = tight)
      const spacing = mapDensity(density, 40, 4);
      drawLineGrid(ctx, bbox, color, angle + 45, spacing, 1.5);
    },

    diagonalDown: (ctx, bbox, color, angle, density) => {
      const spacing = mapDensity(density, 40, 4);
      drawLineGrid(ctx, bbox, color, angle - 45, spacing, 1.5);
    },

    horizontal: (ctx, bbox, color, angle, density) => {
      const spacing = mapDensity(density, 40, 4);
      drawLineGrid(ctx, bbox, color, angle, spacing, 1.5);
    },

    dots: (ctx, bbox, color, angle, density) => {
      // Dots: spacing 6..24 px, dot radius proportional.
      const spacing = mapDensity(density, 24, 6);
      const radius = Math.max(1.2, spacing * 0.18);
      drawShapeGrid(ctx, bbox, color, angle, spacing, (cx, cy) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    plus: (ctx, bbox, color, angle, density) => {
      // Plus signs: spacing 12..36 px, arm length proportional.
      const spacing = mapDensity(density, 36, 12);
      const armLen = spacing * 0.32;
      const armWid = Math.max(1.5, spacing * 0.10);
      drawShapeGrid(ctx, bbox, color, angle, spacing, (cx, cy) => {
        // Horizontal bar of plus
        ctx.fillRect(cx - armLen, cy - armWid / 2, armLen * 2, armWid);
        // Vertical bar of plus
        ctx.fillRect(cx - armWid / 2, cy - armLen, armWid, armLen * 2);
      });
    },

    dashes: (ctx, bbox, color, angle, density) => {
      // Short horizontal dashes in a grid. Dash length ~ spacing/2.
      const spacing = mapDensity(density, 28, 8);
      const dashLen = spacing * 0.5;
      const dashThick = Math.max(1.5, spacing * 0.16);
      drawShapeGrid(ctx, bbox, color, angle, spacing, (cx, cy) => {
        ctx.fillRect(cx - dashLen / 2, cy - dashThick / 2, dashLen, dashThick);
      });
    },
  };

  // Density slider (1..100) → linear interp between two pixel values.
  // Keep at a function so the per-pattern ranges stay readable.
  function mapDensity(v, atOne, atHundred) {
    const t = Math.max(0, Math.min(1, (v - 1) / 99));
    return atOne + (atHundred - atOne) * t;
  }

  // Draw an infinite grid of parallel lines across `bbox`, rotated
  // by `deg` around bbox center. Spacing is perpendicular distance
  // between lines. We oversize the line range so rotation doesn't
  // leave bare corners.
  function drawLineGrid(ctx, bbox, color, deg, spacing, thickness) {
    const cx = (bbox.x + bbox.w / 2);
    const cy = (bbox.y + bbox.h / 2);
    // Diagonal of bbox is the longest length any rotated line can need.
    const diag = Math.hypot(bbox.w, bbox.h) * 1.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(deg * Math.PI / 180);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'butt';
    // Draw lines from -diag to +diag in both axes, stepping by spacing
    // along Y. After rotation they cover the bbox.
    const half = diag / 2;
    for (let y = -half; y <= half; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw a grid of shapes, rotated. `drawShape(cx, cy)` is called
  // at each grid point with fillStyle already set.
  function drawShapeGrid(ctx, bbox, color, deg, spacing, drawShape) {
    const cx = (bbox.x + bbox.w / 2);
    const cy = (bbox.y + bbox.h / 2);
    const diag = Math.hypot(bbox.w, bbox.h) * 1.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(deg * Math.PI / 180);
    ctx.fillStyle = color;
    const half = diag / 2;
    for (let y = -half; y <= half; y += spacing) {
      // Stagger every other row by half-spacing for a hex-ish lattice
      // — looks better for dots and plus signs than a strict grid.
      const offsetX = (Math.round(y / spacing) % 2) ? spacing / 2 : 0;
      for (let x = -half + offsetX; x <= half; x += spacing) {
        drawShape(x, y);
      }
    }
    ctx.restore();
  }

  // ---- Glyph path → Path2D ----
  // Convert an opentype.js Path object into a canvas Path2D so we can
  // use it as a clip region. opentype paths are made of M/L/C/Q/Z
  // commands which map 1:1 to canvas path methods.
  function otPathToPath2D(otPath) {
    const p = new Path2D();
    for (const cmd of otPath.commands) {
      if (cmd.type === 'M')      p.moveTo(cmd.x, cmd.y);
      else if (cmd.type === 'L') p.lineTo(cmd.x, cmd.y);
      else if (cmd.type === 'C') p.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      else if (cmd.type === 'Q') p.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      else if (cmd.type === 'Z') p.closePath();
    }
    return p;
  }

  // Radial bulge: pushes a single (x, y) outward from a focus point.
  // Returns the displaced [x, y] pair. Falloff is smoothstep so the
  // bulge fades softly to zero at `radius` (no hard edge).
  // `strength` is the maximum displacement in pixels at the focus.
  function bulgeXY(x, y, focusX, focusY, radius, strength) {
    const dx = x - focusX;
    const dy = y - focusY;
    const dist = Math.hypot(dx, dy);
    if (dist >= radius || dist === 0) return [x, y];
    const t = 1 - dist / radius;                    // 1 at center → 0 at edge
    const falloff = t * t * (3 - 2 * t);            // smoothstep
    const push = strength * falloff;
    const ux = dx / dist;                           // unit vector away from focus
    const uy = dy / dist;
    return [x + ux * push, y + uy * push];
  }

  // Radial RING bulge: a band at radius `ringR` around (cx, cy)
  // pushes outward. Points inside or outside the band feel the
  // displacement falling off with distance from the band centerline.
  // Direction is always outward from (cx, cy). Returns [x, y].
  function bulgeRing(x, y, cx, cy, ringR, thickness, strength) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return [x, y];
    // Distance from this point to the ring centerline.
    const offFromRing = Math.abs(dist - ringR);
    if (offFromRing >= thickness) return [x, y];
    const t = 1 - offFromRing / thickness;          // 1 on ring → 0 at band edge
    const falloff = t * t * (3 - 2 * t);
    const push = strength * falloff;
    const ux = dx / dist;
    const uy = dy / dist;
    return [x + ux * push, y + uy * push];
  }

  // Build a fresh Path2D from opentype commands, applying an array
  // of bulge sources to every coordinate (anchor + control points).
  // Each source is { x, y, radius, strength }. Multiple sources sum
  // their displacements (so pulse + hover compose naturally).
  //
  // Note: we don't subdivide curves before warping, so very long
  // curve segments may show kinks at extreme bulge strengths. For
  // typical strengths (≤ 25px) it reads as smooth swelling. Keeping
  // it un-subdivided keeps the per-frame cost low.
  function buildWarpedPath2D(commands, sources) {
    const p = new Path2D();
    function warp(x, y) {
      let nx = x, ny = y;
      for (const s of sources) {
        if (s.ring) {
          const [wx, wy] = bulgeRing(nx, ny, s.cx, s.cy, s.ringR, s.thickness, s.strength);
          nx = wx; ny = wy;
        } else {
          const [wx, wy] = bulgeXY(nx, ny, s.x, s.y, s.radius, s.strength);
          nx = wx; ny = wy;
        }
      }
      return [nx, ny];
    }
    for (const cmd of commands) {
      if (cmd.type === 'M') {
        const [x, y] = warp(cmd.x, cmd.y);
        p.moveTo(x, y);
      } else if (cmd.type === 'L') {
        const [x, y] = warp(cmd.x, cmd.y);
        p.lineTo(x, y);
      } else if (cmd.type === 'C') {
        const [x1, y1] = warp(cmd.x1, cmd.y1);
        const [x2, y2] = warp(cmd.x2, cmd.y2);
        const [x, y]   = warp(cmd.x,  cmd.y);
        p.bezierCurveTo(x1, y1, x2, y2, x, y);
      } else if (cmd.type === 'Q') {
        const [x1, y1] = warp(cmd.x1, cmd.y1);
        const [x, y]   = warp(cmd.x,  cmd.y);
        p.quadraticCurveTo(x1, y1, x, y);
      } else if (cmd.type === 'Z') {
        p.closePath();
      }
    }
    return p;
  }

  // ---- Layout ----
  // Given a font + array of lines, returns an array of
  //   { path2d, bbox: {x, y, w, h} }  — one per line, positioned
  // so the whole block is centered in (canvasW, canvasH).
  // fontSize is chosen to fit the widest line within ~85% canvas
  // width AND the total stack height within ~85% canvas height.
  function layoutLines(font, lines, canvasW, canvasH) {
    if (!lines.length) return [];
    // Binary-search a fontSize that fits both axes. opentype.js
    // getPath is cheap so we can afford the lookups.
    const measureAt = (size) => {
      const lineMetrics = lines.map(line => {
        const path = font.getPath(line, 0, 0, size);
        const bb = path.getBoundingBox();
        return { w: bb.x2 - bb.x1, h: bb.y2 - bb.y1, bb };
      });
      const widest = Math.max(...lineMetrics.map(m => m.w));
      const lineGap = size * 0.15;
      const totalH = lineMetrics.reduce((s, m, i) => s + m.h + (i ? lineGap : 0), 0);
      return { widest, totalH, lineMetrics };
    };
    const targetW = canvasW * 0.85;
    const targetH = canvasH * 0.85;
    let lo = 16, hi = 1200;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const m = measureAt(mid);
      if (m.widest <= targetW && m.totalH <= targetH) lo = mid;
      else hi = mid;
    }
    const fontSize = lo;
    const final = measureAt(fontSize);
    const blockTop = canvasH / 2 - final.totalH / 2;
    const lineGap = fontSize * 0.15;
    let cursorY = blockTop;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = final.lineMetrics[i];
      // Center this line horizontally; place its top at cursorY.
      const offsetX = canvasW / 2 - m.w / 2 - m.bb.x1;
      const offsetY = cursorY - m.bb.y1;
      const otPath = font.getPath(line, offsetX, offsetY, fontSize);
      const path2d = otPathToPath2D(otPath);
      const bb = otPath.getBoundingBox();
      out.push({
        // Raw opentype commands — kept around so the animated path
        // can re-bake a fresh Path2D each frame after warping every
        // coord. The static Path2D below is the no-animation fast
        // path (no per-frame allocation).
        commands: otPath.commands,
        path2d,
        bbox: { x: bb.x1, y: bb.y1, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 },
      });
      cursorY += m.h + lineGap;
    }
    return out;
  }

  // ---- Effect registration ----
  registerEffect({
    id: 'riso',
    mode: 'text',
    name: 'Riso',
    description: 'Each letter is filled with stacked geometric patterns — diagonal lines, dots, plus signs — in CMYK-poster colors. Static, vector-clean, fully editable.',
    colorSlots: 5,    // background + fill + three pattern colors

    controls: [
      {
        group: 'Text',
        open: true,
        items: [
          { type: 'text', key: 'text', label: '', default: 'RISO',
            placeholder: 'Type here. Use | for line breaks.', maxlength: 80 },
        ],
      },
      {
        group: 'Font',
        open: false,
        items: [
          { type: 'select', key: 'fontFamily', label: 'Font',
            options: (params, ctx) => {
              const isCustom = !ctx || ctx.brand == null;
              if (isCustom) return RISO_CUSTOM_FONTS;
              const brandFonts = (ctx && ctx.fonts) || ['Inter'];
              return brandFonts.filter(f => RISO_SUPPORTED.has(f));
            },
            default: null },
        ],
      },
      {
        // Effect toggles — fill the letter shape and the two motion
        // modes. Grouped together because they're all simple on/off
        // switches the user might flip casually while iterating.
        // Open by default so they're always one glance away.
        group: 'Effect',
        open: true,
        items: [
          { type: 'checkbox', key: 'fill',  label: 'Fill letters', default: false },
          { type: 'checkbox', key: 'pulse', label: 'Pulse',        default: true  },
          { type: 'checkbox', key: 'hover', label: 'Hover bulge',  default: false },
        ],
      },
      // Three pattern layer groups. Each layer has the same shape
      // of controls; the only difference is which palette slot it
      // reads its color from. Defaults give a CMYK-ish stack out
      // of the box (diagonals + dots + plus).
      {
        group: 'Layer 1',
        open: true,
        items: [
          { type: 'select', key: 'p1', label: 'Pattern',
            options: [
              { value: 'none',         label: 'None' },
              { value: 'diagonalUp',   label: 'Diagonal ↗' },
              { value: 'diagonalDown', label: 'Diagonal ↘' },
              { value: 'horizontal',   label: 'Horizontal' },
              { value: 'dots',         label: 'Dots' },
              { value: 'plus',         label: 'Plus' },
              { value: 'dashes',       label: 'Dashes' },
            ],
            default: 'diagonalUp' },
          { type: 'slider', key: 'a1', label: 'Angle',   min: 0, max: 360, step: 1, default: 0  },
          { type: 'slider', key: 'd1', label: 'Density', min: 1, max: 100, step: 1, default: 70 },
        ],
      },
      {
        group: 'Layer 2',
        open: true,
        items: [
          { type: 'select', key: 'p2', label: 'Pattern',
            options: [
              { value: 'none',         label: 'None' },
              { value: 'diagonalUp',   label: 'Diagonal ↗' },
              { value: 'diagonalDown', label: 'Diagonal ↘' },
              { value: 'horizontal',   label: 'Horizontal' },
              { value: 'dots',         label: 'Dots' },
              { value: 'plus',         label: 'Plus' },
              { value: 'dashes',       label: 'Dashes' },
            ],
            default: 'dots' },
          { type: 'slider', key: 'a2', label: 'Angle',   min: 0, max: 360, step: 1, default: 0  },
          { type: 'slider', key: 'd2', label: 'Density', min: 1, max: 100, step: 1, default: 70 },
        ],
      },
      {
        group: 'Layer 3',
        open: true,
        items: [
          { type: 'select', key: 'p3', label: 'Pattern',
            options: [
              { value: 'none',         label: 'None' },
              { value: 'diagonalUp',   label: 'Diagonal ↗' },
              { value: 'diagonalDown', label: 'Diagonal ↘' },
              { value: 'horizontal',   label: 'Horizontal' },
              { value: 'dots',         label: 'Dots' },
              { value: 'plus',         label: 'Plus' },
              { value: 'dashes',       label: 'Dashes' },
            ],
            default: 'plus' },
          { type: 'slider', key: 'a3', label: 'Angle',   min: 0, max: 360, step: 1, default: 0  },
          { type: 'slider', key: 'd3', label: 'Density', min: 1, max: 100, step: 1, default: 50 },
        ],
      },
    ],

    mount(host, initialCtx) {
      // ---- Font loading machinery (same shape as Repel) ----
      const fontCache = new Map();
      const failedUrls = new Set();
      let activeFont = null;
      let activeFontUrl = '';
      let pendingFontUrl = '';

      const current = {
        ctx: initialCtx,
        bg:   initialCtx.colors[0] || '#ffffff',
        fill: initialCtx.colors[1] || '#0a0a0a',
        c1:   initialCtx.colors[2] || '#ec4899',
        c2:   initialCtx.colors[3] || '#06b6d4',
        c3:   initialCtx.colors[4] || '#facc15',
      };

      function applyDerived() {
        const c = current.ctx;
        current.bg   = c.colors[0] || '#ffffff';
        current.fill = c.colors[1] || '#0a0a0a';
        current.c1   = c.colors[2] || '#ec4899';
        current.c2   = c.colors[3] || '#06b6d4';
        current.c3   = c.colors[4] || '#facc15';
      }
      applyDerived();

      // Resolve {family} → bundle key, falling back to whatever's
      // available for the current mode/brand if the saved font isn't
      // valid here.
      function resolveFont(family) {
        const c = current.ctx;
        const isCustom = !c || c.brand == null;
        const allowed = isCustom
          ? RISO_CUSTOM_FONTS.filter(f => RISO_FONT_BUNDLE_KEY[f])
          : ((c && c.fonts) || ['Inter']).filter(f => RISO_SUPPORTED.has(f) && RISO_FONT_BUNDLE_KEY[f]);
        const fam = allowed.includes(family) ? family : (allowed[0] || 'Inter');
        const url = RISO_FONT_BUNDLE_KEY[fam];
        return { family: fam, url };
      }

      function ensureFontLoaded(url) {
        if (activeFontUrl === url && activeFont) return;
        if (fontCache.has(url)) {
          activeFont = fontCache.get(url);
          activeFontUrl = url;
          lastLayoutKey = '';
          return;
        }
        if (failedUrls.has(url)) return;
        if (pendingFontUrl === url) return;
        if (typeof opentype === 'undefined') {
          console.warn('opentype.js not loaded — Riso effect cannot render text.');
          return;
        }
        pendingFontUrl = url;
        activeFont = null;
        activeFontUrl = '';
        const bundle = (typeof window !== 'undefined') ? window.REPEL_FONT_BUNDLE : null;
        if (bundle && bundle[url]) {
          try {
            const dataUrl = bundle[url];
            const comma = dataUrl.indexOf(',');
            const b64 = dataUrl.slice(comma + 1);
            const bin = atob(b64);
            const buf = new ArrayBuffer(bin.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
            const font = opentype.parse(buf);
            pendingFontUrl = '';
            fontCache.set(url, font);
            activeFont = font;
            activeFontUrl = url;
            lastLayoutKey = '';
          } catch (err) {
            pendingFontUrl = '';
            failedUrls.add(url);
            console.error('Riso: bundled font parse failed for', url, err);
          }
          return;
        }
        // No external fallback — the bundle covers every font we
        // expose. If we get here it's a bug in the catalog.
        pendingFontUrl = '';
        failedUrls.add(url);
        console.error('Riso: font not in bundle:', url);
      }

      function ensureCurrentFont() {
        const params = current.ctx.params || {};
        const resolved = resolveFont(params.fontFamily);
        if (params.fontFamily !== resolved.family) params.fontFamily = resolved.family;
        ensureFontLoaded(resolved.url);
      }
      ensureCurrentFont();

      // Cache the line layout so we only re-tessellate when something
      // that affects geometry actually changes (text/font/canvas size).
      // Pattern/color/angle/density changes don't invalidate this.
      let lineLayouts = [];
      let lastLayoutKey = '';

      function ensureLayout() {
        const c = current.ctx;
        const params = c.params || {};
        if (!activeFont) return;
        const phrase = (params.text || '').trim() || 'RISO';
        let lines = phrase.split('|').map(s => s.trim()).filter(Boolean);
        if (!lines.length) lines = [phrase];
        const key = `${c.width}x${c.height}|${activeFontUrl}|${lines.join('§')}`;
        if (key === lastLayoutKey) return;
        lineLayouts = layoutLines(activeFont, lines, c.width, c.height);
        lastLayoutKey = key;
      }

      // Single canvas, single static draw. We re-render whenever
      // params change (via onUpdate). No animation loop.
      const cv = document.createElement('canvas');
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.style.display = 'block';
      host.appendChild(cv);
      const dctx = cv.getContext('2d');

      function colorFor(slot) {
        // slot: 1, 2, or 3 → pattern color from current.c1/c2/c3
        if (slot === 1) return current.c1;
        if (slot === 2) return current.c2;
        return current.c3;
      }

      // ---- Mouse tracking (for Hover bulge) ----
      // We listen on the host element so cursor coords map to the
      // canvas. mouseInside lets us skip hover bulge entirely when
      // the user isn't over the canvas.
      let mouseX = 0, mouseY = 0;
      let mouseInside = false;
      function onMouseMove(e) {
        const rect = cv.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        mouseInside = true;
      }
      function onMouseLeave() {
        mouseInside = false;
      }
      host.addEventListener('mousemove', onMouseMove);
      host.addEventListener('mouseleave', onMouseLeave);

      // ---- Animation loop ----
      // Runs only when at least one motion mode is on. The static
      // case (both off) does zero per-frame work and just renders
      // when params change. tStart anchors the pulse phase to the
      // mount time so toggling pulse on/off doesn't snap the wave.
      let rafHandle = null;
      const tStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      function frame() {
        rafHandle = null;
        render();
        const params = current.ctx.params || {};
        if (params.pulse || (params.hover && mouseInside)) {
          rafHandle = requestAnimationFrame(frame);
        }
      }
      function ensureLoopRunning() {
        if (rafHandle != null) return;
        const params = current.ctx.params || {};
        if (params.pulse || (params.hover && mouseInside)) {
          rafHandle = requestAnimationFrame(frame);
        }
      }
      function stopLoop() {
        if (rafHandle != null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
      }

      // Restart the loop when mouse re-enters with hover-bulge on
      // (otherwise hover would never kick in once the loop has
      // stopped because the user moved off and back on).
      host.addEventListener('mouseenter', () => {
        mouseInside = true;
        ensureLoopRunning();
      });

      function render() {
        const c = current.ctx;
        // Match the canvas backing store to the device's actual pixel
        // density. On a 2x display, c.width=1200 means 2400 physical
        // pixels; without this scaling each pattern stroke would be
        // upscaled by the browser, looking soft. We then scale the
        // drawing context by the same factor so all our coordinates
        // remain in CSS pixels — the rest of the code is unchanged.
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const wantW = Math.round(c.width * dpr);
        const wantH = Math.round(c.height * dpr);
        if (cv.width !== wantW || cv.height !== wantH) {
          cv.width = wantW;
          cv.height = wantH;
          cv.style.width = c.width + 'px';
          cv.style.height = c.height + 'px';
        }
        // Reset any stale transform from a previous render before we
        // re-apply the DPR scale (setTransform is the safe way to
        // avoid drift if render is called repeatedly).
        dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ensureCurrentFont();
        ensureLayout();

        // Background.
        dctx.fillStyle = current.bg;
        dctx.fillRect(0, 0, c.width, c.height);

        if (!activeFont) {
          // Loading placeholder.
          dctx.fillStyle = current.c1;
          dctx.font = '14px sans-serif';
          dctx.textAlign = 'center';
          dctx.textBaseline = 'middle';
          dctx.fillText('loading font…', c.width / 2, c.height / 2);
          return;
        }
        if (!lineLayouts.length) return;

        const params = c.params || {};

        // Build the bulge sources for this frame. When neither
        // motion mode is active we skip warping entirely and reuse
        // the cached static Path2D — keeps the no-motion case
        // zero-cost per frame (the rAF loop won't even be running).
        const bulgeSources = [];
        if (params.pulse) {
          // Pulse: a radial ripple expanding from the canvas center.
          // A ring of bulge travels outward, fades as it leaves, then
          // there's a short rest before the next ripple starts.
          // Implementation: convert a single bulge "source" into a
          // RING by adjusting the bulgeXY math via a synthetic peak
          // distance — instead of a focus point, every coord whose
          // distance-from-center matches the current ring radius
          // gets pushed outward.
          const t = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart) / 1000;
          const cxC = c.width / 2;
          const cyC = c.height / 2;
          // Cycle: ring travels out over 2.5s, then 0.5s rest, total 3s.
          const TRAVEL = 2.5;
          const REST   = 0.5;
          const CYCLE  = TRAVEL + REST;
          const phase = t % CYCLE;
          if (phase < TRAVEL) {
            const maxR = Math.min(c.width, c.height) * 0.55;
            const ringR = (phase / TRAVEL) * maxR;
            // Strength fades in fast, holds, fades out as the ring
            // approaches its max radius — keeps the "stone in pond"
            // shape with a clear arrival and dissipation.
            const k = phase / TRAVEL;            // 0..1 across travel
            const env = Math.sin(k * Math.PI);   // 0→1→0 over the travel
            const strength = env * 64;           // peak ~64px
            // Encode the ring as a special source. The bulgeXY
            // function doesn't know about rings — it's a focus
            // pusher — so we tag this source with `ring: true` and
            // handle it specially in buildWarpedPath2D.
            bulgeSources.push({
              ring: true,
              cx: cxC,
              cy: cyC,
              ringR,
              thickness: maxR * 0.4,             // band width
              strength,
            });
          }
          // During REST: no source pushed → word sits still.
        }
        if (params.hover && mouseInside) {
          // Hover: cursor-driven, smaller and tighter than pulse so
          // the user feels a localized bump that follows their mouse.
          const radius = Math.min(c.width, c.height) * 0.25;
          bulgeSources.push({ x: mouseX, y: mouseY, radius, strength: 22 });
        }

        // Choose path source: warped (motion on) or cached static.
        let unionPath;
        if (bulgeSources.length === 0) {
          unionPath = new Path2D();
          for (const lp of lineLayouts) unionPath.addPath(lp.path2d);
        } else {
          unionPath = new Path2D();
          for (const lp of lineLayouts) {
            unionPath.addPath(buildWarpedPath2D(lp.commands, bulgeSources));
          }
        }

        // Compute the union bbox so patterns extend across all
        // lines, not just one. (For warped paths, bbox grows by at
        // most the maximum bulge strength — we bake some slack into
        // the pattern coverage anyway via drawShapeGrid's
        // oversized loop, so using the static bbox is fine.)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const lp of lineLayouts) {
          minX = Math.min(minX, lp.bbox.x);
          minY = Math.min(minY, lp.bbox.y);
          maxX = Math.max(maxX, lp.bbox.x + lp.bbox.w);
          maxY = Math.max(maxY, lp.bbox.y + lp.bbox.h);
        }
        const unionBBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

        // Fill layer (optional, drawn first so patterns sit on top).
        // No offset — the fill represents the perfectly-aligned plate
        // that the misregistered patterns dance around.
        if (params.fill) {
          dctx.save();
          dctx.fillStyle = current.fill;
          dctx.fill(unionPath);
          dctx.restore();
        }

        // Misregistration — fixed offset baked into the effect (no
        // user control). Per-layer direction is hardcoded:
        //   Layer 1 → down-left
        //   Layer 2 → centered (no shift)
        //   Layer 3 → up-right
        // The shift applies to the WHOLE LAYER (clip + pattern moved
        // as one unit), so a stroke that would extend past a letter's
        // edge does extend past it — exactly the riso/screenprint
        // look where each color plate is physically misaligned.
        const OFFSET_PX = 8;
        const layers = [
          { type: params.p1 || 'diagonalUp', slot: 1, angle: params.a1 || 0,  density: params.d1 || 70, dx: -OFFSET_PX, dy:  OFFSET_PX },
          { type: params.p2 || 'dots',       slot: 2, angle: params.a2 || 0,  density: params.d2 || 70, dx:  0,         dy:  0          },
          { type: params.p3 || 'plus',       slot: 3, angle: params.a3 || 0,  density: params.d3 || 50, dx:  OFFSET_PX, dy: -OFFSET_PX },
        ];

        // Per layer: translate the whole drawing surface by
        // (dx, dy), then apply the letter clip in that translated
        // space, then draw the pattern. Restoring undoes both. The
        // result: each layer's letter shape sits at a slightly
        // different position, so patterns visibly extend past the
        // baseline letter outline where they'd otherwise be cut off.
        for (const layer of layers) {
          const fn = PATTERNS[layer.type];
          if (!fn) continue;
          dctx.save();
          dctx.translate(layer.dx, layer.dy);
          dctx.clip(unionPath);
          fn(dctx, unionBBox, colorFor(layer.slot), layer.angle, layer.density);
          dctx.restore();
        }
      }

      // Initial paint, plus a few re-renders during font load (the
      // load is sync from bundle, so usually the very first render
      // already has activeFont — but we keep a poll for safety).
      let pollTimer = null;
      function startLoadPoll() {
        if (pollTimer) return;
        let n = 0;
        pollTimer = setInterval(() => {
          n++;
          if (activeFont || n > 30) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          render();
        }, 50);
      }
      render();
      if (!activeFont) startLoadPoll();
      // If pulse is on by default, kick the rAF loop now so the
      // word starts breathing immediately on mount.
      ensureLoopRunning();

      // ---- Public API for the host ----
      host.__riso = {
        update(newCtx) {
          current.ctx = newCtx;
          applyDerived();
          // Param change might have toggled motion. Re-evaluate the
          // loop — start it if a motion mode just turned on, stop
          // it if both turned off (and we're not currently mid-frame).
          const params = current.ctx.params || {};
          if (params.pulse || (params.hover && mouseInside)) {
            ensureLoopRunning();
          } else {
            stopLoop();
          }
          render();
        },
      };

      return function teardown() {
        host.__riso = null;
        stopLoop();
        host.removeEventListener('mousemove', onMouseMove);
        host.removeEventListener('mouseleave', onMouseLeave);
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        try { host.removeChild(cv); } catch (e) { /* already gone */ }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__riso;
      if (api && typeof api.update === 'function') api.update(ctx);
    },
  });
})();
