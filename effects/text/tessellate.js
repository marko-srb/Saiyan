/* ============================================================
   TESSELLATE — text effect (perfect grid, traveling-wave size pattern)

   Mechanic, in plain words:
     1. The canvas is divided into a perfect cols × rows grid. Cell
        positions never move — that's the "geometrical perfection."
     2. Each cell renders the typed word centered inside it, at one of
        THREE quantized sizes: small, medium, or big.
     3. Each cell's size is decided by sampling a 2D traveling sine
        wave at the cell's (col, row) position. The wave moves
        diagonally through the grid as time advances, so the cells
        that are "big right now" form moving bands of large text.
     4. The wave's phase advances exactly 2π per cycle, so the
        animation loops seamlessly.

   What gives it the look:
     - The grid never breaks. Cell centers stay locked.
     - Sizes are QUANTIZED (3 buckets), not continuous. This makes
       each cell jump cleanly between sizes — gives a digital,
       structured feel instead of a smooth pulse.
     - The bands of "big cells" travel diagonally — perfect motion
       inside a perfect grid. The motion comes from cell SIZE changes,
       not cell POSITION changes.

   Why 3 sizes specifically:
     2 sizes (just big/small) reads as binary on/off, less interesting.
     4+ sizes start blurring into continuous gradient look. 3 sizes
     give the "stepped" look from the references — clear distinct
     levels you can see jumping cell to cell.

   Vector-clean: every cell is one fillText. ~400 calls per frame for
   a 20×20 grid. SVG export trivially: emit one <text> per cell.
============================================================ */
(function () {
  'use strict';

  function pickFont(availableFonts, chosen) {
    const list = Array.isArray(availableFonts) ? availableFonts : [];
    if (chosen && list.includes(chosen)) return chosen;
    return list[0] || 'sans-serif';
  }

  function pickPreferredWeight(weights) {
    if (!Array.isArray(weights) || weights.length === 0) return 400;
    if (weights.includes(400)) return 400;
    if (weights.includes(500)) return 500;
    return weights.slice().sort((a, b) => Math.abs(a - 400) - Math.abs(b - 400))[0];
  }

  function fontShorthand(family, sizePx, weight) {
    const safe = /\s/.test(family) ? `"${family}"` : family;
    let w = '';
    if (typeof weight === 'number' && weight > 0) w = `${weight} `;
    else if (typeof weight === 'string' && /^\d+$/.test(weight) && +weight > 0) w = `${+weight} `;
    return `${w}${sizePx}px ${safe}, sans-serif`;
  }

  registerEffect({
    id: 'tessellate',
    mode: 'text',
    name: 'Tessellate',
    description: "A perfect grid of repeated text where each cell's size is set by a traveling wave. Cells stay locked in place; the wave of big cells moves through the grid. Loops cleanly.",
    colorSlots: 2,    // background + text

    controls: [
      {
        group: 'Text',
        open: true,
        items: [
          { type: 'text', key: 'text', label: '', default: 'n',
            placeholder: 'Type here.', maxlength: 80 },
        ],
      },
      {
        group: 'Effect',
        open: true,
        items: [
          // Density: how many cells along the canvas's smaller axis. The
          // OTHER axis derives its count to keep cells roughly square.
          // Higher = more cells, smaller text per cell. Lower = fewer
          // larger cells, easier to read longer words.
          { type: 'slider', key: 'density', label: 'Density',
            min: 6, max: 30, step: 1, default: 14 },
          { type: 'slider', key: 'speed',   label: 'Speed',
            min: 1, max: 100, step: 1, default: 25 },
          { type: 'checkbox', key: 'invert', label: 'Invert', default: false },
        ],
      },
      {
        group: 'Font',
        open: false,
        items: [
          { type: 'select', key: 'font', label: 'Font', options: '$fonts', default: null },
          { type: 'select', key: 'weight', label: 'Weight',
            options: (params, ctx) => {
              const fam = (params && params.font) || (ctx && ctx.fonts && ctx.fonts[0]);
              return ctx && ctx.weightsForFont ? ctx.weightsForFont(fam) : [400];
            },
            default: null },
        ],
      },
    ],

    mount(host, initialCtx) {
      const current = {
        ctx: initialCtx,
        font:   pickFont(initialCtx.fonts, initialCtx.params.font),
        weight: 400,
        bg:     initialCtx.colors[0] || '#FFFFFF',
        fg:     initialCtx.colors[1] || '#000000',
      };

      function applyDerived() {
        const c = current.ctx;
        const picked = pickFont(c.fonts, c.params.font);
        if (!c.params.font || !c.fonts.includes(c.params.font)) c.params.font = picked;
        current.font = picked;

        const availableOpts = (c.weightsForFont ? c.weightsForFont(picked) : []);
        const availableValues = availableOpts
          .map(w => (w && typeof w === 'object' ? w.value : w))
          .filter(v => typeof v === 'number');
        const preferred = pickPreferredWeight(availableValues);
        if (c.params.weight == null || !availableValues.includes(c.params.weight)) {
          c.params.weight = preferred;
        }
        current.weight = c.params.weight;

        const bg = c.colors[0] || '#FFFFFF';
        const fg = c.colors[1] || '#000000';
        if (c.params.invert) { current.bg = fg; current.fg = bg; }
        else                 { current.bg = bg; current.fg = fg; }
      }
      applyDerived();

      const sketch = (p) => {
        p.setup = () => {
          const cv = p.createCanvas(current.ctx.width, current.ctx.height);
          cv.parent(host);
          p.frameRate(60);
        };

        p.draw = () => {
          const c      = current.ctx;
          const params = c.params;
          const dctx   = p.drawingContext;

          dctx.fillStyle = current.bg;
          dctx.fillRect(0, 0, c.width, c.height);

          const txt = (params.text || '').trim() || 'n';
          // Single-line text per cell (| line-breaks don't make sense
          // when each cell is one chunk of text).
          const cellText = txt.replace(/\|/g, ' ');

          // ---- Grid geometry ----
          //
          // density = number of cells along the smaller canvas axis.
          // The other axis derives its count from the canvas aspect
          // ratio so cells stay close to square. Cells that aren't
          // exactly square would skew the wave appearance.
          const density = Math.max(6, Math.min(30, params.density || 14));
          const minDim = Math.min(c.width, c.height);
          const cellSize = minDim / density;
          // Grid extends across the canvas; we round cols/rows so the
          // grid covers the canvas with at most a half-cell of overflow.
          // Drawing a few extra cells off-edge is fine — they're outside
          // the visible canvas and contribute nothing.
          const cols = Math.ceil(c.width  / cellSize);
          const rows = Math.ceil(c.height / cellSize);
          // Center the grid by computing an offset that pulls it toward
          // canvas center.
          const gridW = cols * cellSize;
          const gridH = rows * cellSize;
          const offsetX = (c.width  - gridW) / 2;
          const offsetY = (c.height - gridH) / 2;

          // ---- Wave + animation ----
          //
          // Cycle: speed slider maps to period 1000-10000ms.
          const speed = Math.max(1, Math.min(100, params.speed || 25));
          const cyclePeriodMs = 1000 + (100 - speed) * 90;
          // tCycle ∈ [0, 1) over one cycle. Multiplied by 2π later.
          const tCycle = (performance.now() / cyclePeriodMs) % 1;
          const phaseT = tCycle * Math.PI * 2;

          // The 2D traveling wave. For cell at grid coords (i, j):
          //   wave = sin(i*WX + j*WY + t)
          // where WX, WY define the wave's spatial frequency in each
          // axis. The wave's "direction of travel" perpendicular to
          // (WX, WY); we use a 45° diagonal so it moves through both
          // axes at once (visually liveliest direction).
          //
          // Spatial frequency tuning: smaller WX/WY → wider wavelength
          // (fewer big-bands across the grid). Larger → tighter pattern.
          // We pick the wavelength so the grid has roughly 2 full cycles
          // visible at any given time — gives a clear "band" feel.
          const wavelengthCells = Math.max(cols, rows) / 2;
          const W = (Math.PI * 2) / wavelengthCells;
          const WX = W * Math.SQRT1_2;     // 45° components
          const WY = W * Math.SQRT1_2;

          // ---- Size buckets ----
          //
          // 3 quantized sizes for the cell text. Mapped from wave value:
          //   wave > +0.33  → BIG
          //   wave > -0.33  → MEDIUM
          //   else          → SMALL
          // The thresholds are chosen so each bucket gets roughly equal
          // grid coverage on average (sin uniform-ish distribution).
          //
          // Size as fraction of cell size. Big = mostly fills the cell;
          // small = readable but small.
          const SIZE_BIG    = cellSize * 0.85;
          const SIZE_MEDIUM = cellSize * 0.55;
          const SIZE_SMALL  = cellSize * 0.30;

          dctx.fillStyle = current.fg;
          dctx.textBaseline = 'middle';
          dctx.textAlign = 'center';

          // ---- Render each cell ----
          //
          // Pre-cache the three font shorthand strings so we don't do
          // string concatenation per cell. Setting dctx.font is cheap
          // when the same string is reused (browsers cache the parsed
          // value), so we change it only when bucket changes between
          // adjacent cells. Many cells in a row will share buckets
          // (since the wave varies slowly relative to a single cell),
          // so the cache hit rate is high.
          const fontStrBig    = fontShorthand(current.font, SIZE_BIG,    current.weight);
          const fontStrMedium = fontShorthand(current.font, SIZE_MEDIUM, current.weight);
          const fontStrSmall  = fontShorthand(current.font, SIZE_SMALL,  current.weight);
          let lastBucket = -1;

          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
              const wave = Math.sin(i * WX + j * WY + phaseT);
              let bucket;
              if (wave > 0.33)       bucket = 0;   // big
              else if (wave > -0.33) bucket = 1;   // medium
              else                   bucket = 2;   // small

              if (bucket !== lastBucket) {
                dctx.font = bucket === 0 ? fontStrBig
                          : bucket === 1 ? fontStrMedium
                          : fontStrSmall;
                lastBucket = bucket;
              }

              // Cell center in canvas pixels.
              const cx = offsetX + (i + 0.5) * cellSize;
              const cy = offsetY + (j + 0.5) * cellSize;
              dctx.fillText(cellText, cx, cy);
            }
          }
        };
      };

      const inst = new p5(sketch, host);

      host.__tessellate = {
        update(newCtx) {
          current.ctx = newCtx;
          applyDerived();
          if (inst.width !== newCtx.width || inst.height !== newCtx.height) {
            inst.resizeCanvas(newCtx.width, newCtx.height);
          }
        },
        // True-vector SVG export. Re-runs the render math at the
        // current frame and emits one <text> per cell. Replaces the
        // ~400 fillText calls with ~400 <text> elements — same data,
        // vector form. The wave phase, bucket logic, and font
        // choices mirror the live p.draw exactly.
        exportSVG(ctx) {
          const c = current.ctx;
          const params = c.params || {};
          const W = c.width, H = c.height;
          const txt = (params.text || '').trim() || 'n';
          const cellText = txt.replace(/\|/g, ' ');
          const density = Math.max(6, Math.min(30, params.density || 14));
          const minDim = Math.min(W, H);
          const cellSize = minDim / density;
          const cols = Math.ceil(W / cellSize);
          const rows = Math.ceil(H / cellSize);
          const gridW = cols * cellSize;
          const gridH = rows * cellSize;
          const offsetX = (W - gridW) / 2;
          const offsetY = (H - gridH) / 2;
          // Cycle / wave — frozen at the current time.
          const speed = Math.max(1, Math.min(100, params.speed || 25));
          const cyclePeriodMs = 1000 + (100 - speed) * 90;
          const tCycle = (performance.now() / cyclePeriodMs) % 1;
          const phaseT = tCycle * Math.PI * 2;
          const wavelengthCells = Math.max(cols, rows) / 2;
          const Wfreq = (Math.PI * 2) / wavelengthCells;
          const WX = Wfreq * Math.SQRT1_2;
          const WY = Wfreq * Math.SQRT1_2;
          const SIZE_BIG    = cellSize * 0.85;
          const SIZE_MEDIUM = cellSize * 0.55;
          const SIZE_SMALL  = cellSize * 0.30;

          const body = [];
          // Background.
          body.push(`<rect width="${W}" height="${H}" fill="${current.bg}"/>`);
          // Each cell.
          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
              const wave = Math.sin(i * WX + j * WY + phaseT);
              let size;
              if (wave > 0.33)       size = SIZE_BIG;
              else if (wave > -0.33) size = SIZE_MEDIUM;
              else                   size = SIZE_SMALL;
              const cx = offsetX + (i + 0.5) * cellSize;
              const cy = offsetY + (j + 0.5) * cellSize;
              body.push(SaiyanSVG.text({
                x: cx, y: cy, text: cellText,
                fontFamily: current.font,
                fontSize: size,
                fontWeight: current.weight,
                fill: current.fg,
                textAnchor: 'middle',
                dominantBaseline: 'central',
              }));
            }
          }
          return SaiyanSVG.doc({ width: W, height: H, body: body.join('') });
        },
      };

      return function teardown() {
        host.__tessellate = null;
        try { inst.remove(); } catch (e) { console.error('tessellate teardown error', e); }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__tessellate;
      if (api && typeof api.update === 'function') api.update(ctx);
    },
  });
})();
