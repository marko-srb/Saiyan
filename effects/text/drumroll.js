/* ============================================================
   DRUMROLL — text effect (per-letter scale + rotation pulses)

   Mechanic, in plain words:
     1. Render the text once at the chosen font/size, baseline-aligned.
     2. For EACH CHARACTER: assign it a phase offset along a continuous
        time axis. The phase determines where in its cycle that letter
        currently is.
     3. Animate two things per letter on that phase: a SCALE pulse
        (1.0 → max → back to 1.0) and a ROTATION pulse (0 → ±max → 0).
        Both pulses are driven by sinusoidal time so the motion is
        smooth and the cycle loops seamlessly for exports.
     4. Stagger spreads the per-letter phases across the cycle so
        letters don't all peak together — that's the "rolling" feel.
     5. Composite each letter with `globalCompositeOperation = 'difference'`
        so wherever two transformed letters overlap, the colors invert.
        Black on background → black. Black on black → background-color.
        Matches the inversion seen in the reference video where letters
        cross each other as they grow.

   Why the cycle is sinusoidal rather than snap/bucket (like Fracture):
     The reference is a SMOOTH ANIMATION — letters grow, peak, shrink,
     all continuously. Snap-style RNG (used in Fracture) would feel
     jittery here. We want a steady pulse, like a drum roll.

   Why difference compositing instead of XOR:
     Difference is well-defined for any color pair (subtract channel
     values, take absolute) and produces the inversion look reliably
     against any background — black on blue gives black, black on black
     gives blue. XOR is bitwise and only works cleanly for pure black/
     white. Maps directly to SVG's mix-blend-mode: difference for
     future SVG export.

   Vector-cleanness:
     Every paint is fillText at a specific transform. No clipping
     against rasterized buffers, no per-pixel sampling. Each letter
     is one save/transform/fillText/restore cycle. SVG export is
     trivial: one <text transform="..."> per letter, with
     mix-blend-mode on the parent group.
============================================================ */
(function () {
  'use strict';

  // -------- Font helpers (same shape as Fracture) --------
  function pickFont(availableFonts, chosen) {
    const list = Array.isArray(availableFonts) ? availableFonts : [];
    if (chosen && list.includes(chosen)) return chosen;
    // Drumroll prefers a beefy display sans/grotesque rather than a serif —
    // the reference uses a heavy condensed face. Fall back to first if no
    // grotesque/display match.
    const heavy = list.find(f => /knockout|aktiv|grotesk|breit|anton/i.test(f));
    return heavy || list[0] || 'sans-serif';
  }

  function pickPreferredWeight(weights) {
    if (!Array.isArray(weights) || weights.length === 0) return 700;
    // Drumroll wants weight: bold or heavier reads better at extreme
    // scales. Prefer 700/800/900 over 400.
    if (weights.includes(900)) return 900;
    if (weights.includes(800)) return 800;
    if (weights.includes(700)) return 700;
    if (weights.includes(600)) return 600;
    return weights[weights.length - 1];
  }

  function fontShorthand(family, sizePx, weight) {
    const safe = /\s/.test(family) ? `"${family}"` : family;
    let w = '';
    if (typeof weight === 'number' && weight > 0) w = `${weight} `;
    else if (typeof weight === 'string' && /^\d+$/.test(weight) && +weight > 0) w = `${+weight} `;
    return `${w}${sizePx}px ${safe}, sans-serif`;
  }

  // Smooth easing: a cosine-based pulse that rises from 0 → 1 → 0 over
  // one cycle. phi is in [0, 1) where 0 means "start of cycle" and the
  // pulse peaks at phi=0.5. Loops seamlessly because sin(0) === sin(2π).
  function pulse01(phi) {
    return (1 - Math.cos(phi * Math.PI * 2)) / 2;
  }

  // Same shape but signed [-1, 1], for rotation that swings both ways.
  function pulseBipolar(phi) {
    return Math.sin(phi * Math.PI * 2);
  }

  // Cubic ease-in-out for keyframe interpolation. Smooths transitions
  // between Three Stage keyframes so motion doesn't feel mechanical at
  // the stage boundaries.
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Linear interpolate between keyframes. Given an array of {at, value}
  // (at is normalized 0..1 along the cycle), find the segment containing
  // `phi` and return the eased interpolation. The first/last keyframes
  // form a loop boundary: a keyframe at 1.0 should equal the one at 0.0
  // for a seamless cycle.
  function keyframe(frames, phi, ease) {
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i];
      const b = frames[i + 1];
      if (phi >= a.at && phi <= b.at) {
        const span = Math.max(1e-6, b.at - a.at);
        const t = (phi - a.at) / span;
        const eased = ease ? ease(t) : t;
        return a.value + (b.value - a.value) * eased;
      }
    }
    return frames[frames.length - 1].value;
  }

  // Compute the (scaleX, scaleY, rotation) for one letter at this moment.
  // Each preset maps the global phase + per-letter personality differently.
  //
  // Inputs:
  //   preset       — schema-driven preset id ('loop', 'playful')
  //   baseT        — global cycle phase, 0..1
  //   letterIdx    — which letter we're computing (used for stagger)
  //   letterCount  — total letters in the line
  //   personality  — array of three per-letter hash values in [0,1]:
  //                    [0] = x/y bias (which axis grows more)
  //                    [1] = rotation magnitude multiplier (some letters
  //                          rotate a lot, others barely)
  //                    [2] = rotation direction tendency (-1 to +1, smooth)
  //   stagger01    — slider value 0..1
  //   scaleMax     — slider value, ≥ 1
  //   rotateMaxRad — slider value in radians, ≥ 0
  //
  // Returns: { sx, sy, rot } where rot is in radians.
  //
  // Important invariant: at the IDLE state (scale=1, rotation=0), every
  // letter must render exactly as plain typed text — no x/y bias, no
  // per-letter quirks. The bias only kicks in once letters start growing.
  function computeMotion(preset, baseT, letterIdx, letterCount, personality, stagger01, scaleMax, rotateMaxRad) {
    const xyBias = personality[0];      // 0..1
    const rotMagMul = personality[1];   // 0..1, used as multiplier 0.3..1.0
    const rotDirRaw = personality[2];   // 0..1
    // Bias normalized to a multiplier centered at 1.0, range 0.75..1.25.
    // Applied to the scale DELTA (not base scale) so identity is preserved
    // when no scaling is active.
    const biasNorm = 0.75 + xyBias * 0.5;
    // Rotation magnitude per letter: 30%..100% of slider value. So even
    // at high slider values some letters rotate subtly.
    const rotMagFactor = 0.3 + rotMagMul * 0.7;
    // Rotation direction: smooth scalar in [-1, +1]. Most letters end up
    // somewhere between -1 and +1 rather than slammed all the way one way.
    const rotDir = rotDirRaw * 2 - 1;

    if (preset === 'playful') {
      const phaseOffset = stagger01 * (letterIdx / Math.max(1, letterCount));
      const phi = (baseT + phaseOffset) % 1;
      const scale = 1 + pulse01(phi) * (scaleMax - 1);
      const delta = scale - 1;
      const sx = 1 + delta * biasNorm;
      const sy = 1 + delta * (2 - biasNorm);
      const rot = pulseBipolar(phi) * rotateMaxRad * rotMagFactor * rotDir;
      // Playful keeps letters at their natural baseline positions —
      // staggered phases give the spacing variety, no extra spread needed.
      return { sx, sy, rot, dx: 0, dy: 0 };
    }

    if (preset === 'scatter') {
      // Each letter holds idle for most of the cycle, then suddenly
      // BURSTS for a short moment (scale + rotation peak + return to
      // idle), then waits again. Bursts happen at per-letter random
      // moments in the cycle — no coordination between letters. Result:
      // sporadic, popcorn-like rhythm. Different letters fire at
      // different times.
      //
      // Bursts are deterministic (seeded by the letter's hash) so the
      // cycle loops cleanly.
      //
      // Each letter has 1 OR 2 bursts per cycle. ~60% of letters get a
      // second burst — the rest only fire once per cycle. Burst times
      // are spaced apart minimum 25% of cycle so they don't merge into
      // one long peak.

      // Burst duration as fraction of cycle, with floor — short cycles
      // need a minimum burst duration so bursts read as bursts, not flickers.
      // 8% of cycle baseline; floor of ~25% of cycle when cycle is short.
      const burstFrac = Math.max(0.08, 0.25 / Math.max(1, scaleMax));
      // Use extended personality slots for burst timing.
      const burst1Time = personality[3];                         // 0..1
      const hasBurst2  = personality[4] > 0.4;                   // ~60% chance
      // Second burst: offset from first by at least 25% of cycle, within
      // the cycle. Place by adding (0.25 + p[5]*0.5) of cycle, mod 1.
      const burst2Time = (burst1Time + 0.25 + personality[5] * 0.5) % 1;

      // For each active burst, compute the letter's contribution at baseT.
      // The burst is centered at burstStart, spanning ±burstFrac/2 of cycle.
      // Inside the burst window, phi maps 0..1 across the burst; envelope
      // is the standard 0→1→0 bell.
      function burstContribution(burstStart) {
        // Cyclic distance from burst center: minimum of |t-c| and 1-|t-c|
        // so a burst that starts at 0.95 and bleeds past 1.0 also covers
        // baseT=0.05 (the wrap).
        let d = Math.abs(baseT - burstStart);
        if (d > 0.5) d = 1 - d;
        const halfWidth = burstFrac / 2;
        if (d > halfWidth) return 0;     // outside this burst's window
        // phi in [-1, 1] across the burst (0 = peak), but we want [0,1]
        // for the bell: convert.
        const phi = (d / halfWidth);     // 0 at peak, 1 at edges
        // Bell envelope: peaks at phi=0, falls to 0 at phi=1.
        // (1 + cos(π·phi)) / 2 — equals 1 at center, 0 at edges, smooth.
        return (1 + Math.cos(phi * Math.PI)) / 2;
      }

      let env = burstContribution(burst1Time);
      if (hasBurst2) {
        env = Math.max(env, burstContribution(burst2Time));
        // Use max instead of sum: if a letter's two bursts somehow overlap
        // (shouldn't given the spacing, but defensive) we don't double-up.
      }

      const delta = env * (scaleMax - 1);
      const sx = 1 + delta * biasNorm;
      const sy = 1 + delta * (2 - biasNorm);
      const rot = env * rotateMaxRad * rotMagFactor * rotDir;
      return { sx, sy, rot, dx: 0, dy: 0 };
    }

    // 'loop' — all letters cycle together through 4 keyframes:
    //   0%  : idle (scale 1, no rotation, no spread)
    //   30% : moderate scale-up, slight rotation, mild spread
    //   60% : peak scale-up, full rotation, full spread
    //   85% : back to idle
    //   100%: idle (loops back to 0%)
    const scaleFrames = [
      { at: 0.00, value: 1.0 },
      { at: 0.30, value: 1.0 + (scaleMax - 1.0) * 0.45 },
      { at: 0.60, value: scaleMax },
      { at: 0.85, value: 1.0 },
      { at: 1.00, value: 1.0 },
    ];
    const rotMagFrames = [
      { at: 0.00, value: 0 },
      { at: 0.30, value: rotateMaxRad * 0.20 },
      { at: 0.60, value: rotateMaxRad },
      { at: 0.85, value: 0 },
      { at: 1.00, value: 0 },
    ];
    // Spread curve: 0 at idle keyframes, 1 at peak. Used to push letters
    // outward from line center as they grow, so they stay distinguishable
    // even at peak scale (otherwise huge scaled letters all pile on top
    // of each other at their original baseline x-positions).
    const spreadFrames = [
      { at: 0.00, value: 0 },
      { at: 0.30, value: 0.45 },
      { at: 0.60, value: 1.0 },
      { at: 0.85, value: 0 },
      { at: 1.00, value: 0 },
    ];

    const scale = keyframe(scaleFrames, baseT, easeInOutCubic);
    // Tiny per-letter phase de-sync — adds life without breaking the
    // chorus feel. Range ±6% of cycle.
    const letterPhaseShift = (xyBias - 0.5) * 0.12;
    const shiftedT = (baseT + letterPhaseShift + 1) % 1;
    const rotMag = keyframe(rotMagFrames, shiftedT, easeInOutCubic);
    const spread = keyframe(spreadFrames, baseT, easeInOutCubic);

    // Bias applied to scale DELTA. At scale=1 (idle keyframes) delta=0
    // and sx=sy=1 — letters render identically to plain typed text.
    const delta = scale - 1;
    const sx = 1 + delta * biasNorm;
    const sy = 1 + delta * (2 - biasNorm);

    // Per-letter rotation: magnitude varies 30%..100% of slider, direction
    // is a smooth -1..+1 scalar (not binary), so we don't end up with
    // clusters of letters tilting the same way.
    const rot = rotMag * rotMagFactor * rotDir;

    // ---- Per-letter spread / drift ----
    // Each letter's signed normalized distance from the line's CENTER.
    // For line of N letters: centerNorm in [-1, +1]. Leftmost = -1,
    // rightmost = +1, center letter = 0. Single-letter line = 0.
    // Letters PUSH OUTWARD as the cycle peaks — their spacing dilates,
    // they stay distinguishable inside the chaos. At idle (spread=0),
    // letters sit exactly where natural typing would put them.
    //
    // dx and dy are returned in DIMENSIONLESS units (fractions of fontSize).
    // The caller multiplies by fontSize to get pixel offsets. This keeps
    // computeMotion unit-free and resolution-independent.
    const centerNorm = letterCount > 1
      ? (letterIdx - (letterCount - 1) / 2) / ((letterCount - 1) / 2)
      : 0;
    // Horizontal push: outward from line center. Magnitude scales with
    // (scaleMax - 1) so big-scale settings spread further; hooked to
    // the spread keyframe curve so it's always 0 at idle keyframes.
    const HSPREAD_FRAC = 0.55;          // peak horizontal spread, in fontSize units
    const dx = centerNorm * spread * (scaleMax - 1) * HSPREAD_FRAC;
    // Vertical drift: small, per-letter signed (some lift, some sink).
    const VSPREAD_FRAC = 0.18;
    const dy = rotDir * spread * (scaleMax - 1) * VSPREAD_FRAC;

    return { sx, sy, rot, dx, dy };
  }

  // Deterministic per-character "personality" values. Same character
  // index always gets the same hash — used to vary scale axis bias and
  // rotation direction so adjacent letters don't behave identically.
  function charHash(seed, idx, salt) {
    let h = (seed * 374761393) ^ (idx * 668265263) ^ (salt * 2147483647);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }

  registerEffect({
    id: 'drumroll',
    mode: 'text',
    name: 'Drumroll',
    description: "Letters animate in scale and rotation. Loop cycles through idle → growth → peak → return for a clean exportable loop. Playful gives each letter its own staggered pulse for continuous rolling motion. Scatter pops letters individually at random moments — sporadic, popcorn-like rhythm.",
    colorSlots: 2,  // Background + Text

    controls: [
      {
        group: 'Text',
        open: true,
        items: [
          { type: 'text', key: 'text', label: '', default: 'Saiyan',
            placeholder: 'Type here. Use | for line breaks.', maxlength: 80 },
        ],
      },
      {
        group: 'Effect',
        open: true,
        items: [
          // Preset shapes the LETTER MOTION across the cycle. Different
          // presets are different time-curves for the per-letter scale
          // and rotation values, sharing all other parameters (Speed,
          // Scale, Rotate). Adding a new preset = add an entry here and
          // a case in computeMotion(). No structural change.
          { type: 'select', key: 'preset', label: 'Preset',
            options: [
              { value: 'loop',    label: 'Loop' },
              { value: 'playful', label: 'Playful' },
              { value: 'scatter', label: 'Scatter' },
            ],
            default: 'loop' },
          { type: 'slider',   key: 'size',     label: 'Size',     min: 5,   max: 80,  step: 1, default: 30 },
          { type: 'slider',   key: 'speed',    label: 'Speed',    min: 1,   max: 100, step: 1, default: 30 },
          // How big letters get at peak. 1 = no scaling, 10 = letters
          // dwarf the canvas. Default is moderate but punchy.
          { type: 'slider',   key: 'scaleMax', label: 'Scale',    min: 1,   max: 10,  step: 1, default: 5  },
          // Max rotation in degrees. Reference video uses subtle rotation
          // (10–30°) — default reflects that. 360 is available for spinny
          // chaos if you want it.
          { type: 'slider',   key: 'rotateMax', label: 'Rotate',  min: 0,   max: 360, step: 1, default: 35 },
          // Stagger only applies to the 'Playful' preset (letters cycle
          // independently). 'Loop' has all letters cycle together,
          // so this slider is ignored there.
          { type: 'slider',   key: 'stagger',  label: 'Stagger',  min: 0,   max: 100, step: 1, default: 70 },
          { type: 'checkbox', key: 'invert',   label: 'Invert',   default: false },
        ],
      },
      {
        group: 'Font',
        open: false,
        items: [
          { type: 'select', key: 'font',   label: 'Font',   options: '$fonts', default: null },
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
        weight: 700,
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

      // ---- p5 instance ----
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

          // Background — solid fill, no compositing
          dctx.globalCompositeOperation = 'source-over';
          dctx.fillStyle = current.bg;
          dctx.fillRect(0, 0, c.width, c.height);

          const txt = (params.text || '').trim() || 'Saiyan';
          const lines = txt.split('|').map(s => s.trim()).filter(Boolean);
          if (lines.length === 0) return;

          // Font sizing — same conventions as Fracture so the two effects
          // feel like they live in the same world.
          const sizePct = Math.max(5, Math.min(80, params.size || 30));
          const lineGap = 1.05;
          const heightAvailable = c.height * 0.92;
          const idealLineHeight = c.height * (sizePct / 100);
          const lineHeight = Math.min(idealLineHeight, heightAvailable / (lines.length * lineGap));
          const fontSize = lineHeight / lineGap;

          dctx.font = fontShorthand(current.font, fontSize, current.weight);
          dctx.fillStyle = current.fg;
          dctx.textBaseline = 'alphabetic';
          dctx.textAlign = 'left';

          // Vertical centering by visible ink (same approach as Fracture).
          function measureInk(text) {
            let ascent  = fontSize * 0.72;
            let descent = fontSize * 0.20;
            try {
              const m = dctx.measureText(text);
              if (typeof m.actualBoundingBoxAscent === 'number')  ascent  = m.actualBoundingBoxAscent;
              if (typeof m.actualBoundingBoxDescent === 'number') descent = m.actualBoundingBoxDescent;
            } catch (e) { /* keep fallbacks */ }
            return { ascent, descent };
          }
          const firstInk = measureInk(lines[0]);
          const lastInk  = lines.length === 1 ? firstInk : measureInk(lines[lines.length - 1]);
          const visualHeight = firstInk.ascent + (lines.length - 1) * lineHeight + lastInk.descent;
          const blockTop = (c.height - visualHeight) / 2;
          const startY = blockTop + firstInk.ascent;

          // ---- Animation clock ----
          // Speed maps to cycle period: 1 = slow (~10s per cycle),
          // 100 = fast (~1s). The cycle loops seamlessly because both
          // pulse functions are 1-periodic over phi.
          const speed = Math.max(1, Math.min(100, params.speed || 30));
          const cyclePeriodMs = 1000 + (100 - speed) * 90;   // 1000..10000ms
          const tNow = performance.now();
          const baseT = (tNow / cyclePeriodMs) % 1;          // [0, 1) global cycle phase

          const scaleMax  = Math.max(1, Math.min(10, params.scaleMax || 4));
          const rotateMax = (Math.max(0, Math.min(360, params.rotateMax || 90)) * Math.PI) / 180;
          const stagger   = Math.max(0, Math.min(100, params.stagger || 70)) / 100;

          // ---- Per-line, per-letter rendering ----
          //
          // XOR COMPOSITING NEEDS A TRANSPARENT CANVAS. If we drew letters
          // directly onto the visible canvas (which already has a bg fill),
          // xor would erase the letters because xor cancels source pixels
          // wherever destination has alpha. So we render letters into an
          // OFFSCREEN canvas first (transparent, fresh each frame), then
          // blit that composited result onto the visible canvas with
          // normal alpha.
          //
          // This is still vector-quality: letters are still fillText calls,
          // not pixel samples. The offscreen is just a compositing layer
          // (logically equivalent to SVG's <g style="isolation: isolate">
          // and difference blend). For SVG export we'd skip the offscreen
          // entirely and emit one <text> per letter inside a difference
          // blend group — same visual.
          const off = (function () {
            // Reuse a host-attached offscreen so we don't churn allocation.
            // Recreate on size or DPR change.
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const targetW = Math.round(c.width * dpr);
            const targetH = Math.round(c.height * dpr);
            let cv = host.__drumrollOffscreen;
            if (!cv || cv.width !== targetW || cv.height !== targetH) {
              cv = document.createElement('canvas');
              cv.width = targetW;
              cv.height = targetH;
              host.__drumrollOffscreen = cv;
            }
            return cv;
          })();
          const octx = off.getContext('2d');
          const dpr = Math.max(1, window.devicePixelRatio || 1);
          // Reset transform fully each frame and re-apply DPR scale so
          // logical coords (matching the visible canvas) drive drawing.
          octx.setTransform(dpr, 0, 0, dpr, 0, 0);
          octx.clearRect(0, 0, c.width, c.height);
          octx.font = fontShorthand(current.font, fontSize, current.weight);
          octx.fillStyle = current.fg;
          octx.textBaseline = 'alphabetic';
          octx.textAlign = 'left';

          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const lineW = octx.measureText(line).width;
            const lineX = (c.width - lineW) / 2;
            const baseY = startY + li * lineHeight;

            let charX = lineX;
            for (let ci = 0; ci < line.length; ci++) {
              const ch = line[ci];
              const cw = octx.measureText(ch).width;
              if (ch === ' ' || ch === '\t') { charX += cw; continue; }

              const lineSeed = (li + 1) * 7919;
              // Six independent per-letter hashes:
              //   [0] x/y bias        — which axis grows more
              //   [1] rot magnitude   — some letters rotate more, some less
              //   [2] rot direction   — smooth -1..+1 (via 0..1 hash)
              //   [3] burst1 timing   — when in cycle this letter first pops (Scatter)
              //   [4] has-burst2 flag — does this letter pop a second time? (Scatter)
              //   [5] burst2 spacing  — second burst offset from first (Scatter)
              // Slots 3..5 are only consumed by the Scatter preset; Loop and
              // Playful ignore them but it's harmless to compute.
              const personality = [
                charHash(lineSeed, ci, 1),
                charHash(lineSeed, ci, 2),
                charHash(lineSeed, ci, 3),
                charHash(lineSeed, ci, 4),
                charHash(lineSeed, ci, 5),
                charHash(lineSeed, ci, 6),
              ];
              const preset = params.preset || 'loop';

              const pivotX = charX + cw / 2;
              const pivotY = baseY - fontSize * 0.35;

              const motion = computeMotion(
                preset, baseT, ci, line.length,
                personality, stagger,
                scaleMax, rotateMax
              );

              octx.save();
              // XOR: overlapping letters cancel each other out, exposing
              // the transparent offscreen backing → background shows
              // through where letters cross.
              octx.globalCompositeOperation = 'xor';
              octx.fillStyle = current.fg;
              // computeMotion returns dx/dy in fontSize units; convert to pixels.
              const dxPx = motion.dx * fontSize;
              const dyPx = motion.dy * fontSize;
              if (dxPx || dyPx) octx.translate(dxPx, dyPx);
              octx.translate(pivotX, pivotY);
              octx.rotate(motion.rot);
              octx.scale(motion.sx, motion.sy);
              octx.translate(-pivotX, -pivotY);
              octx.fillText(ch, charX, baseY);
              octx.restore();

              charX += cw;
            }
          }

          // Blit the composited letters onto the visible canvas. Source
          // canvas is dpr× larger; drawImage source coords need device
          // pixels — we use the full source dims and a logical-pixel
          // dest so the visible canvas's own DPR transform handles the
          // scale-down correctly.
          dctx.globalCompositeOperation = 'source-over';
          dctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, c.width, c.height);
        };
      };

      const inst = new p5(sketch, host);

      host.__drumroll = {
        update(newCtx) {
          current.ctx = newCtx;
          applyDerived();
          if (inst.width !== newCtx.width || inst.height !== newCtx.height) {
            inst.resizeCanvas(newCtx.width, newCtx.height);
          }
        },
      };

      return function teardown() {
        host.__drumroll = null;
        host.__drumrollOffscreen = null;
        try { inst.remove(); } catch (e) { console.error('drumroll teardown error', e); }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__drumroll;
      if (api && typeof api.update === 'function') api.update(ctx);
    },
  });
})();
