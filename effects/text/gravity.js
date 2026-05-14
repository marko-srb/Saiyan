/* ============================================================
   GRAVITY — text effect (matter.js physics, letters fall and settle)

   Direct integration of an existing prototype (gravity-drop.html).
   The original physics constants and lifecycle (falling → holding →
   re-drop loop) are preserved verbatim — only surface adaptations to
   plug into the Saiyan registry, color system, and resize lifecycle.

   Mechanic:
     - Each letter of the typed word becomes a rectangular rigid body
       in matter.js. Bodies start above the canvas, fall under gravity.
     - Walls on left, right, bottom catch them (top is open so letters
       can drop in from above).
     - When all bodies settle (low velocity for SETTLE_FRAMES frames),
       hold for HOLD_FRAMES then re-drop with new random positions /
       angles.
     - Mouse can drag letters via matter.js MouseConstraint.

   Font:
     The prototype uses Helvetica via p5's textFont. We hook into the
     app's font system so the user can pick from the same font catalog
     as other effects.

   Vector-clean: per letter = one fillText (translated/rotated by body
     position). N letters per frame.
============================================================ */
(function () {
  'use strict';

  function pickFont(availableFonts, chosen) {
    const list = Array.isArray(availableFonts) ? availableFonts : [];
    if (chosen && list.includes(chosen)) return chosen;
    return list[0] || 'sans-serif';
  }

  function pickPreferredWeight(weights) {
    if (!Array.isArray(weights) || weights.length === 0) return 700;
    if (weights.includes(700)) return 700;
    if (weights.includes(900)) return 900;
    return weights.slice().sort((a, b) => Math.abs(a - 700) - Math.abs(b - 700))[0];
  }

  function fontShorthand(family, sizePx, weight) {
    const safe = /\s/.test(family) ? `"${family}"` : family;
    let w = '';
    if (typeof weight === 'number' && weight > 0) w = `${weight} `;
    else if (typeof weight === 'string' && /^\d+$/.test(weight) && +weight > 0) w = `${+weight} `;
    return `${w}${sizePx}px ${safe}, sans-serif`;
  }

  registerEffect({
    id: 'gravity',
    mode: 'text',
    name: 'Gravity',
    description: "Letters of the typed word fall in under gravity, collide, and settle. Cycle re-drops with new randomized positions. Letters are draggable.",
    colorSlots: 2,    // background + letter fill

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
          // Font size in pixels. Original prototype was 200.
          { type: 'slider', key: 'fontSize', label: 'Font size',  min: 60,  max: 500, step: 10, default: 200 },
          // Gravity multiplier. Matter.js default is ~1.0 (in their
          // arbitrary units). Original was 1.0.
          { type: 'slider', key: 'gravity',  label: 'Gravity',    min: 1,   max: 50,  step: 1,  default: 10 },
          // Bounciness 0..1. Matter calls this "restitution".
          { type: 'slider', key: 'bounce',   label: 'Bounce',     min: 0,   max: 100, step: 1,  default: 25 },
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
              const list = ctx && ctx.weightsForFont ? ctx.weightsForFont(fam) : [400];
              // Single-weight families (Knockout, Anton, Instrument
              // Serif) → return [] so the dropdown hides entirely.
              // No point showing a picker with one option.
              if (!Array.isArray(list) || list.length < 2) return [];
              return list;
            },
            default: null },
        ],
      },
    ],

    mount(host, initialCtx) {
      // Constants from the original prototype — preserved verbatim
      // (those that aren't user-controllable).
      const FRICTION         = 0.4;
      const SETTLE_THRESHOLD = 0.15;
      const SETTLE_FRAMES    = 30;
      const HOLD_FRAMES      = 90;

      if (typeof Matter === 'undefined') {
        console.warn('matter.js not loaded — Gravity effect cannot run.');
      }
      const M = (typeof Matter !== 'undefined') ? Matter : null;

      const current = {
        ctx: initialCtx,
        font:   pickFont(initialCtx.fonts, initialCtx.params.font),
        weight: 700,
        bg: initialCtx.colors[0] || '#0a0a0a',
        fg: initialCtx.colors[1] || '#f2f2f2',
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

        const bg = c.colors[0] || '#0a0a0a';
        const fg = c.colors[1] || '#f2f2f2';
        if (c.params.invert) { current.bg = fg; current.fg = bg; }
        else                 { current.bg = bg; current.fg = fg; }
      }
      applyDerived();

      // Physics state
      let engine = null;
      let world = null;
      let letters = [];   // { char, body, w, h }
      let walls = [];
      let mouseConstraint = null;

      let stillCount = 0;
      let holdCount = 0;
      let phase = 'falling';

      // Track inputs that require rebuilding the scene.
      let lastBuildKey = '';

      function buildWalls(p, width, height) {
        if (!M) return;
        if (walls.length) M.World.remove(world, walls);
        walls = [];
        const t = 100;
        walls.push(M.Bodies.rectangle(width / 2, height + t / 2, width * 2, t, { isStatic: true }));
        walls.push(M.Bodies.rectangle(-t / 2, height / 2, t, height * 2, { isStatic: true }));
        walls.push(M.Bodies.rectangle(width + t / 2, height / 2, t, height * 2, { isStatic: true }));
        M.World.add(world, walls);
      }

      function buildScene(p) {
        if (!M) return;
        const c = current.ctx;
        const params = c.params;
        const phrase = (params.text || '').trim() || 'SAIYAN';
        const fontSize = Math.max(20, params.fontSize || 200);
        const gravityRaw = Math.max(0.1, (params.gravity || 10) / 10);  // slider 1-50 maps to 0.1-5.0
        const restitution = Math.max(0, Math.min(1, (params.bounce || 25) / 100));

        // Tear down old engine/world.
        if (engine) {
          if (mouseConstraint) {
            M.World.remove(world, mouseConstraint);
            mouseConstraint = null;
          }
          M.Engine.clear(engine);
          engine = null;
          world = null;
        }

        engine = M.Engine.create();
        world = engine.world;
        world.gravity.y = gravityRaw;

        buildWalls(p, c.width, c.height);

        // Set up p5's text metrics so we can measure each char width
        // at the chosen font/weight/size.
        p.textFont(current.font);
        p.textStyle(p.NORMAL);  // weight handled via fontShorthand below
        p.textSize(fontSize);

        // For more accurate char widths with weight applied, switch to
        // raw context font:
        const dctx = p.drawingContext;
        dctx.font = fontShorthand(current.font, fontSize, current.weight);

        const chars = phrase.split('');
        letters = [];
        for (const c2 of chars) {
          const w = dctx.measureText(c2).width * 0.95;
          const h = fontSize * 0.78;
          const body = M.Bodies.rectangle(0, -500, w, h, {
            restitution,
            friction: FRICTION,
            density: 0.002,
          });
          letters.push({ char: c2, body, w, h });
          M.World.add(world, body);
        }

        // Mouse constraint — uses the canvas element from p5.
        const canvasEl = p.canvas;
        if (canvasEl) {
          const mouse = M.Mouse.create(canvasEl);
          // p5 may apply pixelDensity to the canvas; matter expects
          // device-pixel coords. Set pixelRatio so drag math aligns.
          mouse.pixelRatio = (typeof p.pixelDensity === 'function') ? p.pixelDensity() : 1;
          mouseConstraint = M.MouseConstraint.create(engine, {
            mouse,
            constraint: { stiffness: 0.2, render: { visible: false } },
          });
          M.World.add(world, mouseConstraint);
        }

        drop(p);
      }

      function drop(p) {
        if (!M || !letters.length) return;
        const c = current.ctx;
        const order = letters.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        for (let k = 0; k < order.length; k++) {
          const L = letters[order[k]];
          const x = c.width * 0.15 + Math.random() * (c.width * 0.70);
          const y = -200 - Math.random() * 800;
          M.Body.setPosition(L.body, { x, y });
          M.Body.setVelocity(L.body, { x: (Math.random() - 0.5) * 3, y: 0 });
          M.Body.setAngularVelocity(L.body, (Math.random() - 0.5) * 0.16);
          M.Body.setAngle(L.body, (Math.random() - 0.5) * 0.8);
        }
        stillCount = 0;
        holdCount = 0;
        phase = 'falling';
      }

      function allStill() {
        for (const L of letters) {
          const v = L.body.velocity;
          const av = L.body.angularVelocity;
          const speed = Math.hypot(v.x, v.y);
          if (speed > SETTLE_THRESHOLD || Math.abs(av) > SETTLE_THRESHOLD * 0.5) return false;
        }
        return true;
      }

      const sketch = (p) => {
        p.setup = () => {
          const cv = p.createCanvas(current.ctx.width, current.ctx.height);
          cv.parent(host);
          p.frameRate(60);
          buildScene(p);
        };

        p.draw = () => {
          if (!M) return;
          const c      = current.ctx;
          const params = c.params;
          const dctx   = p.drawingContext;

          // Rebuild scene when key inputs change. Buildkey covers
          // everything that affects body shapes, gravity, bounce, etc.
          const phrase = (params.text || '').trim() || 'SAIYAN';
          const fontSize = Math.max(20, params.fontSize || 200);
          const buildKey = `${c.width}x${c.height}|${phrase}|${current.font}|${current.weight}|${fontSize}|${params.gravity}|${params.bounce}`;
          if (buildKey !== lastBuildKey) {
            buildScene(p);
            lastBuildKey = buildKey;
          }

          // Background
          dctx.fillStyle = current.bg;
          dctx.fillRect(0, 0, c.width, c.height);

          M.Engine.update(engine);

          if (phase === 'falling') {
            if (allStill()) stillCount++; else stillCount = 0;
            if (stillCount >= SETTLE_FRAMES) {
              phase = 'holding';
              holdCount = 0;
            }
          } else if (phase === 'holding') {
            holdCount++;
            if (holdCount >= HOLD_FRAMES) drop(p);
          }

          // Render letters using their body's position and angle.
          dctx.fillStyle = current.fg;
          dctx.font = fontShorthand(current.font, fontSize, current.weight);
          dctx.textAlign = 'center';
          dctx.textBaseline = 'middle';

          for (const L of letters) {
            const { x, y } = L.body.position;
            dctx.save();
            dctx.translate(x, y);
            dctx.rotate(L.body.angle);
            dctx.fillText(L.char, 0, 0);
            dctx.restore();
          }
        };
      };

      const inst = new p5(sketch, host);

      host.__gravity = {
        update(newCtx) {
          current.ctx = newCtx;
          applyDerived();
          if (inst.width !== newCtx.width || inst.height !== newCtx.height) {
            inst.resizeCanvas(newCtx.width, newCtx.height);
            // Walls + scene will rebuild on next draw via buildKey mismatch.
            lastBuildKey = '';
          }
        },
      };

      return function teardown() {
        host.__gravity = null;
        try {
          if (M && engine) {
            if (mouseConstraint) M.World.remove(world, mouseConstraint);
            M.Engine.clear(engine);
          }
        } catch (e) { console.error('gravity teardown engine cleanup error', e); }
        try { inst.remove(); } catch (e) { console.error('gravity teardown error', e); }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__gravity;
      if (api && typeof api.update === 'function') api.update(ctx);
    },
  });
})();
