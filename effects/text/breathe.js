/* ============================================================
   BREATHE — text effect (variable-font weight breathing in a grid)

   Adapted from a prototype (breathing-grid.html). Core mechanic
   preserved; presets and font-system integration added.

   Mechanic:
     - rows × cols grid of the typed word.
     - Each cell renders the word at a font-weight that is animated.
       The weight oscillates between the FONT'S MIN and MAX available
       weights (e.g., 100..900 for Inter, 300..700 for IBM Plex Mono).
       Single-weight fonts render static.
     - The "preset" param picks how each cell's animation phase is
       chosen:
         async — random per-cell phase (the original prototype look)
         sync  — all cells in lockstep
         hover — phase derived from cursor proximity (cells near the
                 cursor are at peak weight; far cells stay at min)
     - Cell layout uses binary-search-for-fit: largest fontSize at
       which the word at the WIDEST available weight still fits in
       a column AND the stack fits vertically with breathing room.

   Why min/max from font catalog:
     The original prototype was hardcoded to Inter 100..900. Other
     fonts have different ranges (Anton has only 400). Reading the
     font's actual available weights makes the selector work for any
     catalog font without breaking on missing weights.

   Cursor scoping in hover preset:
     The effect READS p5's mouseX/mouseY but does NOT change the
     cursor visual. The app already provides a custom cursor in
     fullscreen mode (X with circle); we don't override it.

   Vector-clean: per cell = one fillText.
============================================================ */
(function () {
  'use strict';

  registerEffect({
    id: 'breathe',
    mode: 'text',
    name: 'Breathe',
    description: "A grid of repeated text whose weight breathes between the font's lightest and heaviest. Three presets: independent random phases, synchronized, or driven by cursor proximity.",
    colorSlots: 2,    // background + text

    controls: [
      {
        group: 'Text',
        open: true,
        items: [
          { type: 'text', key: 'text', label: '', default: 'SAIYAN',
            placeholder: 'Type here.', maxlength: 80 },
        ],
      },
      {
        group: 'Effect',
        open: true,
        items: [
          { type: 'select', key: 'preset', label: 'Preset',
            options: [
              { value: 'async', label: 'Async' },
              { value: 'sync',  label: 'Sync' },
              { value: 'hover', label: 'Hover' },
            ],
            default: 'async' },
          { type: 'slider', key: 'rows',    label: 'Rows',    min: 1, max: 16, step: 1, default: 3 },
          { type: 'slider', key: 'columns', label: 'Columns', min: 1, max: 16, step: 1, default: 3 },
          // Speed slider is meaningful for async/sync only. For hover,
          // it's irrelevant (no time-driven breathing). Kept anyway so
          // switching presets doesn't change other params.
          { type: 'slider', key: 'speed',   label: 'Speed',   min: 1, max: 100, step: 1, default: 25 },
          { type: 'checkbox', key: 'invert', label: 'Invert', default: false },
        ],
      },
      {
        group: 'Font',
        open: false,
        items: [
          { type: 'select', key: 'font', label: 'Font',
            // Hardcoded list. Breathe needs variable-weight fonts with
            // a wide weight axis for smooth breathing. Inter ships with
            // every brand and Custom mode. The four extra fonts (Jost,
            // Fraunces, Bricolage Grotesque, JetBrains Mono) are loaded
            // via a Breathe-only Google Fonts CSS link; they only show
            // up in Custom mode to keep brand modes typographically
            // disciplined.
            options: (params, ctx) => {
              const isCustom = !ctx || ctx.brand == null;
              if (isCustom) {
                return ['Inter', 'Jost', 'Fraunces', 'Bricolage Grotesque', 'JetBrains Mono'];
              }
              return ['Inter'];
            },
            default: 'Inter' },
        ],
      },
    ],

    mount(host, initialCtx) {
      // Constants from the original prototype that stay fixed.
      // Tight grid: cells sit close but don't touch. Reduced from
      // MARGIN 0.06 → 0.02 (so each cell is wider → fontSize grows →
      // the visible word fills more of the cell, shrinking the
      // apparent horizontal gap), GUTTER 0.04 → 0.008, and
      // ROW_GAP 0.25 → 0.05 so the breathing weights have just
      // enough room not to collide.
      const MARGIN_RATIO = 0.02;
      const GUTTER_RATIO = 0.008;
      const ROW_GAP_RATIO = 0.05;
      const breathe = t => 0.5 - 0.5 * Math.cos(t * Math.PI * 2);

      // Breathe's own font registry. Source of truth for which fonts
      // this effect can use, with their weight axis ranges. We keep
      // this LOCAL to the effect — these fonts (Jost, Fraunces, etc.)
      // aren't in the app-wide FONT_CATALOG, so we can't ask
      // ctx.weightsForFont about them.
      //
      // Inter is shared with every brand and Custom mode. The four
      // extras (Jost, Fraunces, Bricolage Grotesque, JetBrains Mono)
      // are loaded via a Breathe-only Google Fonts CSS link in the
      // page head.
      const BREATHE_FONTS = {
        'Inter':                { min: 100, max: 900 },
        'Jost':                 { min: 100, max: 900 },
        'Fraunces':             { min: 100, max: 900 },
        'Bricolage Grotesque':  { min: 200, max: 800 },
        'JetBrains Mono':       { min: 100, max: 800 },
      };

      // Allowed fonts depend on mode: brand modes see only Inter,
      // Custom mode sees the full list. Mirrors the dropdown options
      // function above.
      function allowedBreatheFonts(ctx) {
        const isCustom = !ctx || ctx.brand == null;
        if (isCustom) return ['Inter', 'Jost', 'Fraunces', 'Bricolage Grotesque', 'JetBrains Mono'];
        return ['Inter'];
      }

      // Pick a valid font for the current mode. Prefer the user's
      // saved choice if it's allowed; otherwise fall back to Inter
      // (always allowed in any mode).
      function pickBreathingFont(ctx, chosen) {
        const allowed = allowedBreatheFonts(ctx);
        if (chosen && allowed.includes(chosen)) return chosen;
        return allowed[0] || 'Inter';
      }

      const current = {
        ctx: initialCtx,
        font: pickBreathingFont(initialCtx, initialCtx.params.font),
        bg: initialCtx.colors[0] || '#0a0a0a',
        fg: initialCtx.colors[1] || '#f2f2f2',
        weightMin: 100,
        weightMax: 900,
      };

      function applyDerived() {
        const c = current.ctx;
        const picked = pickBreathingFont(c, c.params.font);
        // If the user's saved font isn't valid for the current mode
        // (e.g. they picked Jost in Custom then switched to a brand),
        // update params so the dropdown reflects what we're actually
        // rendering.
        if (c.params.font !== picked) c.params.font = picked;
        current.font = picked;

        // Pull weight range from our local registry.
        const range = BREATHE_FONTS[picked] || { min: 100, max: 900 };
        current.weightMin = range.min;
        current.weightMax = range.max;

        const bg = c.colors[0] || '#0a0a0a';
        const fg = c.colors[1] || '#f2f2f2';
        if (c.params.invert) { current.bg = fg; current.fg = bg; }
        else                 { current.bg = bg; current.fg = fg; }
      }
      applyDerived();

      // Layout state — recomputed when geometry-relevant inputs change.
      let cells = [];
      let fontSize = 100;

      // Layout grid using binary search that respects BOTH horizontal
      // and vertical fit. We solve for the largest fontSize that:
      //   - the word at the widest available weight fits horizontally
      //     in a column (cellW)
      //   - rows × (visualH + rowGap) fits vertically
      function layoutGrid(width, height, cols, rows, phrase, fontFamily, weightMax) {
        const margin = width * MARGIN_RATIO;
        const gutter = width * GUTTER_RATIO;
        const usableW = Math.max(1, width - margin * 2);
        const cellW = (usableW - gutter * (cols - 1)) / cols;
        const usableH = Math.max(1, height - margin * 2);

        const measureCtx = document.createElement('canvas').getContext('2d');

        // For a given test fontSize, return true if both axes fit.
        const fits = (sz) => {
          measureCtx.font = `${weightMax} ${sz}px "${fontFamily}", sans-serif`;
          const w = measureCtx.measureText(phrase).width;
          if (w > cellW) return false;
          const visualH = sz * 0.75;
          const rowGap = sz * ROW_GAP_RATIO;
          // Total vertical: rows × visualH + (rows + 1) × rowGap (top
          // and bottom gaps included).
          const totalV = rows * visualH + (rows + 1) * rowGap;
          return totalV <= usableH;
        };

        let lo = 8, hi = 600;
        while (hi - lo > 1) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid; else hi = mid;
        }
        fontSize = Math.max(8, Math.floor(lo));

        // Compute final layout positions using the chosen fontSize.
        const visualH = fontSize * 0.75;
        const rowGap = fontSize * ROW_GAP_RATIO;
        // Center the stack vertically: extra leftover height splits
        // equally above and below so the rows of cells aren't pinned
        // to the top.
        const totalV = rows * visualH + (rows + 1) * rowGap;
        const topY = (height - totalV) / 2 + rowGap + visualH / 2;

        // Preserve any existing per-cell phases by index — keeps the
        // randomization stable across resize / control changes so the
        // visual doesn't re-roll constantly.
        const oldPhases = cells.map(c => c.phase);
        cells = [];
        let idx = 0;
        for (let r = 0; r < rows; r++) {
          for (let c2 = 0; c2 < cols; c2++) {
            const x = margin + cellW / 2 + c2 * (cellW + gutter);
            const y = topY + r * (visualH + rowGap);
            const phase = (idx < oldPhases.length) ? oldPhases[idx] : Math.random();
            cells.push({ x, y, phase });
            idx++;
          }
        }
      }

      // Track inputs to know when to re-layout. Recomputing the binary
      // search on every frame would be wasteful — input-key debouncing
      // means we only re-search when something changes.
      let lastLayoutKey = '';

      // Frame counter — kept outside the sketch closure so the
      // host's exportSVG method can read it for the current phase.
      let frameCounter = 0;

      const sketch = (p) => {
        let mx = -9999, my = -9999;     // canvas-local cursor for hover preset

        p.setup = () => {
          const cv = p.createCanvas(current.ctx.width, current.ctx.height);
          cv.parent(host);
          p.frameRate(60);
        };

        p.mouseMoved = () => { mx = p.mouseX; my = p.mouseY; };
        p.mouseDragged = () => { mx = p.mouseX; my = p.mouseY; };
        p.touchMoved = () => { mx = p.mouseX; my = p.mouseY; return false; };

        p.draw = () => {
          const c      = current.ctx;
          const params = c.params;
          const dctx   = p.drawingContext;

          dctx.fillStyle = current.bg;
          dctx.fillRect(0, 0, c.width, c.height);

          const phrase = (params.text || '').trim() || 'SAIYAN';
          const cols = Math.max(1, Math.min(16, params.columns || 3));
          const rows = Math.max(1, Math.min(16, params.rows || 3));
          const preset = params.preset || 'async';

          const layoutKey = `${c.width}x${c.height}|${phrase}|${cols}|${rows}|${current.font}|${current.weightMax}`;
          if (layoutKey !== lastLayoutKey) {
            layoutGrid(c.width, c.height, cols, rows, phrase, current.font, current.weightMax);
            lastLayoutKey = layoutKey;
          }

          // Speed → cycle frames mapping (only used by async/sync).
          const speed = Math.max(1, Math.min(100, params.speed || 25));
          const CYCLE = Math.round(40 + (100 - speed) / 100 * 440);

          // Hover radius — tuned so a few cells around the cursor get
          // weight-pumped. ~25% of the smaller canvas axis is a good
          // default and scales with canvas size.
          const hoverRadius = Math.min(c.width, c.height) * 0.25;
          const hoverRadius2 = hoverRadius * hoverRadius;

          dctx.fillStyle = current.fg;
          dctx.textAlign = 'center';
          dctx.textBaseline = 'middle';

          const wMin = current.weightMin;
          const wMax = current.weightMax;
          const wRange = wMax - wMin;
          // wRange is guaranteed >= 400 by the font filter on the
          // dropdown, so we always animate weight directly.

          for (const cell of cells) {
            // Compute eased ∈ [0, 1] per preset.
            let eased;
            if (preset === 'sync') {
              const t = (frameCounter / CYCLE) % 1;
              eased = breathe(t);
            } else if (preset === 'hover') {
              // Distance from cursor in canvas-local pixels. Linear
              // falloff inside hoverRadius; 0 outside.
              const dx = cell.x - mx;
              const dy = cell.y - my;
              const d2 = dx * dx + dy * dy;
              if (d2 >= hoverRadius2) {
                eased = 0;
              } else {
                const d = Math.sqrt(d2);
                eased = 1 - d / hoverRadius;
                // Smooth the falloff with a cubic so the rolloff feels
                // softer than linear (no harsh edge).
                eased = eased * eased * (3 - 2 * eased);
              }
            } else {
              // async — original prototype behavior
              const t = ((frameCounter / CYCLE) + cell.phase) % 1;
              eased = breathe(t);
            }

            const weight = Math.round(wMin + wRange * eased);
            dctx.font = `${weight} ${fontSize}px "${current.font}", sans-serif`;
            dctx.fillText(phrase, cell.x, cell.y);
          }

          frameCounter++;
        };
      };

      const inst = new p5(sketch, host);

      host.__breathe = {
        update(newCtx) {
          current.ctx = newCtx;
          applyDerived();
          if (inst.width !== newCtx.width || inst.height !== newCtx.height) {
            inst.resizeCanvas(newCtx.width, newCtx.height);
          }
        },
        // True-vector SVG export. Emits one <text> per cell at the
        // current frame's animated weight. Layout (cell positions,
        // fontSize from binary-search-for-fit) reuses the cached
        // `cells` array and `fontSize` populated by the live render.
        exportSVG(ctx) {
          const c = current.ctx;
          const params = c.params || {};
          const W = c.width, H = c.height;
          const preset = params.preset || 'async';
          const speed = Math.max(1, Math.min(100, params.speed || 25));
          const CYCLE = Math.round(40 + (100 - speed) / 100 * 440);
          const wMin = current.weightMin;
          const wMax = current.weightMax;
          const wRange = wMax - wMin;
          // Hover preset uses last-known cursor — captured during
          // live render. For SVG export we don't have a current mouse
          // (export modal covers the canvas), so hover-preset falls
          // back to baseline weight everywhere. Async/sync produce
          // their full visual.
          const body = [];
          body.push(`<rect width="${W}" height="${H}" fill="${current.bg}"/>`);
          for (const cell of cells) {
            let eased;
            if (preset === 'sync') {
              const t = (frameCounter / CYCLE) % 1;
              eased = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
            } else if (preset === 'hover') {
              eased = 0;  // no cursor available at export time
            } else {
              const t = ((frameCounter / CYCLE) + cell.phase) % 1;
              eased = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
            }
            const weight = Math.round(wMin + wRange * eased);
            const phrase = (params.text || '').trim() || 'SAIYAN';
            body.push(SaiyanSVG.text({
              x: cell.x, y: cell.y, text: phrase,
              fontFamily: current.font,
              fontSize: fontSize,
              fontWeight: weight,
              fill: current.fg,
              textAnchor: 'middle',
              dominantBaseline: 'central',
            }));
          }
          return SaiyanSVG.doc({ width: W, height: H, body: body.join('') });
        },
      };

      return function teardown() {
        host.__breathe = null;
        try { inst.remove(); } catch (e) { console.error('breathe teardown error', e); }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__breathe;
      if (api && typeof api.update === 'function') api.update(ctx);
    },
  });
})();
