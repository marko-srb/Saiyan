/* ============================================================
   REPEL — text effect (particle field forming text, repelled by cursor)

   Direct integration of an existing prototype (cursor-repel.html).
   The original physics constants and forces are preserved verbatim —
   only surface adaptations to plug into the Saiyan registry, color
   system, and resize lifecycle.

   Mechanic:
     - opentype.js loads Inter 900 from a CDN and gives us a Path2D
       for the typed text.
     - We sample a grid of points across the text bounding box,
       keeping only points that fall inside the glyph fill (using
       canvas's isPointInPath).
     - Each kept point becomes a "particle" with a home position.
     - Each frame: cursor-repel force, spring-back to home, damping,
       integrate, hard-clamp drift distance from home.
     - Particles are drawn as filled circles.

   Font:
     The prototype hardcodes Inter 900 because it samples glyph paths
     at a specific weight. Doesn't tie into the app's font catalog —
     this effect always uses Inter 900 to keep the prototype's
     behavior intact.

   Cursor:
     The original prototype set `cursor: none` on body. We don't hide
     the cursor at all — the app's parent .canvas-wrap provides the
     X-with-circle cursor in fullscreen, and the default cursor in
     normal mode. Both inherit naturally into the canvas.
============================================================ */
(function () {
  'use strict';

  registerEffect({
    id: 'repel',
    mode: 'text',
    name: 'Repel',
    description: "A particle field shaped into the typed word. Particles flee from the cursor and spring back to their home positions.",
    colorSlots: 2,    // background + particles

    controls: [
      {
        group: 'Text',
        open: true,
        items: [
          { type: 'text', key: 'text', label: '', default: 'SAIYAN',
            placeholder: 'Type here. Use | for line breaks.', maxlength: 80 },
        ],
      },
      {
        group: 'Effect',
        open: true,
        items: [
          // Density of the particle grid sampled inside glyphs.
          // Lower = more particles (denser fill). Original was 7.
          { type: 'slider', key: 'gridStep',     label: 'Density',     min: 4,  max: 16,  step: 1, default: 7 },
          // Particle dot radius. Original was 2.0.
          { type: 'slider', key: 'dotSize',      label: 'Dot size',    min: 1,  max: 6,   step: 0.5, default: 2 },
          // Cursor repel radius in pixels. Original was 130. Max
          // doubled (was 300) so the user can scatter particles from
          // well outside the word's bounding box.
          { type: 'slider', key: 'repelRadius',  label: 'Repel radius', min: 50, max: 600, step: 5, default: 130 },
          // Force strength of cursor repel. Original was 1200.
          { type: 'slider', key: 'repelStrength', label: 'Force',       min: 200, max: 3000, step: 50, default: 1200 },
          // Particle shape. 'dot' is the original prototype look.
          { type: 'select', key: 'shape',        label: 'Shape',
            options: [
              { value: 'dot',      label: 'Dot' },
              { value: 'square',   label: 'Square' },
              { value: 'triangle', label: 'Triangle' },
            ],
            default: 'dot' },
          { type: 'checkbox', key: 'invert', label: 'Invert', default: false },
        ],
      },
      {
        group: 'Font',
        open: false,
        items: [
          // Font family. Mode-aware: brand mode lists only fonts
          // declared in the brand's typography list (filtered to
          // what we ship a glyph file for); Custom mode lists the
          // Google-font subset.
          { type: 'select', key: 'fontFamily', label: 'Font',
            options: (params, ctx) => {
              const isCustom = !ctx || ctx.brand == null;
              const customFonts = ['Inter', 'Anton', 'Instrument Serif', 'Playfair Display', 'IBM Plex Mono'];
              if (isCustom) return customFonts;
              // ctx.brand is the brand NAME (a string). The typography
              // list is exposed as ctx.fonts by buildCtx().
              const brandFonts = (ctx && ctx.fonts) || ['Inter'];
              const supported = ['Inter', 'Source Serif', 'EB Garamond', 'Aktiv Grotesk',
                                 'Proxima Nova', 'Recoleta', 'DM Mono', 'Söhne Breit', 'Knockout'];
              return brandFonts.filter(f => supported.includes(f));
            },
            // null → runtime picks the brand's first supported font
            // (see resolveFont). Mirrors Drumroll's pattern so brand
            // selection lands on the brand's primary face, not Inter.
            default: null },
          // Weight. Options depend on the selected family — variable
          // fonts and single-weight fonts return an empty list, which
          // makes the renderer skip the dropdown entirely (no point
          // showing a weight picker with one choice).
          { type: 'select', key: 'fontWeight', label: 'Weight',
            options: (params, ctx) => {
              const fam = (params && params.fontFamily) || 'Inter';
              // Per-family static weight lists. Anything not listed
              // here, plus all variable fonts, → single-weight, hide.
              const STATIC_WEIGHTS = {
                'Inter':         ['Regular', 'Semibold', 'Bold'],
                'Aktiv Grotesk': ['Regular', 'Bold'],
                'Proxima Nova':  ['Regular', 'Semibold', 'Bold'],
                'Recoleta':      ['Regular', 'Semibold', 'Bold'],
                'Söhne Breit':   ['Regular', 'Semibold', 'Bold'],
                'IBM Plex Mono': ['Regular', 'Semibold', 'Bold'],
              };
              const list = STATIC_WEIGHTS[fam];
              // Hide the dropdown by returning [] when only one
              // weight (or none) is available for this family.
              if (!list || list.length < 2) return [];
              return list;
            },
            default: 'Regular' },
        ],
      },
    ],

    mount(host, initialCtx) {
      // Constants from the original prototype — preserved verbatim
      // (those that aren't user-controllable).
      const RETURN_FORCE = 0.018;
      const DAMPING      = 0.84;
      const MAX_DRIFT    = 80;
      const FONT_SIZE    = 280;

      // ---- Font catalog ----
      // Maps {family, weight} → glyph file URL that opentype.js can
      // load. Only entries listed here are exposed in the dropdowns.
      //
      // Variable fonts are flagged so we only offer "Regular" for
      // them: opentype.js renders variable fonts at their default
      // instance (typically 400) and doesn't honor weight axes, so
      // exposing Semibold/Bold for Inter or Source Serif would show
      // identical particle fields. We keep the dropdown honest.
      //
      // Knockout: a single entry (Welterweight). Knockout's "weights"
      // are actually distinct widths — exposing one as Regular keeps
      // the dropdown coherent.
      //
      // Brand fonts come from local /fonts/. Custom-mode fonts come
      // from fontsource (raw TTF files, same pattern as the original
      // Inter URL).
      const REPEL_FONT_CATALOG = {
        // ---- Brand fonts (served from window.REPEL_FONT_BUNDLE) ----
        // The values below are LOOKUP KEYS, not network URLs. Repel
        // resolves them against the bundled data-URL map at load
        // time, so the project works fully over file:// with no
        // server. The keys are kept human-readable (matching the
        // file paths) for grep-ability.
        // Inter: routed through bundled fontsource static files so
        // each of Regular / Semibold / Bold actually has a different
        // glyph set (the local variable Inter renders only at its
        // default instance with opentype.js 1.3.4).
        'Inter':         { variable: false, files: {
            Regular:  'cm:Inter-Regular',
            Semibold: 'cm:Inter-Semibold',
            Bold:     'cm:Inter-Bold',
        }},
        'Source Serif':  { variable: true,  files: { Regular: 'fonts/source-serif/SourceSerif4.ttf' } },
        'EB Garamond':   { variable: true,  files: { Regular: 'fonts/eb-garamond/EBGaramond.ttf' } },
        'Aktiv Grotesk': { variable: false, files: {
            Regular: 'fonts/aktiv-grotesk/AktivGrotesk-Regular.ttf',
            Bold:    'fonts/aktiv-grotesk/AktivGrotesk-Bold.ttf',
        }},
        'Proxima Nova':  { variable: false, files: {
            Regular:  'fonts/proxima-nova/ProximaNova-Regular.otf',
            Semibold: 'fonts/proxima-nova/ProximaNova-Semibold.otf',
            Bold:     'fonts/proxima-nova/ProximaNova-Bold.otf',
        }},
        // Recoleta ships as woff2 in /fonts/, but woff2 isn't
        // parseable by opentype.js — the bundle stores a
        // pre-decompressed TTF for each weight, hence the .ttf path.
        'Recoleta':      { variable: false, files: {
            Regular:  'fonts/recoleta/Recoleta-Regular.ttf',
            Semibold: 'fonts/recoleta/Recoleta-SemiBold.ttf',
            Bold:     'fonts/recoleta/Recoleta-Bold.ttf',
        }},
        'DM Mono':       { variable: false, files: {
            Regular: 'fonts/dm-mono/DMMono-Regular.ttf',
        }},
        'Söhne Breit':   { variable: false, files: {
            Regular:  'fonts/sohne-breit/SohneBreit-Buch.otf',
            Semibold: 'fonts/sohne-breit/SohneBreit-Dreiviertelfett.otf',
            Bold:     'fonts/sohne-breit/SohneBreit-Extrafett.otf',
        }},
        'Knockout':      { variable: false, files: {
            Regular: 'fonts/knockout/Knockout-50-Welterweight.otf',
        }},

        // ---- Custom-mode fonts (cm: keys, also bundled) ----
        'Anton':            { variable: false, files: { Regular: 'cm:Anton' } },
        'Playfair Display': { variable: true,  files: { Regular: 'cm:Playfair' } },
        'Instrument Serif': { variable: false, files: { Regular: 'cm:InstrumentSerif' } },
        'IBM Plex Mono':    { variable: false, files: {
            Regular:  'cm:IBMPlex-Regular',
            Semibold: 'cm:IBMPlex-Semibold',
            Bold:     'cm:IBMPlex-Bold',
        }},
      };

      // Custom-mode fonts (the four Google fonts not used by any
      // brand). Mirrors the global CUSTOM_FONTS in index.html but
      // scoped to fonts Repel can actually load via opentype.js.
      const REPEL_CUSTOM_FONTS = ['Inter', 'Anton', 'Instrument Serif', 'Playfair Display', 'IBM Plex Mono'];

      // Returns the families allowed in the current mode. Brand mode
      // shows only that brand's typography (filtered to what we have
      // a glyph file for); Custom mode shows REPEL_CUSTOM_FONTS.
      function allowedFamilies(c) {
        const isCustom = !c || c.brand == null;
        if (isCustom) return REPEL_CUSTOM_FONTS.filter(f => REPEL_FONT_CATALOG[f]);
        // c.brand is the brand NAME (a string). The typography list
        // is on c.fonts (set by buildCtx in index.html).
        const brandFonts = (c && c.fonts) || ['Inter'];
        return brandFonts.filter(f => REPEL_FONT_CATALOG[f]);
      }

      // Weight options for a given family — only weights we actually
      // ship a separate file for. Variable fonts collapse to Regular
      // because opentype.js can't render their other axis values.
      function weightsFor(family) {
        const entry = REPEL_FONT_CATALOG[family];
        if (!entry) return ['Regular'];
        if (entry.variable) return ['Regular'];
        return Object.keys(entry.files);
      }

      // Resolve {family, weight} → URL, with fallbacks if the saved
      // pair is no longer valid (e.g. user switched brand). Returns
      // { family, weight, url }.
      function resolveFont(family, weight) {
        const allowed = allowedFamilies(current.ctx);
        const fam = allowed.includes(family) ? family : (allowed[0] || 'Inter');
        const weights = weightsFor(fam);
        const wt = weights.includes(weight) ? weight : weights[0];
        const url = REPEL_FONT_CATALOG[fam].files[wt];
        return { family: fam, weight: wt, url };
      }

      // Cache of loaded opentype Font instances, keyed by URL. Lets
      // users switch back to a previously-used font instantly.
      const fontCache = new Map();
      // URLs that have already failed once. Keeps the draw loop from
      // re-firing the same broken request 60 times a second.
      const failedUrls = new Set();

      const current = {
        ctx: initialCtx,
        bg: initialCtx.colors[0] || '#0a0a0a',
        fg: initialCtx.colors[1] || '#f2f2f2',
      };

      function applyDerived() {
        const c = current.ctx;
        const bg = c.colors[0] || '#0a0a0a';
        const fg = c.colors[1] || '#f2f2f2';
        if (c.params.invert) { current.bg = fg; current.fg = bg; }
        else                 { current.bg = bg; current.fg = fg; }
      }
      applyDerived();

      // Cursor stays visible. The original prototype hid it; we let
      // the app handle the cursor (default in normal mode, the
      // X-with-circle cursor in fullscreen — both inherited from
      // .canvas-wrap, so we don't override anything here).

      // Particle state. Re-sampled when text/size/grid/font changes.
      let particles = [];
      let lastSampleKey = '';        // debounce identical re-samples
      // Currently-active font, if loaded. Set by ensureFontLoaded
      // after a successful load. While null we render a "loading…"
      // placeholder.
      let activeFont = null;
      let activeFontUrl = '';
      // Track which URL is currently being fetched so we don't
      // start two concurrent loads for the same file.
      let pendingFontUrl = '';

      // Load the font for a given URL on demand. Cached: if the URL
      // was already fetched we reuse the parsed Font instance.
      //
      // Resolution order:
      //   1. fontCache (already parsed)
      //   2. window.REPEL_FONT_BUNDLE (base64 data URL — works on
      //      file://, no network)
      //   3. fall through to fetch (allows external URLs if anyone
      //      adds one to the catalog)
      function ensureFontLoaded(url) {
        if (activeFontUrl === url && activeFont) return;
        if (fontCache.has(url)) {
          activeFont = fontCache.get(url);
          activeFontUrl = url;
          // New font → existing particle layout is invalid.
          lastSampleKey = '';
          return;
        }
        if (failedUrls.has(url)) return;        // already known to fail; don't retry
        if (pendingFontUrl === url) return;     // already loading
        if (typeof opentype === 'undefined') {
          console.warn('opentype.js not loaded — Repel effect cannot sample text.');
          return;
        }
        pendingFontUrl = url;
        // While loading, drop activeFont so the draw loop shows the
        // placeholder instead of the previous font's stale glyphs.
        activeFont = null;
        activeFontUrl = '';

        // Synchronous path: bundle hit. Parse immediately, no fetch.
        const bundle = (typeof window !== 'undefined') ? window.REPEL_FONT_BUNDLE : null;
        if (bundle && bundle[url]) {
          try {
            // data URL → base64 payload → ArrayBuffer
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
            lastSampleKey = '';
          } catch (err) {
            pendingFontUrl = '';
            failedUrls.add(url);
            console.error('Repel: bundled font parse failed for', url, err);
          }
          return;
        }

        // Fallback: external fetch. Resolve the URL against the page
        // so relative paths work even if the document baseURI has
        // been mutated. This path is for any future remote URLs in
        // the catalog; the bundle covers everything we ship today.
        const resolved = new URL(url, document.baseURI).href;
        fetch(resolved)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status} for ${resolved}`);
            return r.arrayBuffer();
          })
          .then(buf => {
            if (pendingFontUrl !== url) return;   // stale (user switched)
            const font = opentype.parse(buf);
            pendingFontUrl = '';
            fontCache.set(url, font);
            activeFont = font;
            activeFontUrl = url;
            lastSampleKey = '';                   // force resample
          })
          .catch(err => {
            if (pendingFontUrl !== url) return;
            pendingFontUrl = '';
            failedUrls.add(url);
            console.error('Repel: font load failed for', resolved, err);
          });
      }

      function sampleText(font, width, height, phrase, gridStep) {
        const path = font.getPath(phrase, 0, 0, FONT_SIZE);
        const bbox = path.getBoundingBox();
        const textW = bbox.x2 - bbox.x1;
        const textH = bbox.y2 - bbox.y1;
        const offsetX = width / 2 - textW / 2 - bbox.x1;
        const offsetY = height / 2 - textH / 2 - bbox.y1;

        const path2d = new Path2D();
        for (const cmd of path.commands) {
          if (cmd.type === 'M')      path2d.moveTo(cmd.x, cmd.y);
          else if (cmd.type === 'L') path2d.lineTo(cmd.x, cmd.y);
          else if (cmd.type === 'C') path2d.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          else if (cmd.type === 'Q') path2d.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
          else if (cmd.type === 'Z') path2d.closePath();
        }

        const offCanvas = document.createElement('canvas');
        offCanvas.width = 1; offCanvas.height = 1;
        const ctx = offCanvas.getContext('2d');

        const newParticles = [];
        for (let y = bbox.y1; y <= bbox.y2; y += gridStep) {
          for (let x = bbox.x1; x <= bbox.x2; x += gridStep) {
            if (ctx.isPointInPath(path2d, x, y)) {
              const homeX = x + offsetX;
              const homeY = y + offsetY;
              newParticles.push({ homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0 });
            }
          }
        }
        return newParticles;
      }

      function ensureSampled() {
        const c = current.ctx;
        const phrase = ((c.params.text || '').trim() || 'SAIYAN');
        const gridStep = Math.max(4, Math.min(16, c.params.gridStep || 7));
        // Font is part of the cache key — switching family/weight
        // invalidates the previous particle layout.
        const key = `${c.width}x${c.height}|${phrase}|${gridStep}|${activeFontUrl}`;
        if (key === lastSampleKey) return;
        if (!activeFont) return;     // wait until current font is loaded
        particles = sampleText(activeFont, c.width, c.height, phrase, gridStep);
        lastSampleKey = key;
      }

      // Resolve the font from current params and ensure it's loaded.
      // Called every frame so the user changing the dropdown takes
      // effect promptly. Cheap when nothing changed (cache hit on
      // the URL is a Map.get).
      function ensureCurrentFont() {
        const params = current.ctx.params || {};
        const resolved = resolveFont(params.fontFamily, params.fontWeight);
        // Write the resolved values back if they got snapped to
        // fallbacks (e.g. user switched brand mid-session).
        if (params.fontFamily !== resolved.family) params.fontFamily = resolved.family;
        if (params.fontWeight !== resolved.weight) params.fontWeight = resolved.weight;
        ensureFontLoaded(resolved.url);
      }
      ensureCurrentFont();

      const sketch = (p) => {
        // Track cursor in canvas-local coords. Initialize off-canvas.
        let mx = -9999, my = -9999;

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

          // Pick up any font dropdown changes. Triggers an async load
          // if the user switched to an uncached font.
          ensureCurrentFont();

          // Loading state if the active font isn't ready yet.
          if (!activeFont) {
            dctx.fillStyle = current.fg;
            dctx.font = '14px sans-serif';
            dctx.textAlign = 'center';
            dctx.textBaseline = 'middle';
            dctx.fillText('loading font…', c.width / 2, c.height / 2);
            return;
          }

          ensureSampled();

          const repelRadius   = Math.max(10, params.repelRadius || 130);
          const repelStrength = Math.max(50, params.repelStrength || 1200);
          const dotSize       = Math.max(0.5, params.dotSize || 2);
          const r2 = repelRadius * repelRadius;
          const maxDrift2 = MAX_DRIFT * MAX_DRIFT;

          for (const part of particles) {
            // cursor repel
            const dx = part.x - mx;
            const dy = part.y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < r2 && d2 > 0.01) {
              const d = Math.sqrt(d2);
              const force = repelStrength / d2;
              part.vx += (dx / d) * force;
              part.vy += (dy / d) * force;
            }
            // spring back to home
            part.vx += (part.homeX - part.x) * RETURN_FORCE;
            part.vy += (part.homeY - part.y) * RETURN_FORCE;
            // damping
            part.vx *= DAMPING;
            part.vy *= DAMPING;
            // integrate
            part.x += part.vx;
            part.y += part.vy;

            // hard clamp on drift distance from home
            const ox = part.x - part.homeX;
            const oy = part.y - part.homeY;
            const od2 = ox * ox + oy * oy;
            if (od2 > maxDrift2) {
              const od = Math.sqrt(od2);
              const scale = MAX_DRIFT / od;
              part.x = part.homeX + ox * scale;
              part.y = part.homeY + oy * scale;
              const nx = -ox / od, ny = -oy / od;
              const vDotN = part.vx * nx + part.vy * ny;
              if (vDotN < 0) {
                part.vx -= vDotN * nx;
                part.vy -= vDotN * ny;
              }
            }
          }

          dctx.fillStyle = current.fg;
          // dotSize was the circle radius in the original. For square
          // and triangle we treat it as a half-size so all three
          // shapes occupy a similar visual footprint at the same
          // slider value.
          const shape = params.shape || 'dot';
          if (shape === 'square') {
            const s = dotSize * 2;
            for (const part of particles) {
              dctx.fillRect(part.x - dotSize, part.y - dotSize, s, s);
            }
          } else if (shape === 'triangle') {
            // Equilateral, point-up, centered on the particle.
            // h = sqrt(3) * size; we keep the centroid on (x, y).
            const h = dotSize * Math.sqrt(3);
            const top = h * (2 / 3);
            const bot = h * (1 / 3);
            for (const part of particles) {
              dctx.beginPath();
              dctx.moveTo(part.x,            part.y - top);
              dctx.lineTo(part.x + dotSize,  part.y + bot);
              dctx.lineTo(part.x - dotSize,  part.y + bot);
              dctx.closePath();
              dctx.fill();
            }
          } else {
            // dot — original behavior
            for (const part of particles) {
              dctx.beginPath();
              dctx.arc(part.x, part.y, dotSize, 0, Math.PI * 2);
              dctx.fill();
            }
          }
        };
      };

      const inst = new p5(sketch, host);

      host.__repel = {
        update(newCtx) {
          current.ctx = newCtx;
          applyDerived();
          if (inst.width !== newCtx.width || inst.height !== newCtx.height) {
            inst.resizeCanvas(newCtx.width, newCtx.height);
            // Resize triggers a resample on next draw via lastSampleKey mismatch.
          }
        },
      };

      return function teardown() {
        host.__repel = null;
        try { inst.remove(); } catch (e) { console.error('repel teardown error', e); }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__repel;
      if (api && typeof api.update === 'function') api.update(ctx);
    },
  });
})();
