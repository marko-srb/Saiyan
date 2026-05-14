/* ============================================================
   GRADIENT — graphic effect (minimal, CSS-style)

   The simplest possible gradient effect, modeled on cssgradient.io:
   one gradient covers the canvas. A type (linear or radial), an
   angle (linear only), and N color stops evenly spread along the
   gradient direction. That's it.

   Mental model:
     - It's `background: linear-gradient(Ndeg, c1 0%, c2 50%, c3 100%);`
       except painted to a canvas so it can also be radial.
     - No layering, no compositing tricks, no post-processing yet.
     - This is a baseline we iterate on once the foundation is solid.

   Color mapping:
     - Slot 0 (Background) is unused — the gradient covers the
       entire canvas, so a bg color underneath is never visible.
       It's left in the row for UI consistency with other effects.
     - Slots 1..N are the gradient stops, evenly distributed from
       0% to 100% along the gradient direction. The Stops slider
       controls N.

   Vector-clean: canvas linearGradient or radialGradient over a
   single fillRect. Re-renders at any DPR without aliasing.
============================================================ */
(function () {
  'use strict';

  registerEffect({
    id: 'gradient',
    mode: 'graphic',
    name: 'Gradient',
    description: 'A simple full-canvas gradient with adjustable type, angle, and color stops. Like the basic CSS gradient — minimal, clean, and a starting point for layering more later.',
    colorSlots: 3,    // bg + 2 default stops; resized by Stops slider

    controls: [
      {
        group: 'Effect',
        open: true,
        items: [
          { type: 'select', key: 'type', label: 'Type',
            options: [
              { value: 'linear', label: 'Linear' },
              { value: 'radial', label: 'Radial' },
            ],
            default: 'linear' },
          // Angle only matters for linear gradients. We leave it
          // visible always to keep the schema flat (no conditional
          // controls) — for radial, the slider just doesn't affect
          // the output. Step 5 because finer angle control isn't
          // typically useful.
          { type: 'slider', key: 'angle', label: 'Angle',
            min: 0, max: 360, step: 5, default: 90 },
          // Number of color stops. Capped at 6 to keep the Colors
          // row manageable.
          { type: 'slider', key: 'stops', label: 'Stops',
            min: 2, max: 6, step: 1, default: 2 },
          // Grain — sparse film noise. Capped at 50 (not 100) so it
          // can't dominate; even at 50 the dots stay subtle. Default
          // 0 so first impression is clean; user opts in.
          { type: 'slider', key: 'grain', label: 'Grain',
            min: 0, max: 50, step: 1, default: 0 },
          // Shape mask — none / sphere / cube. The same gradient
          // pattern is mapped onto each face/surface in 3D-looking
          // perspective (cube faces are oriented to face axes; sphere
          // gets curved shading). Pure vector, intended to be
          // exportable later. 'none' = full-canvas gradient.
          { type: 'iconChoice', key: 'shape', label: 'Shape mask',
            default: 'none',
            options: [
              { value: 'none',   label: 'None',
                icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="13" x2="13" y2="3"/></svg>` },
              { value: 'sphere', label: 'Sphere',
                icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/></svg>` },
              { value: 'cube',   label: 'Cube',
                icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 2 L13.5 5 L13.5 11 L8 14 L2.5 11 L2.5 5 Z"/><path d="M8 2 L8 8"/><path d="M2.5 5 L8 8 L13.5 5"/></svg>` },
            ] },
          { type: 'checkbox', key: 'motion', label: 'Motion', default: false },
          { type: 'button', key: 'randomize', label: 'Randomize' },
        ],
      },
    ],

    mount(host, initialCtx) {
      const cv = document.createElement('canvas');
      cv.style.display = 'block';
      cv.style.width = '100%';
      cv.style.height = '100%';
      host.appendChild(cv);
      const dctx = cv.getContext('2d');

      // Offscreen used by the shape-mask path. When 'shape' is
      // 'sphere' or 'cube', the gradient is drawn here first, then
      // clipped to the shape polygon(s) onto the main canvas. Lazily
      // created (and resized as canvas changes). Stays null in the
      // shape='none' fast path so we don't pay for it there.
      let shapeOff = null;
      let shapeOctx = null;
      function ensureShapeOff(wPx, hPx) {
        if (!shapeOff) {
          shapeOff = document.createElement('canvas');
          shapeOctx = shapeOff.getContext('2d');
        }
        if (shapeOff.width !== wPx || shapeOff.height !== hPx) {
          shapeOff.width = wPx;
          shapeOff.height = hPx;
        }
      }

      const current = {
        ctx: initialCtx,
        // Radial center as fractions of canvas size, range 0..1.
        // (0.5, 0.5) = canvas center. Randomize jiggles this around
        // the center so the radial gradient is positioned differently
        // each click.
        radialCx: 0.5,
        radialCy: 0.5,
      };

      // Pre-rendered grain noise tile, cached by tile size so we
      // don't regenerate on every frame. The tile is mostly
      // transparent pixels; lit pixels carry low alpha so the
      // grain reads as faint film noise, not visible dots.
      let grainPattern = null;
      let grainPatternKey = '';
      function ensureGrainPattern() {
        const size = 128;
        const key = `g${size}`;
        if (grainPattern && grainPatternKey === key) return grainPattern;
        const tile = document.createElement('canvas');
        tile.width = size;
        tile.height = size;
        const tctx = tile.getContext('2d');
        const img = tctx.createImageData(size, size);
        const data = img.data;
        // Sparse pattern: ~10% of pixels lit (down from 25%), each at
        // low alpha (10-30 / 255, down from 40-80). The visual effect
        // is much subtler than the previous version — a whisper of
        // texture rather than a layer of static.
        for (let i = 0; i < size * size; i++) {
          if (Math.random() < 0.10) {
            const gray = Math.floor(180 + Math.random() * 75);
            data[i * 4 + 0] = gray;
            data[i * 4 + 1] = gray;
            data[i * 4 + 2] = gray;
            data[i * 4 + 3] = Math.floor(10 + Math.random() * 20);
          } else {
            data[i * 4 + 3] = 0;
          }
        }
        tctx.putImageData(img, 0, 0);
        grainPattern = dctx.createPattern(tile, 'repeat');
        grainPatternKey = key;
        return grainPattern;
      }

      // Read the N stop colors from the global Colors row, skipping
      // slot 0 (bg). Pads with black if fewer slots exist than
      // requested (transient state while the Stops slider grows the
      // array).
      function readStops(c, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          out.push(c.colors[i + 1] || '#000000');
        }
        return out;
      }

      // Compute the start/end points for a linear gradient at `angle`
      // degrees across a (w × h) box. CSS convention: 0° = bottom-to-top,
      // 90° = left-to-right, 180° = top-to-bottom, 270° = right-to-left.
      //
      // The gradient line is projected to span exactly the canvas:
      // the projection length is `|w sin θ| + |h cos θ|` — the sum of
      // the canvas's projected edges onto the gradient direction.
      // This matches CSS's linear-gradient behaviour: the first stop
      // sits at one canvas corner, the last stop at the opposite
      // corner, perpendicular to the gradient line.
      function linearEndpoints(angle, w, h) {
        const rad = (angle * Math.PI) / 180;
        const dx = Math.sin(rad);
        const dy = -Math.cos(rad);
        const cx = w / 2;
        const cy = h / 2;
        const halfLen = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
        return {
          x0: cx - dx * halfLen,
          y0: cy - dy * halfLen,
          x1: cx + dx * halfLen,
          y1: cy + dy * halfLen,
        };
      }

      function render() {
        const c = current.ctx;
        const params = c.params || {};

        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const W = c.width;
        const H = c.height;
        const wantW = Math.round(W * dpr);
        const wantH = Math.round(H * dpr);
        if (cv.width !== wantW || cv.height !== wantH) {
          cv.width = wantW;
          cv.height = wantH;
          cv.style.width = W + 'px';
          cv.style.height = H + 'px';
        }
        dctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const type = params.type || 'linear';
        const stopCount = Math.max(2, Math.min(6, params.stops || 2));
        const stops = readStops(c, stopCount);

        // ----- MOTION -----
        // When motion is ON, compute a `t` value (in seconds) used to
        // animate the gradient. Each type interprets t differently:
        //   linear → angle offset (one full rotation per cycle)
        //   radial → stop positions slide outward continuously
        // When motion is OFF, t = 0 and the render is fully static.
        const motionOn = !!params.motion;
        const t = motionOn ? (performance.now() / 1000) : 0;

        // ----- MAIN GRADIENT (+ optional shape mask) -----
        // shape = 'none' (default): fill the whole canvas with the
        // gradient.
        // shape = 'sphere': fill bg, then draw the gradient inside a
        // circle with light/shadow shading for 3D illusion.
        // shape = 'cube': fill bg, then draw the gradient inside an
        // isometric cube — 3 visible faces, each dimmed differently
        // to simulate light from above.
        const shape = params.shape || 'none';
        if (shape === 'none') {
          if (type === 'radial') {
            renderRadial(dctx, W, H, stops, params, t);
          } else {
            renderLinear(dctx, W, H, stops, params, t);
          }
        } else {
          // Paint the bg color across the visible canvas — shows in
          // the negative space around the masked shape.
          dctx.fillStyle = c.colors[0] || '#F2F2F2';
          dctx.fillRect(0, 0, W, H);

          if (shape === 'sphere') {
            // Sphere uses an offscreen of the gradient as its base
            // surface color, then applies shading overlays.
            ensureShapeOff(wantW, wantH);
            shapeOctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            shapeOctx.clearRect(0, 0, W, H);
            if (type === 'radial') {
              renderRadial(shapeOctx, W, H, stops, params, t);
            } else {
              renderLinear(shapeOctx, W, H, stops, params, t);
            }
            drawSphere(dctx, shapeOff, W, H, dpr);
          } else if (shape === 'cube') {
            // Cube renders the gradient INDEPENDENTLY per face,
            // oriented to each face's local axes. No offscreen
            // needed.
            drawCube(dctx, W, H, type, stops, params, t);
          }
        }

        // ----- GRAIN -----
        const grainAmount = Math.max(0, Math.min(50, params.grain || 0)) / 50;
        if (grainAmount > 0.01) {
          const pattern = ensureGrainPattern();
          dctx.globalAlpha = grainAmount;
          dctx.fillStyle = pattern;
          dctx.fillRect(0, 0, W, H);
          dctx.globalAlpha = 1;
        }
      }

      // ----- Shape mask renderers -----
      // Each takes the main canvas context, the prepared offscreen
      // holding the gradient, and the canvas dimensions. They clip
      // the gradient into the shape and add appropriate 3D shading
      // overlays. All purely vector: paths + drawImage + gradients.

      // Sphere. A circle centered on the canvas (size = 75% of the
      // shorter axis). The gradient appears inside. We add:
      //   - A soft light highlight from the upper-left (white →
      //     transparent) to simulate light hitting a curved surface.
      //   - A soft shadow at the bottom-right (black → transparent)
      //     to give the sphere depth.
      // Sphere. The gradient is painted flat inside a circle, then
      // 3D-shading overlays make it read as a curved surface:
      //   - Radial highlight from upper-left (specular / light side)
      //   - Radial shadow from lower-right (dark side)
      //   - Rim darkening at the silhouette (Lambertian falloff)
      // The combination produces a strong wrapped-on-a-ball feel
      // without needing per-pixel texture warping (which would lose
      // the vector property).
      function drawSphere(ctx, off, W, H, dpr) {
        const cx = W / 2;
        const cy = H / 2;
        const r = Math.min(W, H) * 0.40;  // 80% diameter
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        // Base: the gradient fills the circle (flat, will get
        // sculpted by overlays).
        ctx.drawImage(off, 0, 0, W * dpr, H * dpr, 0, 0, W, H);

        // Rim shadow — a dark ring at the silhouette edge. Centered
        // at the sphere center, transparent until 0.7R, ramping to
        // dark at R. This is what makes the flat gradient "curve"
        // toward the edges. Without this, the sphere looks like a
        // sticker; with it, light visibly falls off at the rim.
        const rim = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rim.addColorStop(0,    'rgba(0, 0, 0, 0)');
        rim.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
        rim.addColorStop(0.85, 'rgba(0, 0, 0, 0.25)');
        rim.addColorStop(1,    'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = rim;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Dark side — a soft radial shadow from the lower-right.
        // Combined with the rim, this creates a clear "light comes
        // from upper-left" sense.
        const shCx = cx + r * 0.5;
        const shCy = cy + r * 0.5;
        const sh = ctx.createRadialGradient(shCx, shCy, r * 0.1, shCx, shCy, r * 1.4);
        sh.addColorStop(0,   'rgba(0, 0, 0, 0.40)');
        sh.addColorStop(0.6, 'rgba(0, 0, 0, 0.10)');
        sh.addColorStop(1,   'rgba(0, 0, 0, 0)');
        ctx.fillStyle = sh;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Highlight — bright glow from upper-left. The specular peak
        // is offset inside the silhouette (not on the rim) so the
        // brightness reads as light glancing off a curved surface.
        const hlCx = cx - r * 0.35;
        const hlCy = cy - r * 0.35;
        const hl = ctx.createRadialGradient(hlCx, hlCy, 0, hlCx, hlCy, r * 0.85);
        hl.addColorStop(0,    'rgba(255, 255, 255, 0.50)');
        hl.addColorStop(0.35, 'rgba(255, 255, 255, 0.18)');
        hl.addColorStop(1,    'rgba(255, 255, 255, 0)');
        ctx.fillStyle = hl;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        ctx.restore();
      }

      // Cube. Isometric projection — looking from above and to the
      // right, so we see top + front-left + front-right faces.
      //
      // Each face renders an INDEPENDENT copy of the gradient,
      // oriented to that face's local frame. So a linear gradient
      // at angle 90° (left-to-right) appears running along each
      // face's "horizontal" axis — the top face's gradient runs
      // along its long axis, the right face's runs along its long
      // axis, etc. This is what makes the cube look like a 3D
      // object with the same material painted on all sides, not a
      // flat hexagon with a single gradient sliced into it.
      //
      // Each face is then dimmed by a face-specific alpha to
      // simulate light from above-left:
      //   top   → brightest
      //   right → mid dim
      //   left  → most dim
      function drawCube(ctx, W, H, type, stops, params, t) {
        const cx = W / 2;
        const cy = H / 2;
        // Cube edge length sized to fit with breathing room. The
        // projected cube's bounding box is 2·cos30°·s wide and 2·s
        // tall, so we cap both. Shrink slightly for padding.
        const s = Math.min(W / (2 * Math.cos(Math.PI / 6)), H / 2) * 0.78;
        const cos30 = Math.cos(Math.PI / 6);
        const sin30 = Math.sin(Math.PI / 6);

        // Six visible vertices of the cube's silhouette + the
        // middle (M) where 3 faces meet.
        //
        //         T          ← top vertex of cube
        //        / \
        //      TL   TR       ← left-back, right-back top corners
        //      |\ M /|       ← M = where 3 faces meet
        //      | \|/ |
        //      BL  BR        ← left-front, right-front bottom corners
        //        \ /
        //         B          ← bottom-front vertex
        //
        // Each face is a parallelogram (rhombus):
        //   top   = T - TR - M - TL
        //   right = TR - BR - B - M
        //   left  = TL - M - B - BL
        const T  = { x: cx,                  y: cy - s };
        const TR = { x: cx + cos30 * s,      y: cy - sin30 * s };
        const TL = { x: cx - cos30 * s,      y: cy - sin30 * s };
        const M  = { x: cx,                  y: cy };
        const BR = { x: cx + cos30 * s,      y: cy + sin30 * s };
        const BL = { x: cx - cos30 * s,      y: cy + sin30 * s };
        const B  = { x: cx,                  y: cy + s };

        // For each face we need an origin (one corner) and two edge
        // vectors (u, v) that span the face. We treat (u, v) as the
        // face's local axes — u is "horizontal" of that face, v is
        // "vertical." The gradient is then computed in u-v space and
        // mapped back to canvas coords using these vectors.
        //
        // Face layout choice:
        //   - TOP face: origin = TL, u = TL→TR (right), v = TL→M (down-right toward viewer)
        //   - RIGHT face: origin = TR, u = TR→M (down-left toward viewer), v = TR→BR (down)
        //   - LEFT face: origin = TL, u = TL→M (down-right toward viewer), v = TL→BL (down)
        // The choice of u/v doesn't really matter as long as we're
        // consistent per face — the gradient just sits naturally on
        // each face's surface.
        const faces = [
          { poly: [T, TR, M, TL],  origin: TL, u: vec(TL, TR), v: vec(TL, M),  dim: 0.00 }, // top
          { poly: [TR, BR, B, M],  origin: TR, u: vec(TR, M),  v: vec(TR, BR), dim: 0.22 }, // right
          { poly: [TL, M, B, BL],  origin: TL, u: vec(TL, M),  v: vec(TL, BL), dim: 0.42 }, // left
        ];

        for (const f of faces) {
          paintCubeFace(ctx, f, type, stops, params, t);
        }

        // Edge outlines — silhouette + internal seams. Drawn last so
        // they sit cleanly on top of the painted faces. Subtle dark
        // strokes give the form definition.
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        // Outer silhouette T → TR → B → BL → TL → close.
        ctx.moveTo(T.x, T.y);
        ctx.lineTo(TR.x, TR.y);
        ctx.lineTo(B.x, B.y);
        ctx.lineTo(BL.x, BL.y);
        ctx.lineTo(TL.x, TL.y);
        ctx.closePath();
        ctx.stroke();
        // Internal seams from M to T, TR, TL.
        ctx.beginPath();
        ctx.moveTo(M.x, M.y); ctx.lineTo(T.x,  T.y);
        ctx.moveTo(M.x, M.y); ctx.lineTo(TR.x, TR.y);
        ctx.moveTo(M.x, M.y); ctx.lineTo(TL.x, TL.y);
        ctx.stroke();
        ctx.restore();
      }

      // Small helper: vector from p1 to p2.
      function vec(p1, p2) { return { x: p2.x - p1.x, y: p2.y - p1.y }; }

      // Paint one cube face. The face has an origin point and two
      // edge vectors u, v in canvas coords. We construct a gradient
      // in the face's LOCAL frame (u along x-axis, v along y-axis,
      // both of length 1), compute the gradient's endpoint positions
      // in that local space using linearEndpoints, then map those
      // endpoints back to canvas space by u-v interpolation. This
      // gives the gradient the same visual angle on each face,
      // relative to that face — no matter how the face is oriented
      // in the iso projection.
      function paintCubeFace(ctx, face, type, stops, params, t) {
        ctx.save();
        // Clip to the face polygon so the gradient fill stays within.
        ctx.beginPath();
        ctx.moveTo(face.poly[0].x, face.poly[0].y);
        for (let i = 1; i < face.poly.length; i++) {
          ctx.lineTo(face.poly[i].x, face.poly[i].y);
        }
        ctx.closePath();
        ctx.clip();

        // Map a point in face-local (u, v) space ∈ [0,1]² to canvas
        // space using the face's origin + u + v vectors. This is the
        // affine mapping: canvasPt = origin + ulocal·u + vlocal·v.
        const map = (ulocal, vlocal) => ({
          x: face.origin.x + ulocal * face.u.x + vlocal * face.v.x,
          y: face.origin.y + ulocal * face.u.y + vlocal * face.v.y,
        });

        if (type === 'radial') {
          // Radial: center at face center (u=0.5, v=0.5). For the
          // radius we want it to reach the face's far corner —
          // since the face is a unit square in (u,v), the far
          // corner from center is at distance √2/2 ≈ 0.707, but
          // mapped through (u, v) the corner-distance in canvas
          // space depends on |u| and |v|. We just pick a generous
          // radius: max half-length of the face's diagonals.
          const center = map(0.5, 0.5);
          // The 4 face corners in canvas coords.
          const c00 = map(0, 0), c10 = map(1, 0), c11 = map(1, 1), c01 = map(0, 1);
          const r = Math.max(
            Math.hypot(c00.x - center.x, c00.y - center.y),
            Math.hypot(c10.x - center.x, c10.y - center.y),
            Math.hypot(c11.x - center.x, c11.y - center.y),
            Math.hypot(c01.x - center.x, c01.y - center.y)
          );
          const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
          // Use the same cyclic-stops setup as the main radial. For
          // shape mask we keep it simple: knots at i/N positions with
          // a wrap stop at 1. Motion shifts phase outward.
          const N = stops.length;
          const phase = (t / RADIAL_PERIOD) % 1;
          if (t === 0 || phase === 0) {
            for (let i = 0; i <= N; i++) {
              grad.addColorStop(i / N, stops[i % N]);
            }
          } else {
            const entries = [];
            for (let i = 0; i <= N; i++) {
              let p = i / N - phase;
              p = ((p % 1) + 1) % 1;
              entries.push({ p, color: stops[i % N] });
            }
            entries.sort((a, b) => a.p - b.p);
            let lastP = -1;
            for (const e of entries) {
              if (e.p <= lastP) e.p = Math.min(1, lastP + 1e-6);
              lastP = e.p;
            }
            const boundaryColor = sampleCyclic(stops, -phase);
            if (entries[0].p > 1e-6) grad.addColorStop(0, boundaryColor);
            for (const e of entries) grad.addColorStop(e.p, e.color);
            if (entries[entries.length - 1].p < 1 - 1e-6) grad.addColorStop(1, boundaryColor);
          }
          ctx.fillStyle = grad;
        } else {
          // Linear: compute endpoints in the face's local 1×1 space
          // using the same math as the canvas-level linear gradient,
          // then map back to canvas coords. The result is that the
          // gradient at angle θ runs in the same logical direction
          // on each face — just oriented to that face's surface.
          let angle = Math.max(0, Math.min(360, params.angle || 90));
          angle += (t / LINEAR_PERIOD) * 360;
          // Endpoints in local (u,v) unit square.
          const local = linearEndpoints(angle, 1, 1);
          // Map to canvas coords.
          const p0 = map(local.x0, local.y0);
          const p1 = map(local.x1, local.y1);
          const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
          for (let i = 0; i < stops.length; i++) {
            const pos = (stops.length === 1) ? 0 : i / (stops.length - 1);
            grad.addColorStop(pos, stops[i]);
          }
          ctx.fillStyle = grad;
        }

        // Fill the face area (the clip restricts to the polygon).
        // Use the polygon's bounding box for the fillRect.
        let minX = face.poly[0].x, maxX = face.poly[0].x;
        let minY = face.poly[0].y, maxY = face.poly[0].y;
        for (const p of face.poly) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // Dim overlay for this face's shading.
        if (face.dim > 0) {
          ctx.fillStyle = `rgba(0, 0, 0, ${face.dim})`;
          ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        }
        ctx.restore();
      }

      // ----- Per-type gradient renderers -----
      // Each draws the gradient into the main canvas context (W × H).

      // Linear gradient. With motion ON, the angle advances by 360°
      // every `LINEAR_PERIOD` seconds, so the gradient rotates
      // continuously around the canvas center.
      const LINEAR_PERIOD = 12;   // seconds per full rotation
      function renderLinear(ctx, W, H, stops, params, t) {
        let angle = Math.max(0, Math.min(360, params.angle || 90));
        angle += (t / LINEAR_PERIOD) * 360;
        const e = linearEndpoints(angle, W, H);
        const grad = ctx.createLinearGradient(e.x0, e.y0, e.x1, e.y1);
        for (let i = 0; i < stops.length; i++) {
          const pos = (stops.length === 1) ? 0 : i / (stops.length - 1);
          grad.addColorStop(pos, stops[i]);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Linear-interpolate two hex colors at fraction f ∈ [0, 1].
      // Used by the animated radial gradient to sample the cyclic
      // color ramp at arbitrary positions — necessary to produce a
      // seamlessly periodic gradient where the color at position 0
      // always equals the color at position 1.
      function lerpHex(a, b, f) {
        let ha = (a || '#000000').replace('#', '');
        let hb = (b || '#000000').replace('#', '');
        if (ha.length === 3) ha = ha[0]+ha[0]+ha[1]+ha[1]+ha[2]+ha[2];
        if (hb.length === 3) hb = hb[0]+hb[0]+hb[1]+hb[1]+hb[2]+hb[2];
        const ar = parseInt(ha.substr(0,2),16), ag = parseInt(ha.substr(2,2),16), ab = parseInt(ha.substr(4,2),16);
        const br = parseInt(hb.substr(0,2),16), bg = parseInt(hb.substr(2,2),16), bb = parseInt(hb.substr(4,2),16);
        const r = Math.round(ar + (br - ar) * f);
        const g = Math.round(ag + (bg - ag) * f);
        const b2 = Math.round(ab + (bb - ab) * f);
        const toHex = (v) => v.toString(16).padStart(2, '0');
        return '#' + toHex(r) + toHex(g) + toHex(b2);
      }

      // Sample a CYCLIC color ramp (length N) at position p ∈ [0, 1).
      // The ramp is treated as periodic: colors[N-1] connects back to
      // colors[0]. So sampling p=0 and p=1 both yield colors[0].
      function sampleCyclic(colors, p) {
        const N = colors.length;
        // Wrap p to [0, 1).
        p = ((p % 1) + 1) % 1;
        const idxF = p * N;
        const lo = Math.floor(idxF) % N;
        const hi = (lo + 1) % N;
        const frac = idxF - Math.floor(idxF);
        return lerpHex(colors[lo], colors[hi], frac);
      }

      // Radial gradient. The gradient is built from a CYCLIC color
      // sequence: the N user-picked colors at positions 0/N, 1/N, ...
      // (N-1)/N, plus the first color again at position 1. This means
      // the gradient is genuinely periodic — the color at p=0 always
      // equals the color at p=1.
      //
      // Static (motion off): the cyclic ramp is shown at phase 0.
      // Animated (motion on): the same cyclic ramp slides outward by
      // -phase each frame, wrapping seamlessly. Because the ramp is
      // periodic, there's no discontinuity to "jump" through — the
      // gradient flows continuously through every cycle.
      const RADIAL_PERIOD = 4;    // seconds per full ripple cycle
      function renderRadial(ctx, W, H, stops, params, t) {
        // Center at user-controlled radialCx/radialCy fractions.
        // Radius reaches the farthest canvas corner so the outermost
        // color fills the edges completely.
        const cx = W * current.radialCx;
        const cy = H * current.radialCy;
        const r = Math.max(
          Math.hypot(cx, cy),
          Math.hypot(W - cx, cy),
          Math.hypot(cx, H - cy),
          Math.hypot(W - cx, H - cy)
        );
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);

        const N = stops.length;
        const phase = (t / RADIAL_PERIOD) % 1;

        // Build N+1 cyclic knots: stops[0..N-1] at positions
        // [0/N, 1/N, ..., (N-1)/N], plus stops[0] at position 1.
        // For animation, every knot's position shifts by -phase and
        // wraps into [0, 1).
        //
        // Important: because position N/N maps to the same color as
        // position 0 (both c[0]), wrapping is automatic — no boundary
        // sampling needed.
        if (t === 0 || phase === 0) {
          // Phase-zero fast path: emit knots in natural order, no wrap.
          for (let i = 0; i <= N; i++) {
            const pos = i / N;
            grad.addColorStop(pos, stops[i % N]);
          }
        } else {
          // Build all N+1 knots shifted by -phase, wrap to [0, 1).
          const entries = [];
          for (let i = 0; i <= N; i++) {
            let p = i / N - phase;
            // Use ((x % 1) + 1) % 1 to handle negative values.
            p = ((p % 1) + 1) % 1;
            entries.push({ p, color: stops[i % N] });
          }
          // Sort ascending by position. With cyclic wrapping, the
          // sorted order ensures canvas accepts the stops.
          entries.sort((a, b) => a.p - b.p);

          // After wrapping, two consecutive knots can land at
          // identical positions (rare but possible due to floating
          // point), which would make canvas's interpolation
          // ambiguous. Nudge any duplicate by a tiny epsilon.
          let lastP = -1;
          for (const e of entries) {
            if (e.p <= lastP) e.p = Math.min(1, lastP + 1e-6);
            lastP = e.p;
          }

          // Ensure stops cover positions 0 and 1 explicitly. Without
          // these the gradient would extrapolate the outer edges
          // from the nearest knot, causing visual "snap" as a knot
          // crosses the wrap boundary. We compute the cyclic ramp's
          // value at p=0 (which equals value at p=1 by periodicity).
          const boundaryColor = sampleCyclic(stops, -phase);
          if (entries[0].p > 1e-6) {
            grad.addColorStop(0, boundaryColor);
          }
          for (const e of entries) {
            grad.addColorStop(e.p, e.color);
          }
          if (entries[entries.length - 1].p < 1 - 1e-6) {
            grad.addColorStop(1, boundaryColor);
          }
        }

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      render();

      // ----- Motion loop -----
      // We start/stop a rAF loop whenever the motion param flips. When
      // running, the loop calls render() every frame; each call reads
      // performance.now() inside render() so the gradient animates
      // continuously. When off, no extra paints — render() runs only
      // on user-driven updates (slider/swatch/Randomize changes).
      let rafId = 0;
      function loop() {
        render();
        rafId = requestAnimationFrame(loop);
      }
      function startMotion() {
        if (rafId) return;
        loop();
      }
      function stopMotion() {
        if (!rafId) return;
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      // When the Stops slider changes, resize the global Colors row
      // so swatches appear (or disappear) accordingly. The bg slot
      // is always present, so the row total is `stops + 1`.
      function handleUpdate(newCtx) {
        const desiredSlots = (newCtx.params.stops || 2) + 1;
        if (desiredSlots !== state.colors.length) {
          setColorSlotsKeep(desiredSlots, 'gradient');
        }
        current.ctx = newCtx;
        // Match the motion loop state to the checkbox.
        if (newCtx.params.motion) startMotion();
        else { stopMotion(); render(); }
      }

      // ----------------------------------------------------------------
      // SVG EXPORT — produces a TRUE-VECTOR SVG of the current frame.
      //
      // The gradient effect is fully vector by nature (canvas gradient
      // primitives map 1:1 to SVG <linearGradient>/<radialGradient>),
      // so this generates clean SVG markup instead of embedding a PNG.
      //
      // Notes/limitations:
      // - Motion is FROZEN at whatever phase/angle is currently
      //   visible. Animating SVG (via SMIL or CSS) is a future
      //   enhancement; for now the export is a still vector frame.
      // - Grain is omitted (procedural noise; doesn't vectorize
      //   cleanly without baking a huge inline pattern). Real-vector
      //   users typically prefer clean output anyway.
      // ----------------------------------------------------------------

      // Build a spec-compliant stop element. SVG 1.1 expects
      // stop-color as a color value (hex/named) and stop-opacity as
      // a separate attribute — NOT rgba() inside stop-color. Some
      // viewers (Illustrator, Inkscape) don't handle rgba() stops.
      // We accept both forms here: a plain hex passes through, and
      // rgba(r,g,b,a) gets split into color + opacity.
      function svgStop(offset, colorValue) {
        const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(colorValue || '');
        if (m) {
          const r = +m[1], g = +m[2], b = +m[3];
          const a = m[4] != null ? +m[4] : 1;
          const hex = '#' +
            r.toString(16).padStart(2, '0') +
            g.toString(16).padStart(2, '0') +
            b.toString(16).padStart(2, '0');
          return `<stop offset="${offset}" stop-color="${hex}" stop-opacity="${a}"/>`;
        }
        return `<stop offset="${offset}" stop-color="${colorValue}"/>`;
      }

      function exportSVGString(ctx) {
        const params = (ctx && ctx.params) || {};
        const W = (ctx && ctx.width) || 1000;
        const H = (ctx && ctx.height) || 700;
        const type = params.type || 'linear';
        const stopCount = Math.max(2, Math.min(6, params.stops || 2));
        const stops = readStops(ctx, stopCount);
        const motionOn = !!params.motion;
        const t = motionOn ? (performance.now() / 1000) : 0;
        const shape = params.shape || 'none';

        // Each <linearGradient>/<radialGradient>/<clipPath> needs a
        // unique id within the SVG document. Counter-based.
        let nextId = 0;
        const uid = (prefix) => `${prefix}_${nextId++}`;

        // Build a <linearGradient> element string at canvas-W/H scale
        // for the given angle and stops. Same math as renderLinear.
        function svgLinearGradient(id, angle, w, h, stopList) {
          const e = linearEndpoints(angle, w, h);
          const stopsXML = stopList.map((c, i) => {
            const offset = (stopList.length === 1) ? 0 : i / (stopList.length - 1);
            return svgStop(offset, c);
          }).join('');
          return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${e.x0}" y1="${e.y0}" x2="${e.x1}" y2="${e.y1}">${stopsXML}</linearGradient>`;
        }

        // Build a <radialGradient> element with cyclic stops mirroring
        // the canvas radial-renderer logic. Same phase-shifted knot
        // arrangement used by renderRadial.
        function svgRadialGradient(id, cx, cy, r, stopList, phaseT) {
          const N = stopList.length;
          const phase = (phaseT / RADIAL_PERIOD) % 1;
          let entries;
          if (phaseT === 0 || phase === 0) {
            entries = [];
            for (let i = 0; i <= N; i++) {
              entries.push({ p: i / N, color: stopList[i % N] });
            }
          } else {
            entries = [];
            for (let i = 0; i <= N; i++) {
              let p = i / N - phase;
              p = ((p % 1) + 1) % 1;
              entries.push({ p, color: stopList[i % N] });
            }
            entries.sort((a, b) => a.p - b.p);
            let lastP = -1;
            for (const e of entries) {
              if (e.p <= lastP) e.p = Math.min(1, lastP + 1e-6);
              lastP = e.p;
            }
            const boundaryColor = sampleCyclic(stopList, -phase);
            if (entries[0].p > 1e-6) entries.unshift({ p: 0, color: boundaryColor });
            if (entries[entries.length - 1].p < 1 - 1e-6) entries.push({ p: 1, color: boundaryColor });
          }
          const stopsXML = entries.map(e =>
            svgStop(e.p, e.color)
          ).join('');
          return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}" fx="${cx}" fy="${cy}">${stopsXML}</radialGradient>`;
        }

        const defs = [];
        const body = [];

        if (shape === 'none') {
          // Simple full-canvas gradient: one rect filled with the
          // matching SVG gradient.
          if (type === 'radial') {
            const cx = W * current.radialCx;
            const cy = H * current.radialCy;
            const r = Math.max(
              Math.hypot(cx, cy),
              Math.hypot(W - cx, cy),
              Math.hypot(cx, H - cy),
              Math.hypot(W - cx, H - cy)
            );
            const id = uid('rg');
            defs.push(svgRadialGradient(id, cx, cy, r, stops, t));
            body.push(`<rect width="${W}" height="${H}" fill="url(#${id})"/>`);
          } else {
            let angle = Math.max(0, Math.min(360, params.angle || 90));
            angle += (t / LINEAR_PERIOD) * 360;
            const id = uid('lg');
            defs.push(svgLinearGradient(id, angle, W, H, stops));
            body.push(`<rect width="${W}" height="${H}" fill="url(#${id})"/>`);
          }
        } else if (shape === 'sphere') {
          // Background fill so the area around the sphere matches the
          // canvas behaviour (bg color from slot 0).
          const bg = (ctx && ctx.colors && ctx.colors[0]) || '#F2F2F2';
          body.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);

          // Sphere geometry: circle centered at (cx, cy), radius r.
          const cx = W / 2;
          const cy = H / 2;
          const r = Math.min(W, H) * 0.40;

          // Build the base gradient (same as shape='none' but clipped).
          let baseId;
          if (type === 'radial') {
            const gcx = W * current.radialCx;
            const gcy = H * current.radialCy;
            const gr = Math.max(
              Math.hypot(gcx, gcy),
              Math.hypot(W - gcx, gcy),
              Math.hypot(gcx, H - gcy),
              Math.hypot(W - gcx, H - gcy)
            );
            baseId = uid('rg');
            defs.push(svgRadialGradient(baseId, gcx, gcy, gr, stops, t));
          } else {
            let angle = Math.max(0, Math.min(360, params.angle || 90));
            angle += (t / LINEAR_PERIOD) * 360;
            baseId = uid('lg');
            defs.push(svgLinearGradient(baseId, angle, W, H, stops));
          }

          // Three overlay radial gradients for the 3D illusion: rim
          // shadow (dark ring at silhouette), shadow (lower-right
          // darkening), highlight (upper-left brightening). Same
          // positions and stops as the canvas drawSphere overlays.
          const rimId = uid('rim');
          defs.push(`<radialGradient id="${rimId}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}" fx="${cx}" fy="${cy}">${
            svgStop(0,    'rgba(0,0,0,0)') +
            svgStop(0.55, 'rgba(0,0,0,0)') +
            svgStop(0.85, 'rgba(0,0,0,0.25)') +
            svgStop(1,    'rgba(0,0,0,0.55)')
          }</radialGradient>`);

          const shCx = cx + r * 0.5, shCy = cy + r * 0.5;
          const shId = uid('sh');
          defs.push(`<radialGradient id="${shId}" gradientUnits="userSpaceOnUse" cx="${shCx}" cy="${shCy}" r="${r * 1.4}" fx="${shCx}" fy="${shCy}">${
            svgStop(0,    'rgba(0,0,0,0.40)') +
            svgStop(0.6,  'rgba(0,0,0,0.10)') +
            svgStop(1,    'rgba(0,0,0,0)')
          }</radialGradient>`);

          const hlCx = cx - r * 0.35, hlCy = cy - r * 0.35;
          const hlId = uid('hl');
          defs.push(`<radialGradient id="${hlId}" gradientUnits="userSpaceOnUse" cx="${hlCx}" cy="${hlCy}" r="${r * 0.85}" fx="${hlCx}" fy="${hlCy}">${
            svgStop(0,    'rgba(255,255,255,0.50)') +
            svgStop(0.35, 'rgba(255,255,255,0.18)') +
            svgStop(1,    'rgba(255,255,255,0)')
          }</radialGradient>`);

          // Clip everything to the circle and stack: gradient → rim → shadow → highlight.
          const clipId = uid('clip');
          defs.push(`<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);
          body.push(`<g clip-path="url(#${clipId})">
            <rect width="${W}" height="${H}" fill="url(#${baseId})"/>
            <rect width="${W}" height="${H}" fill="url(#${rimId})"/>
            <rect width="${W}" height="${H}" fill="url(#${shId})"/>
            <rect width="${W}" height="${H}" fill="url(#${hlId})"/>
          </g>`);
        } else if (shape === 'cube') {
          // Background fill.
          const bg = (ctx && ctx.colors && ctx.colors[0]) || '#F2F2F2';
          body.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);

          // Cube geometry — same constants as drawCube.
          const cx = W / 2;
          const cy = H / 2;
          const s = Math.min(W / (2 * Math.cos(Math.PI / 6)), H / 2) * 0.78;
          const cos30 = Math.cos(Math.PI / 6);
          const sin30 = Math.sin(Math.PI / 6);
          const T  = { x: cx,                  y: cy - s };
          const TR = { x: cx + cos30 * s,      y: cy - sin30 * s };
          const TL = { x: cx - cos30 * s,      y: cy - sin30 * s };
          const M  = { x: cx,                  y: cy };
          const BR = { x: cx + cos30 * s,      y: cy + sin30 * s };
          const BL = { x: cx - cos30 * s,      y: cy + sin30 * s };
          const B  = { x: cx,                  y: cy + s };

          // Face definitions — same as canvas version.
          const faces = [
            { poly: [T, TR, M, TL],  origin: TL, u: vec(TL, TR), v: vec(TL, M),  dim: 0.00, name: 'top' },
            { poly: [TR, BR, B, M],  origin: TR, u: vec(TR, M),  v: vec(TR, BR), dim: 0.22, name: 'right' },
            { poly: [TL, M, B, BL],  origin: TL, u: vec(TL, M),  v: vec(TL, BL), dim: 0.42, name: 'left' },
          ];

          // Each face: build its own gradient in face-local coords,
          // emit a polygon filled with that gradient, then a dim
          // overlay polygon for shading.
          for (const f of faces) {
            // Map a face-local point (u, v) ∈ [0,1]² to canvas coords.
            const map = (ulocal, vlocal) => ({
              x: f.origin.x + ulocal * f.u.x + vlocal * f.v.x,
              y: f.origin.y + ulocal * f.u.y + vlocal * f.v.y,
            });
            const polyPts = f.poly.map(p => `${p.x},${p.y}`).join(' ');
            let faceFillId;
            if (type === 'radial') {
              const center = map(0.5, 0.5);
              const c00 = map(0, 0), c10 = map(1, 0), c11 = map(1, 1), c01 = map(0, 1);
              const r = Math.max(
                Math.hypot(c00.x - center.x, c00.y - center.y),
                Math.hypot(c10.x - center.x, c10.y - center.y),
                Math.hypot(c11.x - center.x, c11.y - center.y),
                Math.hypot(c01.x - center.x, c01.y - center.y)
              );
              faceFillId = uid('frg_' + f.name);
              defs.push(svgRadialGradient(faceFillId, center.x, center.y, r, stops, t));
            } else {
              // Linear gradient in the face's local 1×1 frame → endpoints
              // mapped back to canvas coords.
              let angle = Math.max(0, Math.min(360, params.angle || 90));
              angle += (t / LINEAR_PERIOD) * 360;
              const local = linearEndpoints(angle, 1, 1);
              const p0 = map(local.x0, local.y0);
              const p1 = map(local.x1, local.y1);
              faceFillId = uid('flg_' + f.name);
              const stopsXML = stops.map((c, i) => {
                const offset = (stops.length === 1) ? 0 : i / (stops.length - 1);
                return svgStop(offset, c);
              }).join('');
              defs.push(`<linearGradient id="${faceFillId}" gradientUnits="userSpaceOnUse" x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}">${stopsXML}</linearGradient>`);
            }
            // Face gradient polygon.
            body.push(`<polygon points="${polyPts}" fill="url(#${faceFillId})"/>`);
            // Dim overlay polygon (same shape, semi-transparent black).
            if (f.dim > 0) {
              body.push(`<polygon points="${polyPts}" fill="#000000" fill-opacity="${f.dim}"/>`);
            }
          }

          // Edge outlines — silhouette + internal seams.
          const sil = [T, TR, B, BL, TL].map(p => `${p.x},${p.y}`).join(' ');
          body.push(`<polygon points="${sil}" fill="none" stroke="#000000" stroke-opacity="0.35" stroke-width="1" stroke-linejoin="round"/>`);
          body.push(`<g stroke="#000000" stroke-opacity="0.35" stroke-width="1" stroke-linejoin="round" fill="none">
            <line x1="${M.x}" y1="${M.y}" x2="${T.x}"  y2="${T.y}"/>
            <line x1="${M.x}" y1="${M.y}" x2="${TR.x}" y2="${TR.y}"/>
            <line x1="${M.x}" y1="${M.y}" x2="${TL.x}" y2="${TL.y}"/>
          </g>`);
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs.join('')}</defs>
  ${body.join('\n  ')}
</svg>`;
      }


      host.__gradient = {
        update: handleUpdate,
        // True-vector SVG export — returns an SVG markup string for
        // the current frame. The global exporter prefers this over
        // the raster-in-SVG fallback when an effect provides it.
        exportSVG: exportSVGString,
        button(key) {
          if (key !== 'randomize') return;
          const type = (state.activeEffect && state.activeEffect.params.type) || 'linear';
          if (type === 'linear') {
            // Random angle, snapped to the 5° schema step.
            state.activeEffect.params.angle = Math.floor(Math.random() * 72) * 5;
            if (typeof renderEditZone === 'function') renderEditZone();
          } else if (type === 'radial') {
            // Jitter the radial center within a generous interior
            // region (0.15..0.85 on each axis) — keeps the center
            // visibly off-canvas-edge so the radial reads as
            // intentional offset, not just "stuck to a corner."
            current.radialCx = 0.15 + Math.random() * 0.70;
            current.radialCy = 0.15 + Math.random() * 0.70;
          }
          render();
        },
      };

      return function teardown() {
        stopMotion();
        host.__gradient = null;
        try { host.removeChild(cv); } catch (e) { /* already gone */ }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__gradient;
      if (api && typeof api.update === 'function') api.update(ctx);
    },

    onButton(ctx, key) {
      const api = ctx.host && ctx.host.__gradient;
      if (api && typeof api.button === 'function') api.button(key);
    },
  });
})();
