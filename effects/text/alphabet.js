/* ============================================================
   ALPHABET — text effect. Each glyph rendered in a different
   geometric vector style, evoking the 'Le Palais de Tokyo' poster
   look where the same word is set in many alphabets at once.

   Architecture:
     - Each character is hand-defined as a list of POLYLINE STROKES
       in a normalized 100×120 box (CHAR_W × CHAR_H).
     - Decorations operate on those strokes — dots / dashes / X's /
       plus-marks / squares / etc. along the path. The letter shape
       reads through whatever decoration is applied.
     - Special characters (O / 0 / A / E / I / U) get dedicated
       style pools that exploit their geometric regularity for
       extra variety. Multiple Os in a phrase rotate through the
       O pool by position so they don't all look identical.
     - Style assignment for standard letters is also position-aware:
       consecutive same letters in a phrase land on different styles,
       so 'LL' or 'EE' don't appear as identical twins.
     - Markers across stroke joins are deduped — when two strokes
       meet at a vertex, only one marker stamps there (no double
       overlap).

   Vector-clean: every primitive is a canvas path. No images, no
   noise, no textures. Scales cleanly to any resolution.

   Force-uppercase: all input is rendered in caps.
============================================================ */
(function () {
  'use strict';

  const CHAR_W = 100;
  const CHAR_H = 120;

  function arcPts(cx, cy, rx, ry, startDeg, endDeg, steps) {
    const pts = [];
    const n = Math.max(2, steps);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = (startDeg + (endDeg - startDeg) * t) * Math.PI / 180;
      pts.push({ x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) });
    }
    return pts;
  }

  // ---- Stroke definitions ----
  // Polylines in a normalized 100×120 unit box. Origin top-left.
  // Curves are approximated as point sequences (typically 12–18
  // points around an arc) — enough that markers tracing them read
  // as smooth at typical render sizes.
  const STROKES = {
    'A': [
      [{x: 5, y: 120}, {x: 50, y: 0}, {x: 95, y: 120}],
      [{x: 22, y: 75}, {x: 78, y: 75}],
    ],
    'B': [
      [{x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 10, y: 0}, {x: 65, y: 0},
        ...arcPts(65, 30, 28, 30, -90, 90, 12),
        {x: 10, y: 60}],
      [{x: 10, y: 60}, {x: 65, y: 60},
        ...arcPts(65, 90, 30, 30, -90, 90, 12),
        {x: 10, y: 120}],
    ],
    'C': [
      arcPts(55, 60, 50, 60, 30, 330, 18),
    ],
    'D': [
      [{x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 10, y: 0}, {x: 50, y: 0},
        ...arcPts(50, 60, 40, 60, -90, 90, 18),
        {x: 10, y: 120}],
    ],
    'E': [
      [{x: 90, y: 0}, {x: 10, y: 0}, {x: 10, y: 120}, {x: 90, y: 120}],
      [{x: 10, y: 60}, {x: 70, y: 60}],
    ],
    'F': [
      [{x: 90, y: 0}, {x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 10, y: 60}, {x: 70, y: 60}],
    ],
    'G': [
      arcPts(55, 60, 50, 60, 30, 330, 18),
      [{x: 95, y: 30}, {x: 95, y: 60}, {x: 60, y: 60}],
    ],
    'H': [
      [{x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 90, y: 0}, {x: 90, y: 120}],
      [{x: 10, y: 60}, {x: 90, y: 60}],
    ],
    'I': [
      [{x: 50, y: 0}, {x: 50, y: 120}],
      [{x: 25, y: 0}, {x: 75, y: 0}],
      [{x: 25, y: 120}, {x: 75, y: 120}],
    ],
    'J': [
      [{x: 25, y: 0}, {x: 75, y: 0}],
      [{x: 60, y: 0}, {x: 60, y: 90},
        ...arcPts(35, 90, 25, 25, 0, 90, 8),
        {x: 10, y: 115}],
    ],
    'K': [
      [{x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 90, y: 0}, {x: 10, y: 60}, {x: 90, y: 120}],
    ],
    'L': [
      [{x: 10, y: 0}, {x: 10, y: 120}, {x: 90, y: 120}],
    ],
    'M': [
      [{x: 5, y: 120}, {x: 5, y: 0}, {x: 50, y: 80}, {x: 95, y: 0}, {x: 95, y: 120}],
    ],
    'N': [
      [{x: 10, y: 120}, {x: 10, y: 0}, {x: 90, y: 120}, {x: 90, y: 0}],
    ],
    'O': [
      // Polyline placeholder — O_STYLES draw a perfect circle directly.
      arcPts(50, 60, 45, 60, 0, 360, 32),
    ],
    'P': [
      [{x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 10, y: 0}, {x: 60, y: 0},
        ...arcPts(60, 32, 30, 32, -90, 90, 12),
        {x: 10, y: 64}],
    ],
    'Q': [
      arcPts(50, 60, 45, 55, 0, 360, 32),
      [{x: 60, y: 80}, {x: 100, y: 120}],
    ],
    'R': [
      [{x: 10, y: 0}, {x: 10, y: 120}],
      [{x: 10, y: 0}, {x: 60, y: 0},
        ...arcPts(60, 32, 30, 32, -90, 90, 12),
        {x: 10, y: 64}],
      [{x: 50, y: 64}, {x: 95, y: 120}],
    ],
    'S': [
      [
        ...arcPts(50, 30, 40, 30, 270, 90, 12),
        ...arcPts(50, 90, 40, 30, 270, 90, 12).map(p => ({ x: 100 - p.x, y: p.y })),
      ],
    ],
    'T': [
      [{x: 5, y: 0}, {x: 95, y: 0}],
      [{x: 50, y: 0}, {x: 50, y: 120}],
    ],
    // U: single continuous stroke — vertical, 180° arc, vertical.
    // The arc spans the full bottom width so the bowl reads cleanly
    // (previous version had a too-tight arc that pinched the bottom).
    'U': [
      [
        {x: 10, y: 0}, {x: 10, y: 70},
        ...arcPts(50, 70, 40, 50, 180, 360, 14),
        {x: 90, y: 0},
      ],
    ],
    'V': [
      [{x: 5, y: 0}, {x: 50, y: 120}, {x: 95, y: 0}],
    ],
    'W': [
      [{x: 5, y: 0}, {x: 25, y: 120}, {x: 50, y: 40}, {x: 75, y: 120}, {x: 95, y: 0}],
    ],
    'X': [
      [{x: 5, y: 0}, {x: 95, y: 120}],
      [{x: 95, y: 0}, {x: 5, y: 120}],
    ],
    'Y': [
      [{x: 5, y: 0}, {x: 50, y: 60}, {x: 95, y: 0}],
      [{x: 50, y: 60}, {x: 50, y: 120}],
    ],
    'Z': [
      [{x: 10, y: 0}, {x: 90, y: 0}, {x: 10, y: 120}, {x: 90, y: 120}],
    ],

    // ---- Digits ----
    '0': [
      arcPts(50, 60, 40, 55, 0, 360, 28),
    ],
    '1': [
      [{x: 30, y: 25}, {x: 50, y: 0}, {x: 50, y: 120}],
      [{x: 25, y: 120}, {x: 75, y: 120}],
    ],
    '2': [
      [
        ...arcPts(50, 30, 35, 30, 180, 360, 12),
        {x: 85, y: 50}, {x: 15, y: 120}, {x: 90, y: 120},
      ],
    ],
    // 3: TWO clean bowls. Top semicircle opening left, bottom
    // semicircle opening left, joined at the middle (50, 60).
    // Replaces the previous mash that tried to do both bowls in
    // one polyline and looked tangled.
    '3': [
      [
        ...arcPts(50, 30, 32, 30, 200, 540, 18),  // upper bowl: ~340° opening on the left
        {x: 50, y: 60},
        ...arcPts(50, 90, 32, 30, 180, 540, 18).slice(1),  // lower bowl
      ],
    ],
    '4': [
      [{x: 70, y: 0}, {x: 10, y: 80}, {x: 90, y: 80}],
      [{x: 70, y: 0}, {x: 70, y: 120}],
    ],
    '5': [
      [{x: 90, y: 0}, {x: 15, y: 0}, {x: 15, y: 55}, {x: 55, y: 55},
        ...arcPts(55, 87, 30, 32, -90, 90, 12),
        {x: 15, y: 119}],
    ],
    // 6: Top arc curling from upper-right down through the left,
    // then a closed lower bowl. Replaces the previous double-arc
    // that looked like a tangled spiral.
    '6': [
      // Curl: from upper-right, around the left, down to the bowl
      [
        {x: 80, y: 25},
        ...arcPts(50, 60, 40, 55, -45, 180, 12),
      ],
      // Lower bowl: closed loop
      arcPts(50, 85, 38, 32, 0, 360, 18),
    ],
    '7': [
      [{x: 10, y: 0}, {x: 90, y: 0}, {x: 30, y: 120}],
    ],
    '8': [
      arcPts(50, 30, 30, 30, 0, 360, 16),
      arcPts(50, 90, 35, 30, 0, 360, 18),
    ],
    '9': [
      [
        ...arcPts(50, 35, 35, 35, 0, 360, 16),
        {x: 85, y: 35}, {x: 70, y: 120},
      ],
    ],

    // ---- Punctuation ----
    '.': [[{x: 50, y: 110}, {x: 50, y: 110}]],
    ',': [[{x: 55, y: 105}, {x: 40, y: 120}]],
    '!': [
      [{x: 50, y: 0}, {x: 50, y: 85}],
      [{x: 50, y: 110}, {x: 50, y: 110}],
    ],
    // ?: full hook (clear question mark shape) plus a single dot.
    // Previous version had a half-arc that didn't read.
    '?': [
      [
        ...arcPts(50, 30, 28, 28, 200, 540, 14),  // ~340° hook
        {x: 50, y: 75},
        {x: 50, y: 85},
      ],
      [{x: 50, y: 110}, {x: 50, y: 110}],
    ],
    '-': [[{x: 25, y: 60}, {x: 75, y: 60}]],
    "'": [[{x: 50, y: 0}, {x: 50, y: 25}]],
  };

  // ---- Stroke utilities ----
  function polylineLength(poly) {
    let total = 0;
    for (let i = 1; i < poly.length; i++) {
      total += Math.hypot(poly[i].x - poly[i-1].x, poly[i].y - poly[i-1].y);
    }
    return total;
  }

  function samplePolyline(poly, step) {
    if (!poly || poly.length === 0) return [];
    if (poly.length === 1) return [{ ...poly[0] }];
    const totalLen = polylineLength(poly);
    if (totalLen === 0) return [{ ...poly[0] }];
    const out = [{ ...poly[0] }];
    const targets = [];
    for (let d = step; d < totalLen; d += step) targets.push(d);
    let idx = 0;
    let acc = 0;
    let prev = poly[0];
    for (let i = 1; i < poly.length && idx < targets.length; i++) {
      const cur = poly[i];
      const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      while (idx < targets.length && targets[idx] <= acc + segLen) {
        const t = segLen > 0 ? (targets[idx] - acc) / segLen : 0;
        out.push({
          x: prev.x + (cur.x - prev.x) * t,
          y: prev.y + (cur.y - prev.y) * t,
        });
        idx++;
      }
      acc += segLen;
      prev = cur;
    }
    out.push({ ...poly[poly.length - 1] });
    return out;
  }

  // Sample EVERY stroke in the list, collecting points into a flat
  // array, deduped against points that are very close to ones already
  // emitted. Prevents two strokes that meet at a join from stamping
  // overlapping markers there.
  //
  // The dedupe radius is in normalized units (100×120 box). At ~5
  // units, two markers within roughly 5% of the cell width are
  // considered the same point — tight enough to catch true joins,
  // loose enough that we don't accidentally drop points along a
  // dense stroke.
  function sampleAllStrokes(strokes, step, dedupeRadius = 5) {
    const out = [];
    const r2 = dedupeRadius * dedupeRadius;
    for (const poly of strokes) {
      const pts = samplePolyline(poly, step);
      for (const p of pts) {
        let dup = false;
        for (let i = 0; i < out.length; i++) {
          const dx = out[i].x - p.x;
          const dy = out[i].y - p.y;
          if (dx * dx + dy * dy < r2) { dup = true; break; }
        }
        if (!dup) out.push(p);
      }
    }
    return out;
  }

  function strokePath(strokes, ctx, lw) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    for (const poly of strokes) {
      if (poly.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.stroke();
    }
  }

  // ---- Standard styles (13) ----
  // Sizes tuned to be ~25% larger than before. Markers are deduped
  // across stroke joins via sampleAllStrokes.
  //
  // CONSISTENCY NOTE: most marker-based styles use a marker "size"
  // around 8–9 normalized units. Step around 18–22 units between
  // markers. This keeps visual weight similar across styles when
  // scanning a phrase.
  const STD_STYLES = [
    // 0: Solid spine — clean fat line drawing
    function solidSpine(ctx, strokes, color) {
      ctx.strokeStyle = color;
      strokePath(strokes, ctx, 16);
    },

    // 1: Bold dotted spine
    function dottedSpine(ctx, strokes, color) {
      ctx.fillStyle = color;
      const pts = sampleAllStrokes(strokes, 20, 6);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 2: Medium dots — a touch smaller and denser than #1
    function mediumDots(ctx, strokes, color) {
      ctx.fillStyle = color;
      const pts = sampleAllStrokes(strokes, 14, 5);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 3: Dashed spine
    function dashedSpine(ctx, strokes, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'butt';
      ctx.lineWidth = 14;
      ctx.setLineDash([16, 10]);
      for (const poly of strokes) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    },

    // 4: Hollow rings along the path
    function hollowRings(ctx, strokes, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const pts = sampleAllStrokes(strokes, 22, 7);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    },

    // 5: Plus-marks
    function plusMarks(ctx, strokes, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      const pts = sampleAllStrokes(strokes, 20, 6);
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y);
        ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8);
        ctx.stroke();
      }
    },

    // 6: X-marks
    function xMarks(ctx, strokes, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      const pts = sampleAllStrokes(strokes, 20, 6);
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(p.x - 7, p.y - 7); ctx.lineTo(p.x + 7, p.y + 7);
        ctx.moveTo(p.x + 7, p.y - 7); ctx.lineTo(p.x - 7, p.y + 7);
        ctx.stroke();
      }
    },

    // 7: Hairline + bigger vertex dots
    function hairlineVertex(ctx, strokes, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const poly of strokes) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      // Bigger dots at strategic points: endpoints of every stroke,
      // and at sample points along longer strokes.
      const allDots = [];
      for (const poly of strokes) {
        const len = polylineLength(poly);
        const pts = samplePolyline(poly, Math.max(28, len / 4));
        for (const p of pts) allDots.push(p);
      }
      // Dedupe across joins
      const r2 = 64;  // 8 unit radius
      const seen = [];
      for (const p of allDots) {
        let dup = false;
        for (const q of seen) {
          const dx = q.x - p.x, dy = q.y - p.y;
          if (dx * dx + dy * dy < r2) { dup = true; break; }
        }
        if (!dup) seen.push(p);
      }
      for (const p of seen) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 8: Sparse markers — 3–4 large dots per stroke
    function sparseMarkers(ctx, strokes, color) {
      ctx.fillStyle = color;
      const allPts = [];
      for (const poly of strokes) {
        const len = polylineLength(poly);
        if (len === 0) {
          allPts.push({ ...poly[0] });
          continue;
        }
        const step = Math.max(24, len / 4);
        const pts = samplePolyline(poly, step);
        for (const p of pts) allPts.push(p);
      }
      // Dedupe joins
      const r2 = 64;
      const out = [];
      for (const p of allPts) {
        let dup = false;
        for (const q of out) {
          const dx = q.x - p.x, dy = q.y - p.y;
          if (dx * dx + dy * dy < r2) { dup = true; break; }
        }
        if (!dup) out.push(p);
      }
      for (const p of out) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 9: Bold spine — extra-thick line
    function boldSpine(ctx, strokes, color) {
      ctx.strokeStyle = color;
      strokePath(strokes, ctx, 24);
    },

    // 10: Square markers
    function squares(ctx, strokes, color) {
      ctx.fillStyle = color;
      const half = 7;
      const pts = sampleAllStrokes(strokes, 18, 6);
      for (const p of pts) {
        ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
      }
    },

    // 11: Triangle markers
    function triangles(ctx, strokes, color) {
      ctx.fillStyle = color;
      const r = 8;
      const pts = sampleAllStrokes(strokes, 20, 6);
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y + r * 0.7);
        ctx.lineTo(p.x - r, p.y + r * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    },

    // 12: Cloud cluster — small randomized dots scattered around
    //     the spine. Stable seed per character so the cloud doesn't
    //     shimmer between renders.
    function cloudCluster(ctx, strokes, color) {
      let h = 5381;
      for (const poly of strokes) {
        for (const p of poly) {
          h = ((h * 33) ^ Math.round(p.x)) >>> 0;
          h = ((h * 33) ^ Math.round(p.y)) >>> 0;
        }
      }
      const next = () => {
        h += 0x6D2B79F5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      ctx.fillStyle = color;
      const radius = 14;
      for (const poly of strokes) {
        const pts = samplePolyline(poly, 7);
        for (const p of pts) {
          for (let i = 0; i < 6; i++) {
            const a = next() * Math.PI * 2;
            const r = next() * radius;
            ctx.beginPath();
            ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },
  ];

  // ---- O styles (11) ----
  // O is now drawn at a 56-unit radius (was 45) so its visual height
  // matches the other letters. Center moves slightly higher to keep
  // it in the cell without overflowing.
  const O_CX = 50, O_CY = 60, O_R = 56;

  const O_STYLES = [
    // 0: Filled disk
    function disk(ctx, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R, 0, Math.PI * 2);
      ctx.fill();
    },

    // 1: Dot ring
    function dotRing(ctx, color) {
      ctx.fillStyle = color;
      const r = O_R - 4;
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(O_CX + r * Math.cos(a), O_CY + r * Math.sin(a), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 2: Concentric rings
    function concentric(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (let r = 12; r <= O_R - 2; r += 9) {
        ctx.beginPath();
        ctx.arc(O_CX, O_CY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },

    // 3: Record button — thick outer ring with bold filled center
    function recordButton(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, 22, 0, Math.PI * 2);
      ctx.fill();
    },

    // 4: Outline ring
    function outlineRing(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 4, 0, Math.PI * 2);
      ctx.stroke();
    },

    // 5: Bullseye — alternating filled/empty rings via destination-out
    function bullseye(ctx, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    },

    // 6: Dot cluster — random dots packed inside the circle
    function dotCluster(ctx, color) {
      ctx.fillStyle = color;
      let h = 1234567;
      const next = () => {
        h += 0x6D2B79F5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const R = O_R - 4;
      for (let i = 0; i < 100; i++) {
        let x, y;
        do {
          x = (next() * 2 - 1) * R;
          y = (next() * 2 - 1) * R;
        } while (x*x + y*y > R*R);
        ctx.beginPath();
        ctx.arc(O_CX + x, O_CY + y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 7: Spoked wheel
    function spokedWheel(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 4, 0, Math.PI * 2);
      ctx.stroke();
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(O_CX, O_CY);
        ctx.lineTo(O_CX + (O_R - 4) * Math.cos(a), O_CY + (O_R - 4) * Math.sin(a));
        ctx.stroke();
      }
    },

    // 8: Double ring
    function doubleRing(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 26, 0, Math.PI * 2);
      ctx.stroke();
    },

    // 9: Split disk — top filled, bottom outlined
    function splitDisk(ctx, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 2, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 2, 0, Math.PI);
      ctx.stroke();
    },

    // 10: Dots around a thick inner ring
    function dotsAroundRing(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(O_CX, O_CY, O_R - 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(O_CX + (O_R - 2) * Math.cos(a), O_CY + (O_R - 2) * Math.sin(a), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  ];

  // ---- Letter-specific style pools ----
  // Each function takes (ctx, color). Pools exist for letters with
  // strong geometric variety potential. When a character has a
  // dedicated pool here, we use it; otherwise we fall through to
  // STD_STYLES against the standard stroke definition.

  // ---- A pool ----
  const A_STROKES = STROKES['A'];
  const A_STYLES = [
    // Solid spine
    function (ctx, color) { ctx.strokeStyle = color; strokePath(A_STROKES, ctx, 16); },
    // Dotted spine
    function (ctx, color) {
      ctx.fillStyle = color;
      const pts = sampleAllStrokes(A_STROKES, 20, 6);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fill(); }
    },
    // Open A — no crossbar, just two diagonals
    function (ctx, color) {
      ctx.strokeStyle = color;
      strokePath([A_STROKES[0]], ctx, 16);
    },
    // Filled triangle
    function (ctx, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(50, 5);
      ctx.lineTo(95, 120);
      ctx.lineTo(5, 120);
      ctx.closePath();
      ctx.fill();
    },
    // Plus-marks along spine
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      const pts = sampleAllStrokes(A_STROKES, 20, 6);
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y);
        ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8);
        ctx.stroke();
      }
    },
  ];

  // ---- E pool ----
  const E_STROKES = STROKES['E'];
  const E_STYLES = [
    // Solid spine
    function (ctx, color) { ctx.strokeStyle = color; strokePath(E_STROKES, ctx, 16); },
    // Dotted spine
    function (ctx, color) {
      ctx.fillStyle = color;
      const pts = sampleAllStrokes(E_STROKES, 20, 6);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fill(); }
    },
    // Three-bar E — only the three horizontals, no spine
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 14;
      [
        [{x:10,y:0},{x:90,y:0}],
        [{x:10,y:60},{x:70,y:60}],
        [{x:10,y:120},{x:90,y:120}],
      ].forEach(seg => {
        ctx.beginPath(); ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y); ctx.stroke();
      });
    },
    // Square markers along spine
    function (ctx, color) {
      ctx.fillStyle = color;
      const pts = sampleAllStrokes(E_STROKES, 18, 6);
      for (const p of pts) ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
    },
    // Hollow rings
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const pts = sampleAllStrokes(E_STROKES, 22, 7);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.stroke(); }
    },
  ];

  // ---- I pool ----
  const I_STROKES = STROKES['I'];
  const I_STYLES = [
    // Solid spine
    function (ctx, color) { ctx.strokeStyle = color; strokePath(I_STROKES, ctx, 16); },
    // Bold central column only (no top/bottom serifs)
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 24;
      ctx.beginPath(); ctx.moveTo(50, 0); ctx.lineTo(50, 120); ctx.stroke();
    },
    // Column of dots
    function (ctx, color) {
      ctx.fillStyle = color;
      for (let y = 0; y <= 120; y += 18) {
        ctx.beginPath(); ctx.arc(50, y, 8, 0, Math.PI*2); ctx.fill();
      }
    },
    // Three horizontal bars (top, middle, bottom — no spine)
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 14;
      [0, 60, 120].forEach(y => {
        ctx.beginPath(); ctx.moveTo(25, y); ctx.lineTo(75, y); ctx.stroke();
      });
    },
    // Three big dots stacked
    function (ctx, color) {
      ctx.fillStyle = color;
      [10, 60, 110].forEach(y => {
        ctx.beginPath(); ctx.arc(50, y, 14, 0, Math.PI*2); ctx.fill();
      });
    },
  ];

  // ---- U pool ----
  const U_STROKES = STROKES['U'];
  const U_STYLES = [
    // Solid spine
    function (ctx, color) { ctx.strokeStyle = color; strokePath(U_STROKES, ctx, 16); },
    // Dotted spine
    function (ctx, color) {
      ctx.fillStyle = color;
      const pts = sampleAllStrokes(U_STROKES, 20, 6);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fill(); }
    },
    // Two pillars — no curve at the bottom
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(15, 115); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(85, 0); ctx.lineTo(85, 115); ctx.stroke();
    },
    // Open bowl — just the bottom semicircle, no top legs
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 16;
      const arc = arcPts(50, 60, 40, 50, 180, 360, 14);
      ctx.beginPath(); ctx.moveTo(arc[0].x, arc[0].y);
      for (let i = 1; i < arc.length; i++) ctx.lineTo(arc[i].x, arc[i].y);
      ctx.stroke();
    },
    // Hollow rings along spine
    function (ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const pts = sampleAllStrokes(U_STROKES, 22, 7);
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.stroke(); }
    },
  ];

  // ---- Style index ----
  // Position-aware: incorporates both the character and the cell's
  // index in the phrase, plus the randomize nonce. Consecutive same
  // letters end up on different styles. Same Randomize click → both
  // colors AND letter style assignments shuffle.
  function pickStyleIndex(ch, cellIndex, nonce, total) {
    const c = ch.charCodeAt(0);
    return ((c * 11 + cellIndex * 23 + nonce * 37 + (nonce * c)) >>> 0) % total;
  }

  // ---- Custom SVG-imported glyphs ----
  //
  // Hand-designed letterforms imported from per-letter SVG files.
  // CUSTOM_GLYPHS[ch] is an array of variant compositions; pickStyleIndex
  // (cell position + char + randomize nonce) selects which variant.
  //
  // Covered characters: A-Z, 0-9, comma, period. Anything else is
  // silently dropped at draw time (see drawCharacter).
  //
  // Each op carries the AUTHORED color from the source SVG. Randomize
  // recolors a variant's NON-SPLINE ops (when they all share one color)
  // through RANDOM_PALETTE. Spline ops — authored in black — stay put.
  // The first variant of each digit (0-9) is a special multi-color
  // composition where Randomize SHUFFLES the per-op color assignment
  // instead of remapping — see the digit-shuffle branch in
  // drawCharacter.
  //
  // op types:
  //   { type: 'sc', cx, cy, r, sw, color }       stroked circle
  //   { type: 'fc', cx, cy, r, color }           filled circle
  //   { type: 'sp', d, sw, cap, color }          stroked path
  //   { type: 'fp', d, color }                   filled path
  //   { type: 'se', cx, cy, rx, ry, sw, color }  stroked ellipse
  //   { type: 'fe', cx, cy, rx, ry, color }      filled ellipse
  //   { type: 'fr', x, y, w, h, color }          axis-aligned filled rect
  //   { type: 'sr', x, y, w, h, sw, color }      axis-aligned stroked rect
  const CUSTOM_GLYPHS = {
    ',': [
      {
        vb: { w: 32, h: 192 },
        ops: [
          { type: "fp", d: "M1.39876e-06 160L32 192L32 160H1.39876e-06Z", color: "#E32B1A" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "#E32B1A" },
        ],
      },
    ],
    '.': [
      {
        vb: { w: 32, h: 160 },
        ops: [
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "#E32B1A" },
        ],
      },
    ],
    '0': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M160 0L160 32L128 32L128 0Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0000013987648, cy: 16.0000013987648, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M32 0L32 32L0 32L0 0Z", color: "#E32B1A" },
          { type: "fc", cx: 16.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fp", d: "M32 31.999999999999996L32 64L7.105427357601002e-15 64L0 32.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 16.0000013987648, cy: 48.0000013987648, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 64L32.00000000000001 96L0 96L0 64Z", color: "#E32B1A" },
          { type: "fc", cx: 16.0000013987648, cy: 80.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 64.0007L96.00000000000001 96.0007L64.00000000000001 96.0007L64 64.0007Z", color: "#E32B1A" },
          { type: "fc", cx: 80.0000013987648, cy: 80.00070139876479, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M160 32.000699999999995L160 64.0007L128 64.0007L128 32.000699999999995Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0000013987648, cy: 48.0007013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M160 64.0007L160 96.0007L128 96.0007L128 64.0007Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0000013987648, cy: 80.00070139876479, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M160 96.0007L160 128.0007L128 128.0007L128 96.0007Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0000013987648, cy: 112.0010013987648, r: 16, color: "#0055FF" },
          { type: "fp", d: "M127.99999999999997 128.001L127.99999999999997 160.001L95.99999999999997 160.001L95.99999999999997 128.001Z", color: "#E32B1A" },
          { type: "fc", cx: 112.0000013987648, cy: 144.0010013987648, r: 16, color: "#0055FF" },
          { type: "fp", d: "M159.99999999999997 128.001L159.99999999999997 160.001L127.99999999999997 160.001L127.99999999999997 128.001Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0000013987648, cy: 144.0010013987648, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 128.001L96 160.001L64 160.001L64 128.001Z", color: "#E32B1A" },
          { type: "fc", cx: 80.0000013987648, cy: 144.0010013987648, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M64 128L64 160L32 160L32 128Z", color: "#E32B1A" },
          { type: "fc", cx: 48.0000013987648, cy: 144.0000013987648, r: 16, color: "#F0850B" },
          { type: "fp", d: "M32 128L32 160L0 160L0 128Z", color: "#E32B1A" },
          { type: "fc", cx: 16.0000013987648, cy: 144.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M32 96L32 128L0 128L0 96Z", color: "#E32B1A" },
          { type: "fc", cx: 16.0000013987648, cy: 112.0000013987648, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M128 0L128 32L96 32L96 0Z", color: "#E32B1A" },
          { type: "fc", cx: 112.0000013987648, cy: 16.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M64 0.00024414100000313965L64 32.000244141L32 32.000244141L32 0.00024414100000313965Z", color: "#E32B1A" },
          { type: "fc", cx: 48.0000013987648, cy: 16.0000013987648, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M96 0.0002441409999960342L96 32.000244140999996L64 32.000244140999996L64 0.0002441409999960342Z", color: "#E32B1A" },
          { type: "fc", cx: 80.0000013987648, cy: 16.0000013987648, r: 16, color: "#F0850B" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 144.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 48.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 80.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.0000013987648, cy: 80.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 48.00100139876481, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 80.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 112.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.0000013987648, cy: 144.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 144.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.0000013987648, cy: 144.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48.0000013987648, cy: 144.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 144.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 112.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M160 0L160 32L128 32L128 0Z", color: "black" },
          { type: "fc", cx: 144.0000013987648, cy: 16.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 0L32 32L0 32L0 0Z", color: "black" },
          { type: "fc", cx: 16.0000013987648, cy: 16.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 31.999999999999996L32 64L7.105427357601002e-15 64L0 32.00000000000001Z", color: "#48DC2D" },
          { type: "fc", cx: 16.0000013987648, cy: 48.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M32 64L32.00000000000001 96L0 96L0 64Z", color: "black" },
          { type: "fc", cx: 16.0000013987648, cy: 80.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 64.001L96.00000000000001 96.001L64.00000000000001 96.001L64 64.001Z", color: "black" },
          { type: "fc", cx: 80.0000013987648, cy: 80.0010013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M160 32.001000000000005L160.00000000000003 64.001L128 64.001L128 32.001000000000005Z", color: "#48DC2D" },
          { type: "fc", cx: 144.0000013987648, cy: 48.00100139876481, r: 16, color: "black" },
          { type: "fp", d: "M160 64.001L160 96.001L128 96.001L128 64.001Z", color: "black" },
          { type: "fc", cx: 144.0000013987648, cy: 80.0010013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M160 96.001L160 128.001L127.99999999999997 128.001L127.99999999999997 96.001Z", color: "#48DC2D" },
          { type: "fc", cx: 144.0000013987648, cy: 112.0010013987648, r: 16, color: "black" },
          { type: "fp", d: "M127.99999999999997 128.001L127.99999999999997 160.001L95.99999999999997 160.001L95.99999999999997 128.001Z", color: "#48DC2D" },
          { type: "fc", cx: 112.0000013987648, cy: 144.0010013987648, r: 16, color: "black" },
          { type: "fp", d: "M159.99999999999997 128.001L159.99999999999997 160.001L127.99999999999997 160.001L127.99999999999997 128.001Z", color: "black" },
          { type: "fc", cx: 144.0000013987648, cy: 144.0010013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 128.001L96 160.001L64 160.001L64 128.001Z", color: "black" },
          { type: "fc", cx: 80.0000013987648, cy: 144.0010013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 128L64 160L32 160L32 128Z", color: "#48DC2D" },
          { type: "fc", cx: 48.0000013987648, cy: 144.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M32 128L32 160L0 160L0 128Z", color: "black" },
          { type: "fc", cx: 16.0000013987648, cy: 144.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 96L32 128L0 128L0 96Z", color: "#48DC2D" },
          { type: "fc", cx: 16.0000013987648, cy: 112.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M128 0L128 32L96 32L96 0Z", color: "#48DC2D" },
          { type: "fc", cx: 112.0000013987648, cy: 16.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M64 0.00024414100000313965L64 32.000244141L32 32.000244141L32 0.00024414100000313965Z", color: "#48DC2D" },
          { type: "fc", cx: 48.0000013987648, cy: 16.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M96 0.0002441409999960342L96 32.000244140999996L64 32.000244140999996L64 0.0002441409999960342Z", color: "black" },
          { type: "fc", cx: 80.0000013987648, cy: 16.0000013987648, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '1': [
      {
        vb: { w: 96, h: 160 },
        ops: [
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 16L32.0000013987648 48L64.0000013987648 47.9999986012352L64 15.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 47.99999999999999, cy: 32, r: 16, color: "#0055FF" },
          { type: "fp", d: "M0 37L0.0000013987648 69L32.0000013987648 68.9999986012352L32 36.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 53, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M64 32L64.0000013987648 64L96.0000013987648 63.9999986012352L96 31.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 48.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 64L64.0000013987648 96L96.0000013987648 95.9999986012352L96 63.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 79.99999999999999, cy: 80.00000000000001, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64 96L64.0000013987648 128L96.0000013987648 127.9999986012352L96 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 79.99999999999999, cy: 112.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M64 128L64.0000013987648 160L96.0000013987648 159.9999986012352L96 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#F0850B" },
        ],
      },
      {
        vb: { w: 96, h: 160 },
        ops: [
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 47.99999999999999, cy: 32, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 53, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 48.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 79.99999999999999, cy: 80.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 79.99999999999999, cy: 112.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 96, h: 160 },
        ops: [
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 16L32.0000013987648 48L64.0000013987648 47.9999986012352L64 15.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 47.99999999999999, cy: 32, r: 16, color: "black" },
          { type: "fp", d: "M0 37L0.0000013987648 69L32.0000013987648 68.9999986012352L32 36.9999986012352Z", color: "black" },
          { type: "fc", cx: 16, cy: 53, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 32L64.0000013987648 64L96.0000013987648 63.9999986012352L96 31.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 80, cy: 48.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M64 64L64.0000013987648 96L96.0000013987648 95.9999986012352L96 63.9999986012352Z", color: "black" },
          { type: "fc", cx: 79.99999999999999, cy: 80.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 96L64.0000013987648 128L96.0000013987648 127.9999986012352L96 95.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 79.99999999999999, cy: 112.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M64 128L64.0000013987648 160L96.0000013987648 159.9999986012352L96 127.9999986012352Z", color: "black" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '2': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 20L0.0000013987648 52L32.0000013987648 51.9999986012352L32 19.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 16.000000000000004, cy: 36, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M128 20L128.0000013987648 52L160.0000013987648 51.9999986012352L160 19.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 36, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M128 52L128.0000013987648 84L160.0000013987648 83.9999986012352L160 51.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 68.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M96 63L96.0000013987648 95L128.0000013987648 94.9999986012352L128 62.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 111.99999999999999, cy: 79.00000000000001, r: 16, color: "#F0850B" },
          { type: "fp", d: "M64 74L64.0000013987648 106L96.0000013987648 105.9999986012352L96 73.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 79.99999999999999, cy: 90.00000000000001, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M32 85L32.0000013987648 117L64.0000013987648 116.9999986012352L64 84.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 101, r: 16, color: "#0055FF" },
          { type: "fp", d: "M0 96L0.0000013987648 128L32.0000013987648 127.9999986012352L32 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 128L32.0000013987648 160L64.0000013987648 159.9999986012352L64 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 128L64.0000013987648 160L96.0000013987648 159.9999986012352L96 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M96 128L96.0000013987648 160L128.0000013987648 159.9999986012352L128 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "#F0850B" },
          { type: "fp", d: "M128 128L128.0000013987648 160L160.0000013987648 159.9999986012352L160 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 143.99999999999997, cy: 144.00000000000003, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M32 10L32.0000013987648 42L64.0000013987648 41.9999986012352L64 9.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 26, r: 16, color: "#0055FF" },
          { type: "fp", d: "M96 10L96.0000013987648 42L128.0000013987648 41.9999986012352L128 9.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 26, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 16.000000000000004, cy: 36, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 36, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 68.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 111.99999999999999, cy: 79.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 79.99999999999999, cy: 90.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 101, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 143.99999999999997, cy: 144.00000000000003, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 26, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 26, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 20L0.0000013987648 52L32.0000013987648 51.9999986012352L32 19.9999986012352Z", color: "black" },
          { type: "fc", cx: 16.000000000000004, cy: 36, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M128 20L128.0000013987648 52L160.0000013987648 51.9999986012352L160 19.9999986012352Z", color: "black" },
          { type: "fc", cx: 144, cy: 36, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M128 52L128.0000013987648 84L160.0000013987648 83.9999986012352L160 51.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 68.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M96 63L96.0000013987648 95L128.0000013987648 94.9999986012352L128 62.9999986012352Z", color: "black" },
          { type: "fc", cx: 111.99999999999999, cy: 79.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 74L64.0000013987648 106L96.0000013987648 105.9999986012352L96 73.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 79.99999999999999, cy: 90.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M32 85L32.0000013987648 117L64.0000013987648 116.9999986012352L64 84.9999986012352Z", color: "black" },
          { type: "fc", cx: 48, cy: 101, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 96L0.0000013987648 128L32.0000013987648 127.9999986012352L32 95.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M32 128L32.0000013987648 160L64.0000013987648 159.9999986012352L64 127.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "black" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 128L64.0000013987648 160L96.0000013987648 159.9999986012352L96 127.9999986012352Z", color: "black" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 128L96.0000013987648 160L128.0000013987648 159.9999986012352L128 127.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M128 128L128.0000013987648 160L160.0000013987648 159.9999986012352L160 127.9999986012352Z", color: "black" },
          { type: "fc", cx: 143.99999999999997, cy: 144.00000000000003, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 10L32.0000013987648 42L64.0000013987648 41.9999986012352L64 9.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 26, r: 16, color: "black" },
          { type: "fp", d: "M96 10L96.0000013987648 42L128.0000013987648 41.9999986012352L128 9.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 26, r: 16, color: "black" },
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '3': [
      {
        vb: { w: 144, h: 160 },
        ops: [
          { type: "fp", d: "M32 0L32.0000013987648 32L64.0000013987648 31.9999986012352L64 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 15.999999999999998, r: 16, color: "#0055FF" },
          { type: "fp", d: "M0 0L0.0000013987648 32L32.0000013987648 31.9999986012352L32 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 15.999999999999996, cy: 16, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 0L96.0000013987648 32L128.0000013987648 31.9999986012352L128 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M112 32L112.0000013987648 64L144.0000013987648 63.9999986012352L144 31.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 128, cy: 48, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M96 64L96.0000013987648 96L128.0000013987648 95.9999986012352L128 63.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 111.99999999999999, cy: 80.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M64 64L64.0000013987648 96L96.0000013987648 95.9999986012352L96 63.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 79.99999999999999, cy: 80.00000000000001, r: 16, color: "#F0850B" },
          { type: "fp", d: "M32 64L32.0000013987648 96L64.0000013987648 95.9999986012352L64 63.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48.00000000000001, cy: 80, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M112 96L112.0000013987648 128L144.0000013987648 127.9999986012352L144 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 128, cy: 112.00000000000001, r: 16, color: "#0055FF" },
          { type: "fp", d: "M96 128L96.0000013987648 160L128.0000013987648 159.9999986012352L128 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 128L32.0000013987648 160L64.0000013987648 159.9999986012352L64 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64 128L64.0000013987648 160L96.0000013987648 159.9999986012352L96 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "black" },
        ],
      },
      {
        vb: { w: 144, h: 160 },
        ops: [
          { type: "fc", cx: 48, cy: 15.999999999999998, r: 16, color: "#0055FF" },
          { type: "fc", cx: 15.999999999999996, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 128, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 111.99999999999999, cy: 80.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 79.99999999999999, cy: 80.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48.00000000000001, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 128, cy: 112.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 144, h: 160 },
        ops: [
          { type: "fp", d: "M32 0L32.0000013987648 32L64.0000013987648 31.9999986012352L64 -0.0000013987648Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 15.999999999999998, r: 16, color: "black" },
          { type: "fp", d: "M0 0L0.0000013987648 32L32.0000013987648 31.9999986012352L32 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 15.999999999999996, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 0L96.0000013987648 32L128.0000013987648 31.9999986012352L128 -0.0000013987648Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M112 32L112.0000013987648 64L144.0000013987648 63.9999986012352L144 31.9999986012352Z", color: "black" },
          { type: "fc", cx: 128, cy: 48, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 64L96.0000013987648 96L128.0000013987648 95.9999986012352L128 63.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 111.99999999999999, cy: 80.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M64 64L64.0000013987648 96L96.0000013987648 95.9999986012352L96 63.9999986012352Z", color: "black" },
          { type: "fc", cx: 79.99999999999999, cy: 80.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 64L32.0000013987648 96L64.0000013987648 95.9999986012352L64 63.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 48.00000000000001, cy: 80, r: 16, color: "black" },
          { type: "fp", d: "M112 96L112.0000013987648 128L144.0000013987648 127.9999986012352L144 95.9999986012352Z", color: "black" },
          { type: "fc", cx: 128, cy: 112.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 128L96.0000013987648 160L128.0000013987648 159.9999986012352L128 127.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M32 128L32.0000013987648 160L64.0000013987648 159.9999986012352L64 127.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M64 128L64.0000013987648 160L96.0000013987648 159.9999986012352L96 127.9999986012352Z", color: "black" },
          { type: "fc", cx: 80.00000000000001, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "black" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '4': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M96 0L96.0000013987648 32L128.0000013987648 31.9999986012352L128 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M64 21L64.0000013987648 53L96.0000013987648 52.9999986012352L96 20.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 37.00000000000001, r: 16, color: "#0055FF" },
          { type: "fp", d: "M32 43L32.0000013987648 75L64.0000013987648 74.9999986012352L64 42.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48.00000000000001, cy: 59.00000000000001, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M0 64L0.0000013987648 96L32.0000013987648 95.9999986012352L32 63.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 15.999999999999996, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 96L0.0000013987648 128L32.0000013987648 127.9999986012352L32 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M32 96L32.0000013987648 128L64.0000013987648 127.9999986012352L64 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M64 96L64.0000013987648 128L96.0000013987648 127.9999986012352L96 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 79.99999999999999, cy: 112.00000000000001, r: 16, color: "#F0850B" },
          { type: "fp", d: "M128 96L128.0000013987648 128L160.0000013987648 127.9999986012352L160 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 112.00000000000001, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 32L96.0000013987648 64L128.0000013987648 63.9999986012352L128 31.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 48, r: 16, color: "#F0850B" },
          { type: "fp", d: "M96 64L96.0000013987648 96L128.0000013987648 95.9999986012352L128 63.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 111.99999999999999, cy: 80.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M96 96L96.0000013987648 128L128.0000013987648 127.9999986012352L128 95.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 111.99999999999999, cy: 112.00000000000001, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M96 128L96.0000013987648 160L128.0000013987648 159.9999986012352L128 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 37.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48.00000000000001, cy: 59.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 15.999999999999996, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 79.99999999999999, cy: 112.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 112.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 111.99999999999999, cy: 80.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 111.99999999999999, cy: 112.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M96 0L96.0000013987648 32L128.0000013987648 31.9999986012352L128 -0.0000013987648Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M64 21L64.0000013987648 53L96.0000013987648 52.9999986012352L96 20.9999986012352Z", color: "black" },
          { type: "fc", cx: 80, cy: 37.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 43L32.0000013987648 75L64.0000013987648 74.9999986012352L64 42.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 48.00000000000001, cy: 59.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M0 64L0.0000013987648 96L32.0000013987648 95.9999986012352L32 63.9999986012352Z", color: "black" },
          { type: "fc", cx: 15.999999999999996, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 96L0.0000013987648 128L32.0000013987648 127.9999986012352L32 95.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M32 96L32.0000013987648 128L64.0000013987648 127.9999986012352L64 95.9999986012352Z", color: "black" },
          { type: "fc", cx: 48, cy: 112, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 96L64.0000013987648 128L96.0000013987648 127.9999986012352L96 95.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 79.99999999999999, cy: 112.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M128 96L128.0000013987648 128L160.0000013987648 127.9999986012352L160 95.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 112.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M96 32L96.0000013987648 64L128.0000013987648 63.9999986012352L128 31.9999986012352Z", color: "black" },
          { type: "fc", cx: 112, cy: 48, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 64L96.0000013987648 96L128.0000013987648 95.9999986012352L128 63.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 111.99999999999999, cy: 80.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M96 96L96.0000013987648 128L128.0000013987648 127.9999986012352L128 95.9999986012352Z", color: "black" },
          { type: "fc", cx: 111.99999999999999, cy: 112.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 128L96.0000013987648 160L128.0000013987648 159.9999986012352L128 127.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 112.00000000000001, cy: 144, r: 16, color: "black" },
        ],
      },
    ],
    '5': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 160L0 128L32 128L32 160Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M127.99999999999999 160L127.99999999999999 128L160 128L160 160Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 128L127.99999999999999 96L160 96L160 128Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 96L96.00000000000001 64L128 64.00000000000001L128 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#0055FF" },
          { type: "fp", d: "M63.99999999999999 96L63.99999999999999 64L96 64.00000000000001L96 96Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M32 96L32 64L64 64L64 96Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#F0850B" },
          { type: "fp", d: "M0 64L0 31.999999999999996L32 32L32 64Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M31.999999999999996 32L32 0L64 7.105427357601002e-15L64 32Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 32L0 0L32 0L32 32Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64 32L64 0L96 0L96 32.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 32L96 0L128 0L128 32Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fp", d: "M128 32L128 0L160 0L160 32Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M32 160L32 128L64 128L64 160Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#F0850B" },
          { type: "fp", d: "M96 160L96 128L128 128L128 160Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64 160L64 128L96 128L96 160Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "black" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 160L0 128L32 128L32 160Z", color: "black" },
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 160L127.99999999999999 128L160 128L160 160Z", color: "black" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 128L127.99999999999999 96L160 96L160 128Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M96 96L96.00000000000001 64L128 64.00000000000001L128 96.00000000000001Z", color: "black" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M63.99999999999999 96L63.99999999999999 64L96 64.00000000000001L96 96Z", color: "#48DC2D" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "black" },
          { type: "fp", d: "M32 96L32 64L64 64L64 96Z", color: "black" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 64L0 31.999999999999996L32 32L32 64Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M31.999999999999996 32L32 0L64 7.105427357601002e-15L64 32Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M0 32L0 0L32 0L32 32Z", color: "black" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 32L64 0L96 0L96 32.00000000000001Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 32L96 0L128 0L128 32Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M128 32L128 0L160 0L160 32Z", color: "black" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 160L32 128L64 128L64 160Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M96 160L96 128L128 128L128 160Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M64 160L64 128L96 128L96 160Z", color: "black" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '6': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 160L0 128L32 128L32 160Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#0055FF" },
          { type: "fp", d: "M127.99999999999999 160L127.99999999999999 128L160 128L160 160Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M127.99999999999999 128L127.99999999999999 96L160 96L160 128Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#F0850B" },
          { type: "fp", d: "M96 96L96.00000000000001 64L128 64.00000000000001L128 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#0055FF" },
          { type: "fp", d: "M128 96L128 64L160 64L160 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 80, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M63.99999999999999 96L63.99999999999999 64L96 64.00000000000001L96 96Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 96L32 64L64 64L64 96Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 128L0 96L32 96L32 128Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M0 96L0 64L32 64L32 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 80, r: 16, color: "#F0850B" },
          { type: "fp", d: "M0 64L0 31.999999999999996L32 32L32 64Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M31.999999999999996 32L32 0L64 7.105427357601002e-15L64 32Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 32L0 0L32 0L32 32Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64 32L64 0L96 0L96 32.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 32L96 0L128 0L128 32Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fp", d: "M128 32L128 0L160 0L160 32Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M32 160L32 128L64 128L64 160Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 160L96 128L128 128L128 160Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64 160L64 128L96 128L96 160Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 160L0 128L32 128L32 160Z", color: "black" },
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 160L127.99999999999999 128L160 128L160 160Z", color: "black" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 128L127.99999999999999 96L160 96L160 128Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M96 96L96.00000000000001 64L128 64.00000000000001L128 96.00000000000001Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "black" },
          { type: "fp", d: "M128 96L128 64L160 64L160 96.00000000000001Z", color: "black" },
          { type: "fc", cx: 144, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M63.99999999999999 96L63.99999999999999 64L96 64.00000000000001L96 96Z", color: "black" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 96L32 64L64 64L64 96Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "black" },
          { type: "fp", d: "M0 128L0 96L32 96L32 128Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M0 96L0 64L32 64L32 96.00000000000001Z", color: "black" },
          { type: "fc", cx: 16, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 64L0 31.999999999999996L32 32L32 64Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M31.999999999999996 32L32 0L64 7.105427357601002e-15L64 32Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M0 32L0 0L32 0L32 32Z", color: "black" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 32L64 0L96 0L96 32.00000000000001Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 32L96 0L128 0L128 32Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M128 32L128 0L160 0L160 32Z", color: "black" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 160L32 128L64 128L64 160Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M96 160L96 128L128 128L128 160Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M64 160L64 128L96 128L96 160Z", color: "black" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '7': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M96 56L96.0000013987648 88L128.0000013987648 87.9999986012352L128 55.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 111.99999999999999, cy: 72.00000000000001, r: 16, color: "#F0850B" },
          { type: "fp", d: "M128 32L128.0000013987648 64L160.0000013987648 63.9999986012352L160 31.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M128 0L128.0000013987648 32L160.0000013987648 31.9999986012352L160 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M96 0L96.0000013987648 32L128.0000013987648 31.9999986012352L128 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 0L32.0000013987648 32L64.0000013987648 31.9999986012352L64 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 15.999999999999998, r: 16, color: "#0055FF" },
          { type: "fp", d: "M0 0L0.0000013987648 32L32.0000013987648 31.9999986012352L32 -0.0000013987648Z", color: "#E32B1A" },
          { type: "fc", cx: 15.999999999999996, cy: 16, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M64 80L64.0000013987648 112L96.0000013987648 111.9999986012352L96 79.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 79.99999999999999, cy: 96.00000000000001, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M32 104L32.0000013987648 136L64.0000013987648 135.9999986012352L64 103.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 120, r: 16, color: "#0055FF" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "#E32B1A" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#F5F5F5" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 111.99999999999999, cy: 72.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 15.999999999999998, r: 16, color: "#0055FF" },
          { type: "fc", cx: 15.999999999999996, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 79.99999999999999, cy: 96.00000000000001, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 120, r: 16, color: "#0055FF" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M96 56L96.0000013987648 88L128.0000013987648 87.9999986012352L128 55.9999986012352Z", color: "black" },
          { type: "fc", cx: 111.99999999999999, cy: 72.00000000000001, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M128 32L128.0000013987648 64L160.0000013987648 63.9999986012352L160 31.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M128 0L128.0000013987648 32L160.0000013987648 31.9999986012352L160 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 0L96.0000013987648 32L128.0000013987648 31.9999986012352L128 -0.0000013987648Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M64 0L64.0000013987648 32L96.0000013987648 31.9999986012352L96 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 0L32.0000013987648 32L64.0000013987648 31.9999986012352L64 -0.0000013987648Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 15.999999999999998, r: 16, color: "black" },
          { type: "fp", d: "M0 0L0.0000013987648 32L32.0000013987648 31.9999986012352L32 -0.0000013987648Z", color: "black" },
          { type: "fc", cx: 15.999999999999996, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 80L64.0000013987648 112L96.0000013987648 111.9999986012352L96 79.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 79.99999999999999, cy: 96.00000000000001, r: 16, color: "black" },
          { type: "fp", d: "M32 104L32.0000013987648 136L64.0000013987648 135.9999986012352L64 103.9999986012352Z", color: "black" },
          { type: "fc", cx: 48, cy: 120, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 128L0.0000013987648 160L32.0000013987648 159.9999986012352L32 127.9999986012352Z", color: "#48DC2D" },
          { type: "fc", cx: 15.999999999999996, cy: 144, r: 16, color: "black" },
        ],
      },
    ],
    '8': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 160L0 128L32 128L32 160Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M127.99999999999999 160L127.99999999999999 128L160 128L160 160Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#0055FF" },
          { type: "fp", d: "M127.99999999999999 128L127.99999999999999 96L160 96L160 128Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M96 96L96.00000000000001 64L128 64.00000000000001L128 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#0055FF" },
          { type: "fp", d: "M128 96L128 64L160 64L160 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 80, r: 16, color: "#F0850B" },
          { type: "fp", d: "M63.99999999999999 96L63.99999999999999 64L96 64.00000000000001L96 96Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32 96L32 64L64 64L64 96Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 128L0 96L32 96L32 128Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#F0850B" },
          { type: "fp", d: "M0 96L0 64L32 64L32 96.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 80, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M0 64L0 31.999999999999996L32 32L32 64Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M128 64L128 32L160 32L160 64Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M31.999999999999996 32L32 0L64 7.105427357601002e-15L64 32Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "#0055FF" },
          { type: "fp", d: "M0 32L0 0L32 0L32 32Z", color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M64 32L64 0L96 0L96 32.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M96 32L96 0L128 0L128 32Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M128 32L128 0L160 0L160 32Z", color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M32 160L32 128L64 128L64 160Z", color: "#E32B1A" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M96 160L96 128L128 128L128 160Z", color: "#E32B1A" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M64 160L64 128L96 128L96 160Z", color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 80, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 48, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M0 160L0 128L32 128L32 160Z", color: "black" },
          { type: "fc", cx: 16, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 160L127.99999999999999 128L160 128L160 160Z", color: "black" },
          { type: "fc", cx: 144, cy: 144, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M127.99999999999999 128L127.99999999999999 96L160 96L160 128Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M96 96L96.00000000000001 64L128 64.00000000000001L128 96.00000000000001Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 80, r: 16, color: "black" },
          { type: "fp", d: "M128 96L128 64L160 64L160 96.00000000000001Z", color: "black" },
          { type: "fc", cx: 144, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M63.99999999999999 96L63.99999999999999 64L96 64.00000000000001L96 96Z", color: "black" },
          { type: "fc", cx: 80, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 96L32 64L64 64L64 96Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 80, r: 16, color: "black" },
          { type: "fp", d: "M0 128L0 96L32 96L32 128Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 112, r: 16, color: "black" },
          { type: "fp", d: "M0 96L0 64L32 64L32 96.00000000000001Z", color: "black" },
          { type: "fc", cx: 16, cy: 80, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M0 64L0 31.999999999999996L32 32L32 64Z", color: "#48DC2D" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M128 64L128 32L160 32L160 64Z", color: "#48DC2D" },
          { type: "fc", cx: 144, cy: 48, r: 16, color: "black" },
          { type: "fp", d: "M31.999999999999996 32L32 0L64 7.105427357601002e-15L64 32Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M0 32L0 0L32 0L32 32Z", color: "black" },
          { type: "fc", cx: 16, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64 32L64 0L96 0L96 32.00000000000001Z", color: "black" },
          { type: "fc", cx: 80, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96 32L96 0L128 0L128 32Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 16, r: 16, color: "black" },
          { type: "fp", d: "M128 32L128 0L160 0L160 32Z", color: "black" },
          { type: "fc", cx: 144, cy: 16, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 160L32 128L64 128L64 160Z", color: "#48DC2D" },
          { type: "fc", cx: 48, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M96 160L96 128L128 128L128 160Z", color: "#48DC2D" },
          { type: "fc", cx: 112, cy: 144, r: 16, color: "black" },
          { type: "fp", d: "M64 160L64 128L96 128L96 160Z", color: "black" },
          { type: "fc", cx: 80, cy: 144, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    '9': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M160.001 0L160.001 32L128.001 32L128.001 0Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0010013987648, cy: 16.0000013987648, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32.001 0L32.001000000000005 32.00000000000001L0.0010000000000012221 32.00000000000001L0.0010000000000012221 0Z", color: "#E32B1A" },
          { type: "fc", cx: 16.000977960764803, cy: 16.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M32 31.999999999999996L32 64L7.105427357601002e-15 64L0 32.00000000000001Z", color: "#E32B1A" },
          { type: "fc", cx: 16.000977960764803, cy: 48.0000013987648, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M64.001 63.99999999999999L64.001 96L32.001000000000005 96L32.001000000000005 63.99999999999999Z", color: "#E32B1A" },
          { type: "fc", cx: 48.0010013987648, cy: 80.0000013987648, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M32.001000000000005 64L32.00100000000001 96L0.0010000000000047748 96L0.0010000000000047748 64Z", color: "#E32B1A" },
          { type: "fc", cx: 16.000977960764803, cy: 80.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96.00100000000002 64.00049999999999L96.00100000000003 96.00049999999999L64.00100000000003 96.00049999999999L64.00100000000002 64.00049999999999Z", color: "#E32B1A" },
          { type: "fc", cx: 80.0010013987648, cy: 80.0005013987648, r: 16, color: "#0055FF" },
          { type: "fp", d: "M128.00100000000003 64.0005L128.00100000000003 96.0005L96.00100000000003 96.0005L96.00100000000003 64.0005Z", color: "#E32B1A" },
          { type: "fc", cx: 112.0010013987648, cy: 80.0005013987648, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M160.00100000000003 32.00050000000002L160.00100000000003 64.00050000000002L128.00100000000003 64.00050000000002L128.00100000000003 32.00050000000002Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0010013987648, cy: 48.000501398764804, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M160.00100000000003 64.0005L160.00100000000003 96.0005L128.00100000000003 96.0005L128.00100000000003 64.0005Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0010013987648, cy: 80.0005013987648, r: 16, color: "#F0850B" },
          { type: "fp", d: "M160.00100000000003 96.0005L160.00100000000003 128.0005L128.00100000000003 128.0005L128.00100000000003 96.0005Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0010013987648, cy: 112.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M128.00099999999998 127.99999999999999L128.00099999999998 160L96.00099999999998 160L96.00099999999998 127.99999999999999Z", color: "#E32B1A" },
          { type: "fc", cx: 112.0010013987648, cy: 144.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M160.00099999999998 128L160.00099999999998 160L128.00099999999998 160L128.00099999999998 128Z", color: "#E32B1A" },
          { type: "fc", cx: 144.0010013987648, cy: 144.0000013987648, r: 16, color: "#DE36E0" },
          { type: "fp", d: "M96.001 128L96.00100000000002 160L64.001 160L64.001 128Z", color: "#E32B1A" },
          { type: "fc", cx: 80.0010013987648, cy: 144.0000013987648, r: 16, color: "#F5F5F5" },
          { type: "fp", d: "M64.001 128L64.001 160L32.001000000000005 160L32.001000000000005 128Z", color: "#E32B1A" },
          { type: "fc", cx: 48.0010013987648, cy: 144.0000013987648, r: 16, color: "#0055FF" },
          { type: "fp", d: "M32.001000000000005 127.99999999999999L32.001000000000005 160L0.0010000000000047748 160L0.0010000000000047748 127.99999999999999Z", color: "#E32B1A" },
          { type: "fc", cx: 16.000977960764803, cy: 144.0000013987648, r: 16, color: "#F8D01F" },
          { type: "fp", d: "M128.001 0L128.001 32L96.00100000000002 32L96.001 0Z", color: "#E32B1A" },
          { type: "fc", cx: 112.0010013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fp", d: "M64.001 0.0002441409999960342L64.001 32.000244140999996L32.001000000000005 32.000244140999996L32.001000000000005 0.0002441409999960342Z", color: "#E32B1A" },
          { type: "fc", cx: 48.0000013987648, cy: 16.0000013987648, r: 16, color: "#F0850B" },
          { type: "fp", d: "M96.001 0.0002441409999960342L96.001 32.000244140999996L64.001 32.000244140999996L64.001 0.0002441409999960342Z", color: "#E32B1A" },
          { type: "fc", cx: 80.0010013987648, cy: 16.0000013987648, r: 16, color: "#F8D01F" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 144.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 48.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48.0000013987648, cy: 80.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 80.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.0000013987648, cy: 80.00070139876479, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.0000013987648, cy: 80.00070139876479, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 48.0007013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 80.00070139876479, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 112.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.0000013987648, cy: 144.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 144.0000013987648, cy: 144.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.0000013987648, cy: 144.0010013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 48.0000013987648, cy: 144.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 16.0000013987648, cy: 144.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 112.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 47.999001398764804, cy: 16.0000013987648, r: 16, color: "#0055FF" },
          { type: "fc", cx: 80.0000013987648, cy: 16.0000013987648, r: 16, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M160.001 0L160.001 32L128.001 32L128.001 0Z", color: "black" },
          { type: "fc", cx: 144.0010013987648, cy: 16.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32.001 0L32.001000000000005 32.00000000000001L0.0010000000000012221 32.00000000000001L0.0010000000000012221 0Z", color: "black" },
          { type: "fc", cx: 16.000977960764803, cy: 16.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M32 31.999999999999996L32 64L7.105427357601002e-15 64L0 32.00000000000001Z", color: "#48DC2D" },
          { type: "fc", cx: 16.000977960764803, cy: 48.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M64.001 63.99999999999999L64.001 96L32.001000000000005 96L32.001000000000005 63.99999999999999Z", color: "#48DC2D" },
          { type: "fc", cx: 48.0010013987648, cy: 80.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M32.001000000000005 64L32.00100000000001 96L0.0010000000000047748 96L0.0010000000000047748 64Z", color: "black" },
          { type: "fc", cx: 16.000977960764803, cy: 80.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96.001 64.0007L96.00100000000002 96.0007L64.00100000000002 96.0007L64.001 64.0007Z", color: "black" },
          { type: "fc", cx: 80.0010013987648, cy: 80.00070139876479, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M128.00100000000003 64.0007L128.00100000000003 96.0007L96.00100000000002 96.0007L96.00100000000002 64.0007Z", color: "#48DC2D" },
          { type: "fc", cx: 112.0010013987648, cy: 80.00070139876479, r: 16, color: "black" },
          { type: "fp", d: "M160.001 32.000699999999995L160.001 64.0007L128.00100000000003 64.0007L128.00100000000003 32.000699999999995Z", color: "#48DC2D" },
          { type: "fc", cx: 144.0010013987648, cy: 48.0007013987648, r: 16, color: "black" },
          { type: "fp", d: "M160.00100000000003 64.0007L160.00100000000003 96.0007L128.00100000000003 96.0007L128.00100000000003 64.0007Z", color: "black" },
          { type: "fc", cx: 144.0010013987648, cy: 80.00070139876479, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M160.00100000000003 96.0007L160.00100000000003 128.0007L128.00100000000003 128.0007L128.00100000000003 96.0007Z", color: "#48DC2D" },
          { type: "fc", cx: 144.0010013987648, cy: 112.0010013987648, r: 16, color: "black" },
          { type: "fp", d: "M128.001 128.001L128.001 160.001L96.001 160.001L96.001 128.001Z", color: "#48DC2D" },
          { type: "fc", cx: 112.0010013987648, cy: 144.0010013987648, r: 16, color: "black" },
          { type: "fp", d: "M160.001 128.001L160.001 160.001L128.001 160.001L128.001 128.001Z", color: "black" },
          { type: "fc", cx: 144.0010013987648, cy: 144.0010013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M96.001 128.001L96.001 160.001L64.001 160.001L64.001 128.001Z", color: "black" },
          { type: "fc", cx: 80.0010013987648, cy: 144.0010013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M64.001 128L64.001 160L32.001000000000005 160L32.001000000000005 128Z", color: "#48DC2D" },
          { type: "fc", cx: 48.0010013987648, cy: 144.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M32.001000000000005 127.99999999999999L32.001000000000005 160L0.0010000000000047748 160L0.0010000000000047748 127.99999999999999Z", color: "black" },
          { type: "fc", cx: 16.000977960764803, cy: 144.0000013987648, r: 16, color: "#48DC2D" },
          { type: "fp", d: "M128.001 0L128.001 32L96.00100000000002 32L96.001 0Z", color: "#48DC2D" },
          { type: "fc", cx: 112.0010013987648, cy: 16.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M64.001 0.0002441409999960342L64.001 32.000244140999996L32.001000000000005 32.000244140999996L32.001000000000005 0.0002441409999960342Z", color: "#48DC2D" },
          { type: "fc", cx: 48.0000013987648, cy: 16.0000013987648, r: 16, color: "black" },
          { type: "fp", d: "M96.001 0.0002441409999960342L96.001 32.000244140999996L64.001 32.000244140999996L64.001 0.0002441409999960342Z", color: "black" },
          { type: "fc", cx: 80.0010013987648, cy: 16.0000013987648, r: 16, color: "#48DC2D" },
        ],
      },
    ],
    'A': [
      {
        vb: { w: 184, h: 160 },
        ops: [
          { type: "sc", cx: 92, cy: 20, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 92, cy: 100, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 68, cy: 60, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 44, cy: 100, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 20, cy: 140, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 116, cy: 60, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 140, cy: 100, r: 12.5, sw: 15, color: "#ACACAC" },
          { type: "sc", cx: 164, cy: 140, r: 12.5, sw: 15, color: "#ACACAC" },
        ],
      },
      {
        vb: { w: 184, h: 160 },
        ops: [
          { type: "fc", cx: 92, cy: 20, r: 20, color: "#0055FF" },
          { type: "fc", cx: 92, cy: 100, r: 20, color: "#0055FF" },
          { type: "fc", cx: 68, cy: 60, r: 20, color: "#0055FF" },
          { type: "fc", cx: 44, cy: 100, r: 20, color: "#0055FF" },
          { type: "fc", cx: 20, cy: 140, r: 20, color: "#0055FF" },
          { type: "fc", cx: 116, cy: 60, r: 20, color: "#0055FF" },
          { type: "fc", cx: 140, cy: 100, r: 20, color: "#0055FF" },
          { type: "fc", cx: 164, cy: 140, r: 20, color: "#0055FF" },
        ],
      },
    ],
    'B': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 130, cy: 45, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140, cy: 140, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140, cy: 90, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 50, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 50, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 80, r: 10, color: "#E32B1A" },
          { type: "sp", d: "M10 10H95C114.33 10 130 25.67 130 45C130 64.33 114.33 80 95 80H10V10Z", sw: 6, cap: "round", color: "black" },
          { type: "sp", d: "M10 80H115C134.33 80 150 95.67 150 115C150 134.33 134.33 150 115 150H10V80Z", sw: 6, cap: "round", color: "black" },
          { type: "fc", cx: 70, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 70, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 45, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 115, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 150, cy: 115, r: 10, color: "#E32B1A" },
        ],
      },
    ],
    'C': [
      {
        vb: { w: 139, h: 160 },
        ops: [
          { type: "fp", d: "M80.1925 160L60.0002 125L100.385 125L80.1925 160Z", color: "#0055FF" },
          { type: "fp", d: "M80.1923 0L100.385 35L60 35L80.1923 0Z", color: "#0055FF" },
          { type: "fp", d: "M40.1447 149.282L40.3257 108.971L75.257 128.971L40.1447 149.282Z", color: "#0055FF" },
          { type: "fp", d: "M120.292 10.7178L120.111 51.0287L85.1795 31.0287L120.292 10.7178Z", color: "#0055FF" },
          { type: "fp", d: "M120.291 149.282L85.1789 128.971L120.11 108.971L120.291 149.282Z", color: "#0055FF" },
          { type: "fp", d: "M40.1453 10.7178L75.2576 31.0287L40.3263 51.0287L40.1453 10.7178Z", color: "#0055FF" },
          { type: "fp", d: "M10.6347 39.9998L50.6106 40.1793L30.7768 74.8203L10.6347 39.9998Z", color: "#0055FF" },
          { type: "fp", d: "M-6.52164e-07 79.9998L34.6667 59.9997L34.6667 99.9998L-6.52164e-07 79.9998Z", color: "#0055FF" },
          { type: "fp", d: "M10.6348 120L30.777 85.1793L50.6108 119.82L10.6348 120Z", color: "#0055FF" },
        ],
      },
      {
        vb: { w: 163, h: 183 },
        ops: [
          { type: "fp", d: "M91.3198 0L112.53300343559643 21.213203435596427L91.3198 42.42640687119285L70.10659656440357 21.213203435596427Z", color: "#DE36E0" },
          { type: "fp", d: "M91.3198 140.21300000000002L112.53300343559643 161.42620343559645L91.3198 182.63940687119288L70.10659656440357 161.42620343559645Z", color: "#DE36E0" },
          { type: "fp", d: "M140.892 20.533699999999996L162.10520343559642 41.74690343559642L140.892 62.96010687119285L119.67879656440357 41.74690343559642Z", color: "#DE36E0" },
          { type: "fp", d: "M41.7471 119.679L62.96030343559643 140.89220343559643L41.7471 162.10540687119286L20.533896564403577 140.89220343559643Z", color: "#DE36E0" },
          { type: "fp", d: "M20.5337 41.7471L41.74690343559642 20.533896564403584L62.96010687119285 41.74710000000002L41.74690343559642 62.96030343559643Z", color: "#DE36E0" },
          { type: "fp", d: "M119.67900000000002 140.892L140.89220343559646 119.67879656440356L162.10540687119288 140.892L140.89220343559646 162.10520343559642Z", color: "#DE36E0" },
          { type: "fp", d: "M0 91.3198L21.213203435596427 70.10659656440357L42.42640687119285 91.3198L21.213203435596427 112.53300343559643Z", color: "#DE36E0" },
        ],
      },
    ],
    'D': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fr", x: 70, y: 0, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 0, y: 0, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 0, y: 140, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 70, y: 140, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 35, y: 140, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 0, y: 105, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 0, y: 35, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 35, y: 0, w: 20, h: 20, color: "#48DC2D" },
          { type: "fp", d: "M160 70L160 90L140 90L140 70Z", color: "#48DC2D" },
          { type: "fp", d: "M20 70L20 90L0 90L0 70Z", color: "#48DC2D" },
          { type: "fp", d: "M144.282 31.339799999999997L154.282 48.66030807568879L136.96149192431125 58.66030807568879L126.96149192431125 41.3398Z", color: "#48DC2D" },
          { type: "fp", d: "M111.34 5.718020000000003L128.66050807568877 15.718019999999996L118.66050807568877 33.038528075688774L101.34 23.038528075688774Z", color: "#48DC2D" },
          { type: "fp", d: "M154.28200000000004 111.34L144.28200000000004 128.66050807568877L126.9614919243113 118.66050807568877L136.96149192431128 101.34Z", color: "#48DC2D" },
          { type: "fp", d: "M128.66000000000003 144.282L111.33949192431126 154.282L101.33949192431126 136.96149192431125L118.66000000000003 126.96149192431125Z", color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 80, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 114.99974999999999, cy: 140.62125, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140.62175000000002, cy: 114.99974999999999, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140.62175000000002, cy: 44.99995, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 114.99974999999999, cy: 19.37825, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 150.000000218557, cy: 79.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000218557, cy: 79.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000218557, cy: 149.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000218557, cy: 9.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 45.000000218557, cy: 9.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 45.000000218557, cy: 149.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000218557, cy: 44.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000218557, cy: 114.999999781443, r: 10, color: "#E32B1A" },
        ],
      },
    ],
    'E': [
      {
        vb: { w: 125, h: 170 },
        ops: [
          { type: "fp", d: "M110 70L111.483 79.4657L117.5 72.0096L114.051 80.9486L122.99 77.5L115.534 83.5171L125 85L115.534 86.4829L122.99 92.5L114.051 89.0514L117.5 97.9904L111.483 90.5343L110 100L108.517 90.5343L102.5 97.9904L105.949 89.0514L97.0096 92.5L104.466 86.4829L95 85L104.466 83.5171L97.0096 77.5L105.949 80.9486L102.5 72.0096L108.517 79.4657L110 70Z", color: "#1CBAEF" },
          { type: "fp", d: "M86 140L87.4829 149.466L93.5 142.01L90.0514 150.949L98.9904 147.5L91.5343 153.517L101 155L91.5343 156.483L98.9904 162.5L90.0514 159.051L93.5 167.99L87.4829 160.534L86 170L84.5171 160.534L78.5 167.99L81.9486 159.051L73.0096 162.5L80.4657 156.483L71 155L80.4657 153.517L73.0096 147.5L81.9486 150.949L78.5 142.01L84.5171 149.466L86 140Z", color: "#1CBAEF" },
          { type: "fp", d: "M39 140L40.4829 149.466L46.5 142.01L43.0514 150.949L51.9904 147.5L44.5343 153.517L54 155L44.5343 156.483L51.9904 162.5L43.0514 159.051L46.5 167.99L40.4829 160.534L39 170L37.5171 160.534L31.5 167.99L34.9486 159.051L26.0096 162.5L33.4657 156.483L24 155L33.4657 153.517L26.0096 147.5L34.9486 150.949L31.5 142.01L37.5171 149.466L39 140Z", color: "#1CBAEF" },
          { type: "fp", d: "M62 70L63.4829 79.4657L69.5 72.0096L66.0514 80.9486L74.9904 77.5L67.5343 83.5171L77 85L67.5343 86.4829L74.9904 92.5L66.0514 89.0514L69.5 97.9904L63.4829 90.5343L62 100L60.5171 90.5343L54.5 97.9904L57.9486 89.0514L49.0096 92.5L56.4657 86.4829L47 85L56.4657 83.5171L49.0096 77.5L57.9486 80.9486L54.5 72.0096L60.5171 79.4657L62 70Z", color: "#1CBAEF" },
          { type: "fp", d: "M15 70L16.4829 79.4657L22.5 72.0096L19.0514 80.9486L27.9904 77.5L20.5343 83.5171L30 85L20.5343 86.4829L27.9904 92.5L19.0514 89.0514L22.5 97.9904L16.4829 90.5343L15 100L13.5171 90.5343L7.5 97.9904L10.9486 89.0514L2.00962 92.5L9.46574 86.4829L0 85L9.46574 83.5171L2.00962 77.5L10.9486 80.9486L7.5 72.0096L13.5171 79.4657L15 70Z", color: "#1CBAEF" },
          { type: "fp", d: "M15 117L16.4829 126.466L22.5 119.01L19.0514 127.949L27.9904 124.5L20.5343 130.517L30 132L20.5343 133.483L27.9904 139.5L19.0514 136.051L22.5 144.99L16.4829 137.534L15 147L13.5171 137.534L7.5 144.99L10.9486 136.051L2.00962 139.5L9.46574 133.483L0 132L9.46574 130.517L2.00962 124.5L10.9486 127.949L7.5 119.01L13.5171 126.466L15 117Z", color: "#1CBAEF" },
          { type: "fp", d: "M124.978 151.118L116.218 155L124.978 158.882L115.451 157.865L121.095 165.607L113.354 159.962L114.371 169.489L110.489 160.73L106.607 169.489L107.624 159.962L99.8823 165.607L105.527 157.865L96 158.882L104.759 155L96 151.118L105.527 152.135L99.8823 144.394L107.624 150.038L106.607 140.511L110.489 149.271L114.371 140.511L113.354 150.038L121.095 144.394L115.451 152.135L124.978 151.118Z", color: "#1CBAEF" },
          { type: "fp", d: "M15 70L16.4829 79.4657L22.5 72.0096L19.0514 80.9486L27.9904 77.5L20.5343 83.5171L30 85L20.5343 86.4829L27.9904 92.5L19.0514 89.0514L22.5 97.9904L16.4829 90.5343L15 100L13.5171 90.5343L7.5 97.9904L10.9486 89.0514L2.00962 92.5L9.46574 86.4829L0 85L9.46574 83.5171L2.00962 77.5L10.9486 80.9486L7.5 72.0096L13.5171 79.4657L15 70Z", color: "#1CBAEF" },
          { type: "fp", d: "M15 23L16.4829 32.4657L22.5 25.0096L19.0514 33.9486L27.9904 30.5L20.5343 36.5171L30 38L20.5343 39.4829L27.9904 45.5L19.0514 42.0514L22.5 50.9904L16.4829 43.5343L15 53L13.5171 43.5343L7.5 50.9904L10.9486 42.0514L2.00962 45.5L9.46574 39.4829L0 38L9.46574 36.5171L2.00962 30.5L10.9486 33.9486L7.5 25.0096L13.5171 32.4657L15 23Z", color: "#1CBAEF" },
          { type: "fp", d: "M76.9778 151.118L68.2184 155L76.9778 158.882L67.4508 157.865L73.0955 165.607L65.3536 159.962L66.3712 169.489L62.4889 160.73L58.6066 169.489L59.6241 159.962L51.8823 165.607L57.527 157.865L48 158.882L56.7594 155L48 151.118L57.527 152.135L51.8823 144.394L59.6241 150.038L58.6066 140.511L62.4889 149.271L66.3712 140.511L65.3536 150.038L73.0955 144.394L67.4508 152.135L76.9778 151.118Z", color: "#1CBAEF" },
          { type: "fp", d: "M99.9778 81.1178L91.2184 85.0001L99.9778 88.8824L90.4508 87.8649L96.0955 95.6067L88.3536 89.962L89.3712 99.489L85.4889 90.7296L81.6066 99.489L82.6241 89.962L74.8823 95.6067L80.527 87.8649L71 88.8824L79.7594 85.0001L71 81.1178L80.527 82.1354L74.8823 74.3935L82.6241 80.0382L81.6066 70.5112L85.4889 79.2706L89.3712 70.5112L88.3536 80.0382L96.0955 74.3935L90.4508 82.1354L99.9778 81.1178Z", color: "#1CBAEF" },
          { type: "fp", d: "M11.1183 140.51L15.0006 149.269L18.8829 140.51L17.8653 150.037L25.6072 144.392L19.9625 152.134L29.4895 151.117L20.7301 154.999L29.4895 158.881L19.9625 157.864L25.6072 165.606L17.8654 159.961L18.8829 169.488L15.0006 160.728L11.1183 169.488L12.1359 159.961L4.394 165.606L10.0387 157.864L0.511719 158.881L9.27112 154.999L0.511718 151.117L10.0387 152.134L4.394 144.392L12.1359 150.037L11.1183 140.51Z", color: "#1CBAEF" },
          { type: "fp", d: "M52.9778 81.1178L44.2184 85.0001L52.9778 88.8824L43.4508 87.8649L49.0955 95.6067L41.3536 89.962L42.3712 99.489L38.4889 90.7296L34.6066 99.489L35.6241 89.962L27.8823 95.6067L33.527 87.8649L24 88.8824L32.7594 85.0001L24 81.1178L33.527 82.1354L27.8823 74.3935L35.6241 80.0382L34.6066 70.5112L38.4889 79.2706L42.3712 70.5112L41.3536 80.0382L49.0955 74.3935L43.4508 82.1354L52.9778 81.1178Z", color: "#1CBAEF" },
          { type: "fp", d: "M11.1183 94L15.0006 102.759L18.8829 94L17.8653 103.527L25.6072 97.8823L19.9625 105.624L29.4895 104.607L20.7301 108.489L29.4895 112.371L19.9625 111.354L25.6072 119.095L17.8654 113.451L18.8829 122.978L15.0006 114.218L11.1183 122.978L12.1359 113.451L4.394 119.095L10.0387 111.354L0.511719 112.371L9.27112 108.489L0.511718 104.607L10.0387 105.624L4.394 97.8823L12.1359 103.527L11.1183 94Z", color: "#1CBAEF" },
          { type: "fp", d: "M11.1183 47L15.0006 55.7594L18.8829 47L17.8653 56.527L25.6072 50.8823L19.9625 58.6241L29.4895 57.6066L20.7301 61.4889L29.4895 65.3712L19.9625 64.3536L25.6072 72.0955L17.8654 66.4508L18.8829 75.9778L15.0006 67.2184L11.1183 75.9778L12.1359 66.4508L4.394 72.0955L10.0387 64.3536L0.511719 65.3712L9.27112 61.4889L0.511718 57.6066L10.0387 58.6242L4.394 50.8823L12.1359 56.527L11.1183 47Z", color: "#1CBAEF" },
          { type: "fp", d: "M86 0L87.4829 9.46574L93.5 2.00962L90.0514 10.9486L98.9904 7.5L91.5343 13.5171L101 15L91.5343 16.4829L98.9904 22.5L90.0514 19.0514L93.5 27.9904L87.4829 20.5343L86 30L84.5171 20.5343L78.5 27.9904L81.9486 19.0514L73.0096 22.5L80.4657 16.4829L71 15L80.4657 13.5171L73.0096 7.5L81.9486 10.9486L78.5 2.00962L84.5171 9.46574L86 0Z", color: "#1CBAEF" },
          { type: "fp", d: "M39 0L40.4829 9.46574L46.5 2.00962L43.0514 10.9486L51.9904 7.5L44.5343 13.5171L54 15L44.5343 16.4829L51.9904 22.5L43.0514 19.0514L46.5 27.9904L40.4829 20.5343L39 30L37.5171 20.5343L31.5 27.9904L34.9486 19.0514L26.0096 22.5L33.4657 16.4829L24 15L33.4657 13.5171L26.0096 7.5L34.9486 10.9486L31.5 2.00962L37.5171 9.46574L39 0Z", color: "#1CBAEF" },
          { type: "fp", d: "M124.978 11.1178L116.218 15.0001L124.978 18.8824L115.451 17.8649L121.095 25.6067L113.354 19.962L114.371 29.489L110.489 20.7296L106.607 29.489L107.624 19.962L99.8823 25.6067L105.527 17.8649L96 18.8824L104.759 15.0001L96 11.1178L105.527 12.1354L99.8823 4.39352L107.624 10.0382L106.607 0.511231L110.489 9.27063L114.371 0.51123L113.354 10.0382L121.095 4.39352L115.451 12.1354L124.978 11.1178Z", color: "#1CBAEF" },
          { type: "fp", d: "M76.9778 11.1178L68.2184 15.0001L76.9778 18.8824L67.4508 17.8649L73.0955 25.6067L65.3536 19.962L66.3712 29.489L62.4889 20.7296L58.6066 29.489L59.6241 19.962L51.8823 25.6067L57.527 17.8649L48 18.8824L56.7594 15.0001L48 11.1178L57.527 12.1354L51.8823 4.39352L59.6241 10.0382L58.6066 0.511231L62.4889 9.27063L66.3712 0.51123L65.3536 10.0382L73.0955 4.39352L67.4508 12.1354L76.9778 11.1178Z", color: "#1CBAEF" },
          { type: "fp", d: "M11.1183 0.510017L15.0006 9.26941L18.8829 0.510017L17.8653 10.037L25.6072 4.3923L19.9625 12.1342L29.4895 11.1166L20.7301 14.9989L29.4895 18.8812L19.9625 17.8636L25.6072 25.6055L17.8654 19.9608L18.8829 29.4878L15.0006 20.7284L11.1183 29.4878L12.1359 19.9608L4.394 25.6055L10.0387 17.8636L0.511719 18.8812L9.27112 14.9989L0.511718 11.1166L10.0387 12.1342L4.394 4.3923L12.1359 10.037L11.1183 0.510017Z", color: "#1CBAEF" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 110, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 70, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 50, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 70, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 50, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fr", x: 0, y: 0, w: 20, h: 20, color: "black" },
          { type: "fr", x: 0, y: 40, w: 20, h: 20, color: "black" },
          { type: "fr", x: 0, y: 80, w: 20, h: 20, color: "black" },
          { type: "fr", x: 20, y: 70, w: 20, h: 20, color: "black" },
          { type: "fr", x: 60, y: 70, w: 20, h: 20, color: "black" },
          { type: "fr", x: 100, y: 70, w: 20, h: 20, color: "black" },
          { type: "fr", x: 0, y: 120, w: 20, h: 20, color: "black" },
          { type: "fr", x: 40, y: 0, w: 20, h: 20, color: "black" },
          { type: "fr", x: 80, y: 0, w: 20, h: 20, color: "black" },
          { type: "fc", cx: 110, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fr", x: 20, y: 140, w: 20, h: 20, color: "black" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fr", x: 60, y: 140, w: 20, h: 20, color: "black" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fr", x: 100, y: 140, w: 20, h: 20, color: "black" },
          { type: "fc", cx: 110, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 90, cy: 80, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 50, cy: 80, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 70, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 30, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 110, cy: 80, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 70, cy: 80, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 30, cy: 80, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 90, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 50, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#F8D01F" },
        ],
      },
    ],
    'F': [
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 110, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 110, cy: 80, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 90, cy: 80, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 80, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 80, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 30, cy: 80, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 110, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 90, cy: 80, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 50, cy: 80, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#DE36E0" },
          { type: "sp", d: "M10 80H110", sw: 8, cap: "round", color: "black" },
          { type: "sp", d: "M110 10H10V150", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 110, cy: 80, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 70, cy: 80, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 30, cy: 80, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#DE36E0" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fr", x: 0, y: 0, w: 20, h: 20, color: "#F8D01F" },
          { type: "fr", x: 0, y: 20, w: 20, h: 20, color: "#E32B1A" },
          { type: "fr", x: 0, y: 40, w: 20, h: 20, color: "#1CBAEF" },
          { type: "fr", x: 0, y: 60, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 0, y: 80, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 20, y: 70, w: 20, h: 20, color: "#E32B1A" },
          { type: "fr", x: 40, y: 70, w: 20, h: 20, color: "#1CBAEF" },
          { type: "fr", x: 60, y: 70, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 80, y: 70, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 100, y: 70, w: 20, h: 20, color: "#F8D01F" },
          { type: "fr", x: 0, y: 100, w: 20, h: 20, color: "#F8D01F" },
          { type: "fr", x: 0, y: 120, w: 20, h: 20, color: "#E32B1A" },
          { type: "fr", x: 0, y: 140, w: 20, h: 20, color: "#1CBAEF" },
          { type: "fr", x: 20, y: 0, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 40, y: 0, w: 20, h: 20, color: "#48DC2D" },
          { type: "fr", x: 60, y: 0, w: 20, h: 20, color: "#1CBAEF" },
          { type: "fr", x: 80, y: 0, w: 20, h: 20, color: "#E32B1A" },
          { type: "fr", x: 100, y: 0, w: 20, h: 20, color: "#F8D01F" },
        ],
      },
    ],
    'G': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 80, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 98, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 116, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 133, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 98.11755, cy: 12.38528, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 61.882450000000006, cy: 147.61507, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 61.88303, cy: 12.385145000000001, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 98.11693, cy: 147.61444999999998, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30.502, cy: 30.50254, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 129.497, cy: 129.49714, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 12.38455, cy: 61.88245, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 147.61407, cy: 98.11755, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 12.385145000000001, cy: 98.11697000000001, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 19.37802, cy: 114.99925, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30.501540000000002, cy: 129.497, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 129.49614, cy: 30.5029, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 114.99974999999999, cy: 19.37825, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 44.99995, cy: 140.62125, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 44.99995, cy: 19.37827, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 114.99974999999999, cy: 140.62125, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 19.37805, cy: 45.00005, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140.62125, cy: 115.00025000000001, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000326082, cy: 79.999999673918, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 150.000000326082, cy: 79.999999673918, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 19.37802, cy: 115.00025000000001, r: 10, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fr", x: 70, y: 0, w: 20, h: 20, color: "#F8D01F" },
          { type: "fr", x: 70, y: 140, w: 20, h: 20, color: "#F8D01F" },
          { type: "fp", d: "M111.34 5.718020000000003L128.66050807568877 15.718019999999996L118.66050807568877 33.038528075688774L101.34 23.038528075688774Z", color: "#F8D01F" },
          { type: "fp", d: "M41.33979999999999 126.961L58.66030807568877 136.961L48.66030807568877 154.2815080756888L31.33979999999999 144.2815080756888Z", color: "#F8D01F" },
          { type: "fp", d: "M31.339800000000004 15.718L48.660308075688775 5.7180000000000035L58.66030807568877 23.03850807568878L41.339800000000004 33.03850807568878Z", color: "#F8D01F" },
          { type: "fp", d: "M101.34 136.961L118.6605080756888 126.96100000000001L128.6605080756888 144.2815080756888L111.34 154.2815080756888Z", color: "#F8D01F" },
          { type: "fp", d: "M5.717770000000002 48.66040000000001L15.717770000000002 31.33989192431123L33.03827807568878 41.33989192431123L23.03827807568878 58.66040000000001Z", color: "#F8D01F" },
          { type: "fp", d: "M126.96200000000002 118.65999999999998L136.962 101.33949192431123L154.28250807568878 111.33949192431123L144.28250807568878 128.65999999999997Z", color: "#F8D01F" },
          { type: "fp", d: "M0 90L0 70L20 70L20 90Z", color: "#F8D01F" },
          { type: "fp", d: "M140 90L140 70L160 70L160 90Z", color: "#F8D01F" },
          { type: "fp", d: "M70 90L70 70L90 70L90 90Z", color: "#F8D01F" },
          { type: "fp", d: "M105 90L105.00000000000001 70L125.00000000000001 70L125 90Z", color: "#F8D01F" },
          { type: "fp", d: "M15.718800000000002 128.66L5.718800000000002 111.33949192431123L23.039308075688766 101.33949192431123L33.039308075688766 118.66Z", color: "#F8D01F" },
        ],
      },
      {
        vb: { w: 170, h: 170 },
        ops: [
          { type: "fp", d: "M85 0L89.0514 10.9486L100 15L89.0514 19.0514L85 30L80.9486 19.0514L70 15L80.9486 10.9486L85 0Z", color: "#1CBAEF" },
          { type: "fp", d: "M85 70L89.0514 80.9486L100 85L89.0514 89.0514L85 100L80.9486 89.0514L70 85L80.9486 80.9486L85 70Z", color: "#1CBAEF" },
          { type: "fp", d: "M120 70L124.051 80.9486L135 85L124.051 89.0514L120 100L115.949 89.0514L105 85L115.949 80.9486L120 70Z", color: "#1CBAEF" },
          { type: "fp", d: "M85 140L89.0514 150.949L100 155L89.0514 159.051L85 170L80.9486 159.051L70 155L80.9486 150.949L85 140Z", color: "#1CBAEF" },
          { type: "fp", d: "M170 85L159.051 89.0514L155 100L150.949 89.0514L140 85L150.949 80.9486L155 70L159.051 80.9486L170 85Z", color: "#1CBAEF" },
          { type: "fp", d: "M30 85L19.0514 89.0514L15 100L10.9486 89.0514L-6.55671e-07 85L10.9486 80.9486L15 70L19.0514 80.9486L30 85Z", color: "#1CBAEF" },
          { type: "fp", d: "M42.5001 11.3879L51.483 18.8441L62.9905 16.8783L55.5344 25.8612L57.5001 37.3687L48.5172 29.9126L37.0098 31.8783L44.4659 22.8954L42.5001 11.3879Z", color: "#1CBAEF" },
          { type: "fp", d: "M112.5 132.631L121.483 140.087L132.991 138.122L125.534 147.105L127.5 158.612L118.517 151.156L107.01 153.122L114.466 144.139L112.5 132.631Z", color: "#1CBAEF" },
          { type: "fp", d: "M37.3682 112.5L29.912 121.483L31.8778 132.99L22.8949 125.534L11.3874 127.5L18.8435 118.517L16.8778 107.01L25.8607 114.466L37.3682 112.5Z", color: "#1CBAEF" },
          { type: "fp", d: "M11.3877 42.5001L22.8952 44.4658L31.8781 37.0097L29.9123 48.5172L37.3685 57.5001L25.861 55.5344L16.8781 62.9905L18.8438 51.483L11.3877 42.5001Z", color: "#1CBAEF" },
          { type: "fp", d: "M132.632 112.5L144.139 114.466L153.122 107.009L151.156 118.517L158.613 127.5L147.105 125.534L138.122 132.99L140.088 121.483L132.632 112.5Z", color: "#1CBAEF" },
          { type: "fp", d: "M127.5 11.3877L125.534 22.8952L132.991 31.8781L121.483 29.9123L112.5 37.3685L114.466 25.861L107.01 16.8781L118.517 18.8438L127.5 11.3877Z", color: "#1CBAEF" },
          { type: "fp", d: "M57.5001 132.631L55.5344 144.139L62.9905 153.122L51.483 151.156L42.5001 158.612L44.4659 147.105L37.0098 138.122L48.5172 140.087L57.5001 132.631Z", color: "#1CBAEF" },
        ],
      },
      {
        vb: { w: 170, h: 170 },
        ops: [
          { type: "fp", d: "M85 0L85.8238 4.53237L87.3465 0.184675L87.4512 4.79012L89.6353 0.734152L89.0182 5.29926L91.8099 1.6349L90.4862 6.04728L93.8168 2.86475L91.8192 7.01574L95.6066 4.3934L92.9843 8.1808L97.1353 6.18322L93.9527 9.51377L98.3651 8.19014L94.7007 10.9818L99.2658 10.3647L95.2099 12.5488L99.8153 12.6535L95.4676 14.1762L100 15L95.4676 15.8238L99.8153 17.3465L95.2099 17.4512L99.2658 19.6353L94.7007 19.0182L98.3651 21.8099L93.9527 20.4862L97.1353 23.8168L92.9843 21.8192L95.6066 25.6066L91.8192 22.9843L93.8168 27.1353L90.4862 23.9527L91.8099 28.3651L89.0182 24.7007L89.6353 29.2658L87.4512 25.2099L87.3465 29.8153L85.8238 25.4676L85 30L84.1762 25.4676L82.6535 29.8153L82.5488 25.2099L80.3647 29.2658L80.9818 24.7007L78.1901 28.3651L79.5138 23.9527L76.1832 27.1353L78.1808 22.9843L74.3934 25.6066L77.0157 21.8192L72.8647 23.8168L76.0473 20.4862L71.6349 21.8099L75.2993 19.0182L70.7342 19.6353L74.7901 17.4512L70.1847 17.3465L74.5324 15.8238L70 15L74.5324 14.1762L70.1847 12.6535L74.7901 12.5488L70.7342 10.3647L75.2993 10.9818L71.6349 8.19014L76.0473 9.51377L72.8647 6.18322L77.0157 8.1808L74.3934 4.3934L78.1808 7.01574L76.1832 2.86475L79.5138 6.04728L78.1901 1.6349L80.9818 5.29926L80.3647 0.734152L82.5488 4.79012L82.6535 0.184675L84.1762 4.53237L85 0Z", color: "#5F1CEF" },
          { type: "fp", d: "M85 140L85.8238 144.532L87.3465 140.185L87.4512 144.79L89.6353 140.734L89.0182 145.299L91.8099 141.635L90.4862 146.047L93.8168 142.865L91.8192 147.016L95.6066 144.393L92.9843 148.181L97.1353 146.183L93.9527 149.514L98.3651 148.19L94.7007 150.982L99.2658 150.365L95.2099 152.549L99.8153 152.653L95.4676 154.176L100 155L95.4676 155.824L99.8153 157.347L95.2099 157.451L99.2658 159.635L94.7007 159.018L98.3651 161.81L93.9527 160.486L97.1353 163.817L92.9843 161.819L95.6066 165.607L91.8192 162.984L93.8168 167.135L90.4862 163.953L91.8099 168.365L89.0182 164.701L89.6353 169.266L87.4512 165.21L87.3465 169.815L85.8238 165.468L85 170L84.1762 165.468L82.6535 169.815L82.5488 165.21L80.3647 169.266L80.9818 164.701L78.1901 168.365L79.5138 163.953L76.1832 167.135L78.1808 162.984L74.3934 165.607L77.0157 161.819L72.8647 163.817L76.0473 160.486L71.6349 161.81L75.2993 159.018L70.7342 159.635L74.7901 157.451L70.1847 157.347L74.5324 155.824L70 155L74.5324 154.176L70.1847 152.653L74.7901 152.549L70.7342 150.365L75.2993 150.982L71.6349 148.19L76.0473 149.514L72.8647 146.183L77.0157 148.181L74.3934 144.393L78.1808 147.016L76.1832 142.865L79.5138 146.047L78.1901 141.635L80.9818 145.299L80.3647 140.734L82.5488 144.79L82.6535 140.185L84.1762 144.532L85 140Z", color: "#5F1CEF" },
          { type: "fp", d: "M127.5 11.3879L125.947 15.725L129.44 12.7211L127.228 16.7619L131.147 14.3414L128.33 17.9863L132.58 16.2087L129.228 19.3682L133.703 18.2773L129.898 20.8733L134.489 20.496L130.324 22.4648L134.918 22.8104L130.497 24.1035L134.98 25.1634L130.41 25.7488L134.672 27.497L130.068 27.3605L134.004 29.7538L129.477 28.8987L132.991 31.8783L128.653 30.3256L131.657 33.8181L127.617 31.606L130.037 35.5255L126.392 32.7085L128.17 36.9584L125.01 33.6059L126.101 38.0815L123.505 34.2761L123.882 38.8672L121.914 34.7025L121.568 39.2961L120.275 34.8747L119.215 39.3578L118.63 34.7885L116.881 39.0505L117.018 34.4459L114.625 38.382L115.48 33.8555L112.5 37.3687L114.053 33.0316L110.56 36.0355L112.772 31.9948L108.853 34.4153L111.67 30.7703L107.42 32.5479L110.773 29.3885L106.297 30.4794L110.102 27.8833L105.511 28.2606L109.676 26.2918L105.082 25.9462L109.504 24.6532L105.021 23.5933L109.59 23.0078L105.328 21.2596L109.933 21.3962L105.996 19.0028L110.523 19.858L107.01 16.8783L111.347 18.4311L108.343 14.9385L112.384 17.1506L109.963 13.2311L113.608 16.0481L111.831 11.7983L114.99 15.1507L113.899 10.6751L116.495 14.4806L116.118 9.88943L118.087 14.0541L118.432 9.46049L119.725 13.8819L120.785 9.39888L121.371 13.9681L123.119 9.70611L122.982 14.3107L125.376 10.3746L124.521 14.9012L127.5 11.3879Z", color: "#5F1CEF" },
          { type: "fp", d: "M57.5001 132.631L55.9474 136.968L59.44 133.965L57.2279 138.005L61.1473 135.585L58.3304 139.23L62.5802 137.452L59.2277 140.612L63.7033 139.521L59.8979 142.117L64.489 141.739L60.3243 143.708L64.918 144.054L60.4965 145.347L64.9796 146.407L60.4103 146.992L64.6724 148.74L60.0678 148.604L64.0039 150.997L59.4773 150.142L62.9905 153.122L58.6535 151.569L61.6573 155.062L57.6166 152.849L60.0371 156.769L56.3921 153.952L58.1697 158.202L55.0103 154.849L56.1012 159.325L53.5051 155.519L53.8824 160.111L51.9136 155.946L51.5681 160.54L50.275 156.118L49.2151 160.601L48.6296 156.032L46.8815 160.294L47.018 155.689L44.6246 159.625L45.4798 155.099L42.5001 158.612L44.0529 154.275L40.5603 157.279L42.7724 153.238L38.853 155.659L41.6699 152.014L37.4201 153.791L40.7726 150.632L36.297 151.723L40.1024 149.127L35.5113 149.504L39.676 147.535L35.0823 147.19L39.5037 145.897L35.0207 144.837L39.59 144.251L35.3279 142.503L39.9325 142.64L35.9964 140.246L40.523 141.101L37.0098 138.122L41.3468 139.674L38.343 136.182L42.3837 138.394L39.9632 134.475L43.6082 137.292L41.8306 133.042L44.99 136.394L43.8991 131.919L46.4952 135.724L46.1179 131.133L48.0867 135.298L48.4322 130.704L49.7253 135.125L50.7852 130.642L51.3707 135.212L53.1188 130.95L52.9823 135.554L55.3757 131.618L54.5205 136.145L57.5001 132.631Z", color: "#5F1CEF" },
          { type: "fp", d: "M37.3691 112.5L33.8559 115.48L38.3825 114.624L34.4464 117.018L39.051 116.881L34.7889 118.629L39.3582 119.215L34.8752 120.275L39.2966 121.568L34.7029 121.913L38.8676 123.882L34.2765 123.505L38.0819 126.101L33.6063 125.01L36.9588 128.169L32.709 126.392L35.5259 130.037L31.6065 127.616L33.8186 131.657L30.326 128.653L31.8788 132.99L28.8991 129.477L29.7543 134.004L27.3609 130.068L27.4974 134.672L25.7493 130.41L25.1638 134.979L24.1039 130.496L22.8108 134.918L22.4653 130.324L20.4965 134.489L20.8738 129.898L18.2777 133.703L19.3686 129.227L16.2092 132.58L17.9868 128.33L14.3418 131.147L16.7623 127.228L12.7216 129.44L15.7254 125.947L11.3884 127.5L14.9016 124.52L10.3751 125.375L14.3112 122.982L9.70655 123.119L13.9686 121.37L9.39932 120.785L13.8824 119.725L9.46093 118.432L14.0546 118.086L9.88987 116.118L14.481 116.495L10.6756 113.899L15.1512 114.99L11.7987 111.83L16.0485 113.608L13.2316 109.963L17.151 112.383L14.939 108.343L18.4315 111.347L16.8788 107.01L19.8584 110.523L19.0032 105.996L21.3966 109.932L21.2601 105.328L23.0082 109.59L23.5937 105.02L24.6536 109.504L25.9467 105.082L26.2922 109.676L28.261 105.511L27.8837 110.102L30.4798 106.297L29.3889 110.772L32.5483 107.42L30.7708 111.67L34.4157 108.853L31.9952 112.772L36.0359 110.56L33.0321 114.053L37.3691 112.5Z", color: "#5F1CEF" },
          { type: "fp", d: "M170 85.0002L165.468 85.8241L169.815 87.3468L165.21 87.4514L169.266 89.6355L164.701 89.0184L168.365 91.8101L163.953 90.4865L167.135 93.817L162.984 91.8194L165.607 95.6068L161.819 92.9845L163.817 97.1355L160.486 93.953L161.81 98.3653L159.018 94.701L159.635 99.2661L157.451 95.2101L157.347 99.8156L155.824 95.4679L155 100L154.176 95.4679L152.653 99.8156L152.549 95.2101L150.365 99.2661L150.982 94.701L148.19 98.3653L149.514 93.953L146.183 97.1355L148.181 92.9845L144.393 95.6068L147.016 91.8194L142.865 93.817L146.047 90.4865L141.635 91.8101L145.299 89.0184L140.734 89.6355L144.79 87.4514L140.185 87.3468L144.532 85.8241L140 85.0002L144.532 84.1764L140.185 82.6537L144.79 82.5491L140.734 80.365L145.299 80.9821L141.635 78.1904L146.047 79.514L142.865 76.1835L147.016 78.181L144.393 74.3936L148.181 77.016L146.183 72.865L149.514 76.0475L148.19 71.6351L150.982 75.2995L150.365 70.7344L152.549 74.7904L152.653 70.1849L154.176 74.5326L155 70.0002L155.824 74.5326L157.347 70.1849L157.451 74.7904L159.635 70.7344L159.018 75.2995L161.81 71.6351L160.486 76.0475L163.817 72.865L161.819 77.016L165.607 74.3936L162.984 78.181L167.135 76.1835L163.953 79.514L168.365 78.1904L164.701 80.9821L169.266 80.365L165.21 82.5491L169.815 82.6537L165.468 84.1764L170 85.0002Z", color: "#5F1CEF" },
          { type: "fp", d: "M100 85.0002L95.4676 85.8241L99.8153 87.3468L95.2099 87.4514L99.2658 89.6355L94.7007 89.0184L98.3651 91.8101L93.9527 90.4865L97.1353 93.817L92.9843 91.8194L95.6066 95.6068L91.8192 92.9845L93.8168 97.1355L90.4862 93.953L91.8099 98.3653L89.0182 94.701L89.6353 99.2661L87.4512 95.2101L87.3465 99.8156L85.8238 95.4679L85 100L84.1762 95.4679L82.6535 99.8156L82.5488 95.2101L80.3647 99.2661L80.9818 94.701L78.1901 98.3653L79.5138 93.953L76.1832 97.1355L78.1808 92.9845L74.3934 95.6068L77.0157 91.8194L72.8647 93.817L76.0473 90.4865L71.6349 91.8101L75.2993 89.0184L70.7342 89.6355L74.7901 87.4514L70.1847 87.3468L74.5324 85.8241L70 85.0002L74.5324 84.1764L70.1847 82.6537L74.7901 82.5491L70.7342 80.365L75.2993 80.9821L71.6349 78.1904L76.0473 79.514L72.8647 76.1835L77.0157 78.181L74.3934 74.3936L78.1808 77.016L76.1832 72.865L79.5138 76.0475L78.1901 71.6351L80.9818 75.2995L80.3647 70.7344L82.5488 74.7904L82.6535 70.1849L84.1762 74.5326L85 70.0002L85.8238 74.5326L87.3465 70.1849L87.4512 74.7904L89.6353 70.7344L89.0182 75.2995L91.8099 71.6351L90.4862 76.0475L93.8168 72.865L91.8192 77.016L95.6066 74.3936L92.9843 78.181L97.1353 76.1835L93.9527 79.514L98.3651 78.1904L94.7007 80.9821L99.2658 80.365L95.2099 82.5491L99.8153 82.6537L95.4676 84.1764L100 85.0002Z", color: "#5F1CEF" },
          { type: "fp", d: "M135 85.0002L130.468 85.8241L134.815 87.3468L130.21 87.4514L134.266 89.6355L129.701 89.0184L133.365 91.8101L128.953 90.4865L132.135 93.817L127.984 91.8194L130.607 95.6068L126.819 92.9845L128.817 97.1355L125.486 93.953L126.81 98.3653L124.018 94.701L124.635 99.2661L122.451 95.2101L122.347 99.8156L120.824 95.4679L120 100L119.176 95.4679L117.653 99.8156L117.549 95.2101L115.365 99.2661L115.982 94.701L113.19 98.3653L114.514 93.953L111.183 97.1355L113.181 92.9845L109.393 95.6068L112.016 91.8194L107.865 93.817L111.047 90.4865L106.635 91.8101L110.299 89.0184L105.734 89.6355L109.79 87.4514L105.185 87.3468L109.532 85.8241L105 85.0002L109.532 84.1764L105.185 82.6537L109.79 82.5491L105.734 80.365L110.299 80.9821L106.635 78.1904L111.047 79.514L107.865 76.1835L112.016 78.181L109.393 74.3936L113.181 77.016L111.183 72.865L114.514 76.0475L113.19 71.6351L115.982 75.2995L115.365 70.7344L117.549 74.7904L117.653 70.1849L119.176 74.5326L120 70.0002L120.824 74.5326L122.347 70.1849L122.451 74.7904L124.635 70.7344L124.018 75.2995L126.81 71.6351L125.486 76.0475L128.817 72.865L126.819 77.016L130.607 74.3936L127.984 78.181L132.135 76.1835L128.953 79.514L133.365 78.1904L129.701 80.9821L134.266 80.365L130.21 82.5491L134.815 82.6537L130.468 84.1764L135 85.0002Z", color: "#5F1CEF" },
          { type: "fp", d: "M30 85L25.4676 85.8238L29.8153 87.3465L25.2099 87.4512L29.2658 89.6353L24.7007 89.0182L28.3651 91.8099L23.9527 90.4862L27.1353 93.8168L22.9843 91.8192L25.6066 95.6066L21.8192 92.9843L23.8168 97.1353L20.4862 93.9527L21.8099 98.3651L19.0182 94.7007L19.6353 99.2658L17.4512 95.2099L17.3465 99.8153L15.8238 95.4676L15 100L14.1762 95.4676L12.6535 99.8153L12.5488 95.2099L10.3647 99.2658L10.9818 94.7007L8.19014 98.3651L9.51376 93.9527L6.18322 97.1353L8.18079 92.9843L4.3934 95.6066L7.01574 91.8192L2.86475 93.8168L6.04728 90.4862L1.6349 91.8099L5.29926 89.0182L0.734151 89.6353L4.79011 87.4512L0.184675 87.3465L4.53237 85.8238L-4.89123e-07 85L4.53237 84.1762L0.184675 82.6535L4.79011 82.5488L0.734152 80.3647L5.29926 80.9818L1.6349 78.1901L6.04728 79.5138L2.86475 76.1832L7.01574 78.1808L4.3934 74.3934L8.1808 77.0157L6.18322 72.8647L9.51377 76.0473L8.19014 71.6349L10.9818 75.2993L10.3647 70.7342L12.5488 74.7901L12.6535 70.1847L14.1762 74.5324L15 70L15.8238 74.5324L17.3465 70.1847L17.4512 74.7901L19.6353 70.7342L19.0182 75.2993L21.8099 71.6349L20.4862 76.0473L23.8168 72.8647L21.8192 77.0157L25.6066 74.3934L22.9843 78.1808L27.1353 76.1832L23.9527 79.5138L28.3651 78.1901L24.7007 80.9818L29.2658 80.3647L25.2099 82.5488L29.8153 82.6535L25.4676 84.1762L30 85Z", color: "#5F1CEF" },
          { type: "fp", d: "M158.612 127.5L154.275 125.948L157.279 129.44L153.238 127.228L155.659 131.147L152.014 128.33L153.792 132.58L150.632 129.228L151.723 133.703L149.127 129.898L149.504 134.489L147.535 130.324L147.19 134.918L145.897 130.497L144.837 134.98L144.251 130.41L142.503 134.672L142.64 130.068L140.246 134.004L141.102 129.477L138.122 132.991L139.675 128.654L136.182 131.657L138.394 127.617L134.475 130.037L137.292 126.392L133.042 128.17L136.394 125.01L131.919 126.101L135.724 123.505L131.133 123.883L135.298 121.914L130.704 121.568L135.126 120.275L130.642 119.215L135.212 118.63L130.95 116.882L135.554 117.018L131.618 114.625L136.145 115.48L132.632 112.5L136.969 114.053L133.965 110.56L138.005 112.773L135.585 108.853L139.23 111.67L137.452 107.42L140.612 110.773L139.521 106.297L142.117 110.103L141.74 105.511L143.708 109.676L144.054 105.082L145.347 109.504L146.407 105.021L146.992 109.59L148.741 105.328L148.604 109.933L150.997 105.997L150.142 110.523L153.122 107.01L151.569 111.347L155.062 108.343L152.85 112.384L156.769 109.963L153.952 113.608L158.202 111.831L154.85 114.99L159.325 113.899L155.52 116.495L160.111 116.118L155.946 118.087L160.54 118.432L156.118 119.725L160.601 120.785L156.032 121.371L160.294 123.119L155.69 122.982L159.626 125.376L155.099 124.521L158.612 127.5Z", color: "#5F1CEF" },
          { type: "fp", d: "M37.3691 57.4999L33.0321 55.9472L36.0359 59.4397L31.9952 57.2276L34.4157 61.1471L30.7708 58.3301L32.5483 62.58L29.3889 59.2275L30.4798 63.7031L27.8837 59.8976L28.261 64.4888L26.2922 60.3241L25.9467 64.9177L24.6536 60.4963L23.5937 64.9793L23.0082 60.4101L21.2601 64.6721L21.3966 60.0675L19.0032 64.0036L19.8584 59.477L16.8788 62.9903L18.4315 58.6532L14.939 61.6571L17.151 57.6163L13.2316 60.0369L16.0485 56.3919L11.7987 58.1695L15.1512 55.0101L10.6756 56.1009L14.481 53.5049L9.88987 53.8822L14.0546 51.9134L9.46093 51.5678L13.8824 50.2748L9.39932 49.2149L13.9686 48.6294L9.70654 46.8812L14.3112 47.0177L10.3751 44.6244L14.9016 45.4795L11.3884 42.4999L15.7254 44.0526L12.7216 40.5601L16.7623 42.7722L14.3418 38.8527L17.9868 41.6697L16.2092 37.4198L19.3686 40.7723L18.2777 36.2967L20.8738 40.1022L20.4965 35.511L22.4653 39.6757L22.8108 35.0821L24.1039 39.5035L25.1638 35.0205L25.7493 39.5897L27.4974 35.3277L27.3609 39.9323L29.7543 35.9962L28.8991 40.5228L31.8788 37.0095L30.326 41.3466L33.8186 38.3427L31.6065 42.3835L35.5259 39.9629L32.709 43.6079L36.9588 41.8303L33.6063 44.9897L38.0819 43.8989L34.2765 46.4949L38.8676 46.1176L34.7029 48.0864L39.2966 48.432L34.8752 49.725L39.3582 50.7849L34.7889 51.3704L39.051 53.1186L34.4464 52.9821L38.3825 55.3754L33.8559 54.5203L37.3691 57.4999Z", color: "#5F1CEF" },
          { type: "fp", d: "M127.5 158.612L124.52 155.099L125.375 159.626L122.982 155.69L123.119 160.294L121.37 156.032L120.785 160.601L119.725 156.118L118.432 160.54L118.086 155.946L116.118 160.111L116.495 155.52L113.899 159.325L114.99 154.85L111.83 158.202L113.608 153.952L109.963 156.769L112.383 152.85L108.343 155.062L111.347 151.569L107.009 153.122L110.523 150.142L105.996 150.997L109.932 148.604L105.328 148.741L109.59 146.992L105.02 146.407L109.503 145.347L105.082 144.054L109.676 143.708L105.511 141.74L110.102 142.117L106.297 139.521L110.772 140.612L107.42 137.452L111.67 139.23L108.853 135.585L112.772 138.005L110.56 133.965L114.053 136.969L112.5 132.632L115.479 136.145L114.624 131.618L117.018 135.554L116.881 130.95L118.629 135.212L119.215 130.642L120.275 135.126L121.568 130.704L121.913 135.298L123.882 131.133L123.505 135.724L126.101 131.919L125.01 136.394L128.169 133.042L126.392 137.292L130.037 134.475L127.616 138.394L131.657 136.182L128.653 139.675L132.99 138.122L129.477 141.102L134.004 140.246L130.067 142.64L134.672 142.503L130.41 144.251L134.979 144.837L130.496 145.897L134.918 147.19L130.324 147.535L134.489 149.504L129.898 149.127L133.703 151.723L129.227 150.632L132.58 153.792L128.33 152.014L131.147 155.659L127.228 153.238L129.44 157.279L125.947 154.275L127.5 158.612Z", color: "#5F1CEF" },
          { type: "fp", d: "M57.4999 37.3684L54.5202 33.8552L55.3754 38.3817L52.982 34.4456L53.1185 39.0502L51.3704 34.7882L50.7849 39.3575L49.725 34.8744L48.4319 39.2959L48.0864 34.7022L46.1176 38.8669L46.4949 34.2758L43.8988 38.0812L44.9897 33.6056L41.8303 36.9581L43.6079 32.7082L39.9629 35.5252L42.3834 31.6057L38.3427 33.8178L41.3465 30.3253L37.0095 31.878L40.5227 28.8984L35.9961 29.7535L39.9322 27.3602L35.3276 27.4967L39.5897 25.7485L35.0204 25.1631L39.5035 24.1032L35.082 22.8101L39.6757 22.4646L35.511 20.4957L40.1021 20.8731L36.2967 18.277L40.7723 19.3679L37.4198 16.2084L41.6696 17.986L38.8527 14.3411L42.7721 16.7616L40.56 12.7208L44.0526 15.7247L42.4999 11.3876L45.4795 14.9009L44.6243 10.3743L47.0177 14.3104L46.8812 9.70581L48.6293 13.9679L49.2148 9.39858L50.2747 13.8816L51.5678 9.4602L51.9133 14.0538L53.8821 9.88914L53.5048 14.4803L56.1009 10.6748L55.01 15.1504L58.1694 11.798L56.3918 16.0478L60.0368 13.2309L57.6163 17.1503L61.657 14.9382L58.6532 18.4308L62.9902 16.878L59.477 19.8577L64.0036 19.0025L60.0675 21.3959L64.6721 21.2594L60.41 23.0075L64.9793 23.593L60.4963 24.6529L64.9177 25.946L60.324 26.2915L64.4887 28.2603L59.8976 27.883L63.703 30.4791L59.2274 29.3882L62.5799 32.5476L58.3301 30.77L61.147 34.415L57.2276 31.9945L59.4397 36.0352L55.9471 33.0314L57.4999 37.3684Z", color: "#5F1CEF" },
        ],
      },
    ],
    'H': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 20, cy: 20, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 20, cy: 60, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 100, cy: 80, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 60, cy: 80, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 20, cy: 100, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 20, cy: 140, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 140, cy: 20, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 140, cy: 60, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 140, cy: 100, r: 12.5, sw: 15, color: "#DE36E0" },
          { type: "sc", cx: 140, cy: 140, r: 12.5, sw: 15, color: "#DE36E0" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M150.00000000000003 119.99999999999999L130.00000000000003 119.99999999999999L130.00000000000003 99.99999999999997L150.00000000000003 99.99999999999997Z", color: "#0055FF" },
          { type: "fp", d: "M150.00000000000003 159.99999999999997L130.00000000000003 159.99999999999997L130.00000000000003 139.99999999999997L150.00000000000003 139.99999999999997Z", color: "#0055FF" },
          { type: "fr", x: 10, y: 40, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 10, y: 0, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M70.00000000000001 89.99999999999999L50.000000000000014 89.99999999999999L50.000000000000014 69.99999999999999L70.00000000000001 69.99999999999999Z", color: "#0055FF" },
          { type: "fp", d: "M110.00000000000001 89.99999999999999L90 89.99999999999999L90 69.99999999999999L110.00000000000001 69.99999999999999Z", color: "#0055FF" },
          { type: "fc", cx: 140.000000218557, cy: 89.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 40.000000218557, cy: 79.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80.000000218557, cy: 79.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 120.000000218557, cy: 79.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 20.000000218557, cy: 29.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 20.000000218557, cy: 69.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140.000000218557, cy: 129.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 20.000000218557, cy: 149.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 20.000000218557, cy: 109.999999781443, r: 10, color: "#E32B1A" },
          { type: "fr", x: 10, y: 120, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 10, y: 80, w: 20, h: 20, color: "#0055FF" },
          { type: "fc", cx: 139.99999890722, cy: 10.00000109278, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 139.99999890722, cy: 50.000001092779996, r: 10, color: "#E32B1A" },
          { type: "fp", d: "M150 40.00000000000001L130 40.00000000000001L130 20.000000000000007L150 20.000000000000007Z", color: "#0055FF" },
          { type: "fp", d: "M150 79.99999999999999L130 79.99999999999999L130 59.999999999999986L150 59.999999999999986Z", color: "#0055FF" },
        ],
      },
    ],
    'I': [
      {
        vb: { w: 100, h: 160 },
        ops: [
          { type: "fp", d: "M50 0L52.9389 5.95492L59.5106 6.90983L54.7553 11.5451L55.8779 18.0902L50 15L44.1221 18.0902L45.2447 11.5451L40.4894 6.90983L47.0611 5.95492L50 0Z", color: "#F0850B" },
          { type: "fp", d: "M50 60L52.9389 65.9549L59.5106 66.9098L54.7553 71.5451L55.8779 78.0902L50 75L44.1221 78.0902L45.2447 71.5451L40.4894 66.9098L47.0611 65.9549L50 60Z", color: "#F0850B" },
          { type: "fp", d: "M50 80L52.9389 85.9549L59.5106 86.9098L54.7553 91.5451L55.8779 98.0902L50 95L44.1221 98.0902L45.2447 91.5451L40.4894 86.9098L47.0611 85.9549L50 80Z", color: "#F0850B" },
          { type: "fp", d: "M50 100L52.9389 105.955L59.5106 106.91L54.7553 111.545L55.8779 118.09L50 115L44.1221 118.09L45.2447 111.545L40.4894 106.91L47.0611 105.955L50 100Z", color: "#F0850B" },
          { type: "fp", d: "M50 120L52.9389 125.955L59.5106 126.91L54.7553 131.545L55.8779 138.09L50 135L44.1221 138.09L45.2447 131.545L40.4894 126.91L47.0611 125.955L50 120Z", color: "#F0850B" },
          { type: "fp", d: "M50 140L52.9389 145.955L59.5106 146.91L54.7553 151.545L55.8779 158.09L50 155L44.1221 158.09L45.2447 151.545L40.4894 146.91L47.0611 145.955L50 140Z", color: "#F0850B" },
          { type: "fp", d: "M70 140L72.9389 145.955L79.5106 146.91L74.7553 151.545L75.8779 158.09L70 155L64.1221 158.09L65.2447 151.545L60.4894 146.91L67.0611 145.955L70 140Z", color: "#F0850B" },
          { type: "fp", d: "M90 140L92.9389 145.955L99.5106 146.91L94.7553 151.545L95.8779 158.09L90 155L84.1221 158.09L85.2447 151.545L80.4894 146.91L87.0611 145.955L90 140Z", color: "#F0850B" },
          { type: "fp", d: "M90 0L92.9389 5.95492L99.5106 6.90983L94.7553 11.5451L95.8779 18.0902L90 15L84.1221 18.0902L85.2447 11.5451L80.4894 6.90983L87.0611 5.95492L90 0Z", color: "#F0850B" },
          { type: "fp", d: "M10 140L12.9389 145.955L19.5106 146.91L14.7553 151.545L15.8779 158.09L10 155L4.12215 158.09L5.24472 151.545L0.489435 146.91L7.06107 145.955L10 140Z", color: "#F0850B" },
          { type: "fp", d: "M10 0L12.9389 5.95492L19.5106 6.90983L14.7553 11.5451L15.8779 18.0902L10 15L4.12215 18.0902L5.24472 11.5451L0.489435 6.90983L7.06107 5.95492L10 0Z", color: "#F0850B" },
          { type: "fp", d: "M70 0L72.9389 5.95492L79.5106 6.90983L74.7553 11.5451L75.8779 18.0902L70 15L64.1221 18.0902L65.2447 11.5451L60.4894 6.90983L67.0611 5.95492L70 0Z", color: "#F0850B" },
          { type: "fp", d: "M30 140L32.9389 145.955L39.5106 146.91L34.7553 151.545L35.8779 158.09L30 155L24.1221 158.09L25.2447 151.545L20.4894 146.91L27.0611 145.955L30 140Z", color: "#F0850B" },
          { type: "fp", d: "M30 0L32.9389 5.95492L39.5106 6.90983L34.7553 11.5451L35.8779 18.0902L30 15L24.1221 18.0902L25.2447 11.5451L20.4894 6.90983L27.0611 5.95492L30 0Z", color: "#F0850B" },
          { type: "fp", d: "M50 40L52.9389 45.9549L59.5106 46.9098L54.7553 51.5451L55.8779 58.0902L50 55L44.1221 58.0902L45.2447 51.5451L40.4894 46.9098L47.0611 45.9549L50 40Z", color: "#F0850B" },
          { type: "fp", d: "M50 20L52.9389 25.9549L59.5106 26.9098L54.7553 31.5451L55.8779 38.0902L50 35L44.1221 38.0902L45.2447 31.5451L40.4894 26.9098L47.0611 25.9549L50 20Z", color: "#F0850B" },
        ],
      },
      {
        vb: { w: 100, h: 160 },
        ops: [
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 90, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 30, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 30, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 50, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 70, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 90, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 110, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 130, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 150, r: 10, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 100, h: 160 },
        ops: [
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 70, cy: 150, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 90, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 30, cy: 150, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 50, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 90, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 130, r: 10, color: "#1CBAEF" },
          { type: "sp", d: "M10 10H90", sw: 8, cap: "round", color: "black" },
          { type: "sp", d: "M10 150H90", sw: 8, cap: "round", color: "black" },
          { type: "sp", d: "M50 10V150", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 90, cy: 150, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 30, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 70, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 110, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 150, r: 10, color: "#1CBAEF" },
        ],
      },
      {
        vb: { w: 100, h: 160 },
        ops: [
          { type: "fp", d: "M50 0L50.4753 5.02264L51.8925 0.180713L51.4087 5.20254L53.7166 0.716321L52.2911 5.55582L55.4064 1.58746L53.0908 6.06973L56.9008 2.76266L53.7787 6.7257L58.1458 4.19943L54.3301 7.5L59.0963 5.84585L54.725 8.36466L59.7181 7.64241L54.9491 9.28843L59.9887 9.52418L54.9943 10.2379L59.8982 11.4231L54.8591 11.1788L59.45 13.2707L54.5482 12.0771L58.6603 15L54.0729 12.9003L57.5575 16.5486L53.4504 13.6187L56.1816 17.8605L52.7032 14.2063L54.5823 18.8884L51.8583 14.6418L52.8173 19.5949L50.9463 14.9096L50.9506 19.9547L50 15L49.0494 19.9547L49.0537 14.9096L47.1827 19.5949L48.1417 14.6418L45.4177 18.8884L47.2968 14.2063L43.8184 17.8605L46.5496 13.6187L42.4425 16.5486L45.9271 12.9003L41.3397 15L45.4518 12.0771L40.55 13.2707L45.1409 11.1788L40.1018 11.4231L45.0057 10.2379L40.0113 9.52418L45.0509 9.28843L40.2819 7.64241L45.275 8.36466L40.9037 5.84585L45.6699 7.5L41.8542 4.19943L46.2213 6.7257L43.0992 2.76266L46.9092 6.06973L44.5936 1.58746L47.7089 5.55582L46.2834 0.716321L48.5913 5.20254L48.1075 0.180713L49.5247 5.02264L50 0Z", color: "#DE36E0" },
          { type: "fp", d: "M50 60L50.4753 65.0226L51.8925 60.1807L51.4087 65.2025L53.7166 60.7163L52.2911 65.5558L55.4064 61.5875L53.0908 66.0697L56.9008 62.7627L53.7787 66.7257L58.1458 64.1994L54.3301 67.5L59.0963 65.8458L54.725 68.3647L59.7181 67.6424L54.9491 69.2884L59.9887 69.5242L54.9943 70.2379L59.8982 71.4231L54.8591 71.1788L59.45 73.2707L54.5482 72.0771L58.6603 75L54.0729 72.9003L57.5575 76.5486L53.4504 73.6187L56.1816 77.8605L52.7032 74.2063L54.5823 78.8884L51.8583 74.6418L52.8173 79.5949L50.9463 74.9096L50.9506 79.9547L50 75L49.0494 79.9547L49.0537 74.9096L47.1827 79.5949L48.1417 74.6418L45.4177 78.8884L47.2968 74.2063L43.8184 77.8605L46.5496 73.6187L42.4425 76.5486L45.9271 72.9003L41.3397 75L45.4518 72.0771L40.55 73.2707L45.1409 71.1788L40.1018 71.4231L45.0057 70.2379L40.0113 69.5242L45.0509 69.2884L40.2819 67.6424L45.275 68.3647L40.9037 65.8458L45.6699 67.5L41.8542 64.1994L46.2213 66.7257L43.0992 62.7627L46.9092 66.0697L44.5936 61.5875L47.7089 65.5558L46.2834 60.7163L48.5913 65.2025L48.1075 60.1807L49.5247 65.0226L50 60Z", color: "#DE36E0" },
          { type: "fp", d: "M50 80L50.4753 85.0226L51.8925 80.1807L51.4087 85.2025L53.7166 80.7163L52.2911 85.5558L55.4064 81.5875L53.0908 86.0697L56.9008 82.7627L53.7787 86.7257L58.1458 84.1994L54.3301 87.5L59.0963 85.8458L54.725 88.3647L59.7181 87.6424L54.9491 89.2884L59.9887 89.5242L54.9943 90.2379L59.8982 91.4231L54.8591 91.1788L59.45 93.2707L54.5482 92.0771L58.6603 95L54.0729 92.9003L57.5575 96.5486L53.4504 93.6187L56.1816 97.8605L52.7032 94.2063L54.5823 98.8884L51.8583 94.6418L52.8173 99.5949L50.9463 94.9096L50.9506 99.9547L50 95L49.0494 99.9547L49.0537 94.9096L47.1827 99.5949L48.1417 94.6418L45.4177 98.8884L47.2968 94.2063L43.8184 97.8605L46.5496 93.6187L42.4425 96.5486L45.9271 92.9003L41.3397 95L45.4518 92.0771L40.55 93.2707L45.1409 91.1788L40.1018 91.4231L45.0057 90.2379L40.0113 89.5242L45.0509 89.2884L40.2819 87.6424L45.275 88.3647L40.9037 85.8458L45.6699 87.5L41.8542 84.1994L46.2213 86.7257L43.0992 82.7627L46.9092 86.0697L44.5936 81.5875L47.7089 85.5558L46.2834 80.7163L48.5913 85.2025L48.1075 80.1807L49.5247 85.0226L50 80Z", color: "#DE36E0" },
          { type: "fp", d: "M50 100L50.4753 105.023L51.8925 100.181L51.4087 105.203L53.7166 100.716L52.2911 105.556L55.4064 101.587L53.0908 106.07L56.9008 102.763L53.7787 106.726L58.1458 104.199L54.3301 107.5L59.0963 105.846L54.725 108.365L59.7181 107.642L54.9491 109.288L59.9887 109.524L54.9943 110.238L59.8982 111.423L54.8591 111.179L59.45 113.271L54.5482 112.077L58.6603 115L54.0729 112.9L57.5575 116.549L53.4504 113.619L56.1816 117.861L52.7032 114.206L54.5823 118.888L51.8583 114.642L52.8173 119.595L50.9463 114.91L50.9506 119.955L50 115L49.0494 119.955L49.0537 114.91L47.1827 119.595L48.1417 114.642L45.4177 118.888L47.2968 114.206L43.8184 117.861L46.5496 113.619L42.4425 116.549L45.9271 112.9L41.3397 115L45.4518 112.077L40.55 113.271L45.1409 111.179L40.1018 111.423L45.0057 110.238L40.0113 109.524L45.0509 109.288L40.2819 107.642L45.275 108.365L40.9037 105.846L45.6699 107.5L41.8542 104.199L46.2213 106.726L43.0992 102.763L46.9092 106.07L44.5936 101.587L47.7089 105.556L46.2834 100.716L48.5913 105.203L48.1075 100.181L49.5247 105.023L50 100Z", color: "#DE36E0" },
          { type: "fp", d: "M50 120L50.4753 125.023L51.8925 120.181L51.4087 125.203L53.7166 120.716L52.2911 125.556L55.4064 121.587L53.0908 126.07L56.9008 122.763L53.7787 126.726L58.1458 124.199L54.3301 127.5L59.0963 125.846L54.725 128.365L59.7181 127.642L54.9491 129.288L59.9887 129.524L54.9943 130.238L59.8982 131.423L54.8591 131.179L59.45 133.271L54.5482 132.077L58.6603 135L54.0729 132.9L57.5575 136.549L53.4504 133.619L56.1816 137.861L52.7032 134.206L54.5823 138.888L51.8583 134.642L52.8173 139.595L50.9463 134.91L50.9506 139.955L50 135L49.0494 139.955L49.0537 134.91L47.1827 139.595L48.1417 134.642L45.4177 138.888L47.2968 134.206L43.8184 137.861L46.5496 133.619L42.4425 136.549L45.9271 132.9L41.3397 135L45.4518 132.077L40.55 133.271L45.1409 131.179L40.1018 131.423L45.0057 130.238L40.0113 129.524L45.0509 129.288L40.2819 127.642L45.275 128.365L40.9037 125.846L45.6699 127.5L41.8542 124.199L46.2213 126.726L43.0992 122.763L46.9092 126.07L44.5936 121.587L47.7089 125.556L46.2834 120.716L48.5913 125.203L48.1075 120.181L49.5247 125.023L50 120Z", color: "#DE36E0" },
          { type: "fp", d: "M50 140L50.4753 145.023L51.8925 140.181L51.4087 145.203L53.7166 140.716L52.2911 145.556L55.4064 141.587L53.0908 146.07L56.9008 142.763L53.7787 146.726L58.1458 144.199L54.3301 147.5L59.0963 145.846L54.725 148.365L59.7181 147.642L54.9491 149.288L59.9887 149.524L54.9943 150.238L59.8982 151.423L54.8591 151.179L59.45 153.271L54.5482 152.077L58.6603 155L54.0729 152.9L57.5575 156.549L53.4504 153.619L56.1816 157.861L52.7032 154.206L54.5823 158.888L51.8583 154.642L52.8173 159.595L50.9463 154.91L50.9506 159.955L50 155L49.0494 159.955L49.0537 154.91L47.1827 159.595L48.1417 154.642L45.4177 158.888L47.2968 154.206L43.8184 157.861L46.5496 153.619L42.4425 156.549L45.9271 152.9L41.3397 155L45.4518 152.077L40.55 153.271L45.1409 151.179L40.1018 151.423L45.0057 150.238L40.0113 149.524L45.0509 149.288L40.2819 147.642L45.275 148.365L40.9037 145.846L45.6699 147.5L41.8542 144.199L46.2213 146.726L43.0992 142.763L46.9092 146.07L44.5936 141.587L47.7089 145.556L46.2834 140.716L48.5913 145.203L48.1075 140.181L49.5247 145.023L50 140Z", color: "#DE36E0" },
          { type: "fp", d: "M70 140L70.4753 145.023L71.8925 140.181L71.4087 145.203L73.7166 140.716L72.2911 145.556L75.4064 141.587L73.0908 146.07L76.9008 142.763L73.7787 146.726L78.1458 144.199L74.3301 147.5L79.0963 145.846L74.725 148.365L79.7181 147.642L74.9491 149.288L79.9887 149.524L74.9943 150.238L79.8982 151.423L74.8591 151.179L79.45 153.271L74.5482 152.077L78.6603 155L74.0729 152.9L77.5575 156.549L73.4504 153.619L76.1816 157.861L72.7032 154.206L74.5823 158.888L71.8583 154.642L72.8173 159.595L70.9463 154.91L70.9506 159.955L70 155L69.0494 159.955L69.0537 154.91L67.1827 159.595L68.1417 154.642L65.4177 158.888L67.2968 154.206L63.8184 157.861L66.5496 153.619L62.4425 156.549L65.9271 152.9L61.3397 155L65.4518 152.077L60.55 153.271L65.1409 151.179L60.1018 151.423L65.0057 150.238L60.0113 149.524L65.0509 149.288L60.2819 147.642L65.275 148.365L60.9037 145.846L65.6699 147.5L61.8542 144.199L66.2213 146.726L63.0992 142.763L66.9092 146.07L64.5936 141.587L67.7089 145.556L66.2834 140.716L68.5913 145.203L68.1075 140.181L69.5247 145.023L70 140Z", color: "#DE36E0" },
          { type: "fp", d: "M90 140L90.4753 145.023L91.8925 140.181L91.4087 145.203L93.7166 140.716L92.2911 145.556L95.4064 141.587L93.0908 146.07L96.9008 142.763L93.7787 146.726L98.1458 144.199L94.3301 147.5L99.0963 145.846L94.725 148.365L99.7181 147.642L94.9491 149.288L99.9887 149.524L94.9943 150.238L99.8982 151.423L94.8591 151.179L99.45 153.271L94.5482 152.077L98.6603 155L94.0729 152.9L97.5575 156.549L93.4504 153.619L96.1816 157.861L92.7032 154.206L94.5823 158.888L91.8583 154.642L92.8173 159.595L90.9463 154.91L90.9506 159.955L90 155L89.0494 159.955L89.0537 154.91L87.1827 159.595L88.1417 154.642L85.4177 158.888L87.2968 154.206L83.8184 157.861L86.5496 153.619L82.4425 156.549L85.9271 152.9L81.3397 155L85.4518 152.077L80.55 153.271L85.1409 151.179L80.1018 151.423L85.0057 150.238L80.0113 149.524L85.0509 149.288L80.2819 147.642L85.275 148.365L80.9037 145.846L85.6699 147.5L81.8542 144.199L86.2213 146.726L83.0992 142.763L86.9092 146.07L84.5936 141.587L87.7089 145.556L86.2834 140.716L88.5913 145.203L88.1075 140.181L89.5247 145.023L90 140Z", color: "#DE36E0" },
          { type: "fp", d: "M90 0L90.4753 5.02264L91.8925 0.180713L91.4087 5.20254L93.7166 0.716321L92.2911 5.55582L95.4064 1.58746L93.0908 6.06973L96.9008 2.76266L93.7787 6.7257L98.1458 4.19943L94.3301 7.5L99.0963 5.84585L94.725 8.36466L99.7181 7.64241L94.9491 9.28843L99.9887 9.52418L94.9943 10.2379L99.8982 11.4231L94.8591 11.1788L99.45 13.2707L94.5482 12.0771L98.6603 15L94.0729 12.9003L97.5575 16.5486L93.4504 13.6187L96.1816 17.8605L92.7032 14.2063L94.5823 18.8884L91.8583 14.6418L92.8173 19.5949L90.9463 14.9096L90.9506 19.9547L90 15L89.0494 19.9547L89.0537 14.9096L87.1827 19.5949L88.1417 14.6418L85.4177 18.8884L87.2968 14.2063L83.8184 17.8605L86.5496 13.6187L82.4425 16.5486L85.9271 12.9003L81.3397 15L85.4518 12.0771L80.55 13.2707L85.1409 11.1788L80.1018 11.4231L85.0057 10.2379L80.0113 9.52418L85.0509 9.28843L80.2819 7.64241L85.275 8.36466L80.9037 5.84585L85.6699 7.5L81.8542 4.19943L86.2213 6.7257L83.0992 2.76266L86.9092 6.06973L84.5936 1.58746L87.7089 5.55582L86.2834 0.716321L88.5913 5.20254L88.1075 0.180713L89.5247 5.02264L90 0Z", color: "#DE36E0" },
          { type: "fp", d: "M10 140L10.4753 145.023L11.8925 140.181L11.4087 145.203L13.7166 140.716L12.2911 145.556L15.4064 141.587L13.0908 146.07L16.9008 142.763L13.7787 146.726L18.1458 144.199L14.3301 147.5L19.0963 145.846L14.725 148.365L19.7181 147.642L14.9491 149.288L19.9887 149.524L14.9943 150.238L19.8982 151.423L14.8591 151.179L19.45 153.271L14.5482 152.077L18.6603 155L14.0729 152.9L17.5575 156.549L13.4504 153.619L16.1816 157.861L12.7032 154.206L14.5823 158.888L11.8583 154.642L12.8173 159.595L10.9463 154.91L10.9506 159.955L10 155L9.04944 159.955L9.05374 154.91L7.18267 159.595L8.14169 154.642L5.41773 158.888L7.2968 154.206L3.81841 157.861L6.5496 153.619L2.4425 156.549L5.92712 152.9L1.33975 155L5.45184 152.077L0.549992 153.271L5.14094 151.179L0.101786 151.423L5.00566 150.238L0.0113268 149.524L5.05089 149.288L0.281884 147.642L5.275 148.365L0.90368 145.846L5.66987 147.5L1.85424 144.199L6.22125 146.726L3.09921 142.763L6.9092 146.07L4.59359 141.587L7.70887 145.556L6.28338 140.716L8.59134 145.203L8.10749 140.181L9.52472 145.023L10 140Z", color: "#DE36E0" },
          { type: "fp", d: "M10 0L10.4753 5.02264L11.8925 0.180713L11.4087 5.20254L13.7166 0.716321L12.2911 5.55582L15.4064 1.58746L13.0908 6.06973L16.9008 2.76266L13.7787 6.7257L18.1458 4.19943L14.3301 7.5L19.0963 5.84585L14.725 8.36466L19.7181 7.64241L14.9491 9.28843L19.9887 9.52418L14.9943 10.2379L19.8982 11.4231L14.8591 11.1788L19.45 13.2707L14.5482 12.0771L18.6603 15L14.0729 12.9003L17.5575 16.5486L13.4504 13.6187L16.1816 17.8605L12.7032 14.2063L14.5823 18.8884L11.8583 14.6418L12.8173 19.5949L10.9463 14.9096L10.9506 19.9547L10 15L9.04944 19.9547L9.05374 14.9096L7.18267 19.5949L8.14169 14.6418L5.41773 18.8884L7.2968 14.2063L3.81841 17.8605L6.5496 13.6187L2.4425 16.5486L5.92712 12.9003L1.33975 15L5.45184 12.0771L0.549992 13.2707L5.14094 11.1788L0.101786 11.4231L5.00566 10.2379L0.0113268 9.52418L5.05089 9.28843L0.281884 7.64241L5.275 8.36466L0.90368 5.84585L5.66987 7.5L1.85424 4.19943L6.22125 6.7257L3.09921 2.76266L6.9092 6.06973L4.59359 1.58746L7.70887 5.55582L6.28338 0.716321L8.59134 5.20254L8.10749 0.180713L9.52472 5.02264L10 0Z", color: "#DE36E0" },
          { type: "fp", d: "M70 0L70.4753 5.02264L71.8925 0.180713L71.4087 5.20254L73.7166 0.716321L72.2911 5.55582L75.4064 1.58746L73.0908 6.06973L76.9008 2.76266L73.7787 6.7257L78.1458 4.19943L74.3301 7.5L79.0963 5.84585L74.725 8.36466L79.7181 7.64241L74.9491 9.28843L79.9887 9.52418L74.9943 10.2379L79.8982 11.4231L74.8591 11.1788L79.45 13.2707L74.5482 12.0771L78.6603 15L74.0729 12.9003L77.5575 16.5486L73.4504 13.6187L76.1816 17.8605L72.7032 14.2063L74.5823 18.8884L71.8583 14.6418L72.8173 19.5949L70.9463 14.9096L70.9506 19.9547L70 15L69.0494 19.9547L69.0537 14.9096L67.1827 19.5949L68.1417 14.6418L65.4177 18.8884L67.2968 14.2063L63.8184 17.8605L66.5496 13.6187L62.4425 16.5486L65.9271 12.9003L61.3397 15L65.4518 12.0771L60.55 13.2707L65.1409 11.1788L60.1018 11.4231L65.0057 10.2379L60.0113 9.52418L65.0509 9.28843L60.2819 7.64241L65.275 8.36466L60.9037 5.84585L65.6699 7.5L61.8542 4.19943L66.2213 6.7257L63.0992 2.76266L66.9092 6.06973L64.5936 1.58746L67.7089 5.55582L66.2834 0.716321L68.5913 5.20254L68.1075 0.180713L69.5247 5.02264L70 0Z", color: "#DE36E0" },
          { type: "fp", d: "M30 140L30.4753 145.023L31.8925 140.181L31.4087 145.203L33.7166 140.716L32.2911 145.556L35.4064 141.587L33.0908 146.07L36.9008 142.763L33.7787 146.726L38.1458 144.199L34.3301 147.5L39.0963 145.846L34.725 148.365L39.7181 147.642L34.9491 149.288L39.9887 149.524L34.9943 150.238L39.8982 151.423L34.8591 151.179L39.45 153.271L34.5482 152.077L38.6603 155L34.0729 152.9L37.5575 156.549L33.4504 153.619L36.1816 157.861L32.7032 154.206L34.5823 158.888L31.8583 154.642L32.8173 159.595L30.9463 154.91L30.9506 159.955L30 155L29.0494 159.955L29.0537 154.91L27.1827 159.595L28.1417 154.642L25.4177 158.888L27.2968 154.206L23.8184 157.861L26.5496 153.619L22.4425 156.549L25.9271 152.9L21.3397 155L25.4518 152.077L20.55 153.271L25.1409 151.179L20.1018 151.423L25.0057 150.238L20.0113 149.524L25.0509 149.288L20.2819 147.642L25.275 148.365L20.9037 145.846L25.6699 147.5L21.8542 144.199L26.2213 146.726L23.0992 142.763L26.9092 146.07L24.5936 141.587L27.7089 145.556L26.2834 140.716L28.5913 145.203L28.1075 140.181L29.5247 145.023L30 140Z", color: "#DE36E0" },
          { type: "fp", d: "M30 0L30.4753 5.02264L31.8925 0.180713L31.4087 5.20254L33.7166 0.716321L32.2911 5.55582L35.4064 1.58746L33.0908 6.06973L36.9008 2.76266L33.7787 6.7257L38.1458 4.19943L34.3301 7.5L39.0963 5.84585L34.725 8.36466L39.7181 7.64241L34.9491 9.28843L39.9887 9.52418L34.9943 10.2379L39.8982 11.4231L34.8591 11.1788L39.45 13.2707L34.5482 12.0771L38.6603 15L34.0729 12.9003L37.5575 16.5486L33.4504 13.6187L36.1816 17.8605L32.7032 14.2063L34.5823 18.8884L31.8583 14.6418L32.8173 19.5949L30.9463 14.9096L30.9506 19.9547L30 15L29.0494 19.9547L29.0537 14.9096L27.1827 19.5949L28.1417 14.6418L25.4177 18.8884L27.2968 14.2063L23.8184 17.8605L26.5496 13.6187L22.4425 16.5486L25.9271 12.9003L21.3397 15L25.4518 12.0771L20.55 13.2707L25.1409 11.1788L20.1018 11.4231L25.0057 10.2379L20.0113 9.52418L25.0509 9.28843L20.2819 7.64241L25.275 8.36466L20.9037 5.84585L25.6699 7.5L21.8542 4.19943L26.2213 6.7257L23.0992 2.76266L26.9092 6.06973L24.5936 1.58746L27.7089 5.55582L26.2834 0.716321L28.5913 5.20254L28.1075 0.180713L29.5247 5.02264L30 0Z", color: "#DE36E0" },
          { type: "fp", d: "M50 40L50.4753 45.0226L51.8925 40.1807L51.4087 45.2025L53.7166 40.7163L52.2911 45.5558L55.4064 41.5875L53.0908 46.0697L56.9008 42.7627L53.7787 46.7257L58.1458 44.1994L54.3301 47.5L59.0963 45.8458L54.725 48.3647L59.7181 47.6424L54.9491 49.2884L59.9887 49.5242L54.9943 50.2379L59.8982 51.4231L54.8591 51.1788L59.45 53.2707L54.5482 52.0771L58.6603 55L54.0729 52.9003L57.5575 56.5486L53.4504 53.6187L56.1816 57.8605L52.7032 54.2063L54.5823 58.8884L51.8583 54.6418L52.8173 59.5949L50.9463 54.9096L50.9506 59.9547L50 55L49.0494 59.9547L49.0537 54.9096L47.1827 59.5949L48.1417 54.6418L45.4177 58.8884L47.2968 54.2063L43.8184 57.8605L46.5496 53.6187L42.4425 56.5486L45.9271 52.9003L41.3397 55L45.4518 52.0771L40.55 53.2707L45.1409 51.1788L40.1018 51.4231L45.0057 50.2379L40.0113 49.5242L45.0509 49.2884L40.2819 47.6424L45.275 48.3647L40.9037 45.8458L45.6699 47.5L41.8542 44.1994L46.2213 46.7257L43.0992 42.7627L46.9092 46.0697L44.5936 41.5875L47.7089 45.5558L46.2834 40.7163L48.5913 45.2025L48.1075 40.1807L49.5247 45.0226L50 40Z", color: "#DE36E0" },
          { type: "fp", d: "M50 20L50.4753 25.0226L51.8925 20.1807L51.4087 25.2025L53.7166 20.7163L52.2911 25.5558L55.4064 21.5875L53.0908 26.0697L56.9008 22.7627L53.7787 26.7257L58.1458 24.1994L54.3301 27.5L59.0963 25.8458L54.725 28.3647L59.7181 27.6424L54.9491 29.2884L59.9887 29.5242L54.9943 30.2379L59.8982 31.4231L54.8591 31.1788L59.45 33.2707L54.5482 32.0771L58.6603 35L54.0729 32.9003L57.5575 36.5486L53.4504 33.6187L56.1816 37.8605L52.7032 34.2063L54.5823 38.8884L51.8583 34.6418L52.8173 39.5949L50.9463 34.9096L50.9506 39.9547L50 35L49.0494 39.9547L49.0537 34.9096L47.1827 39.5949L48.1417 34.6418L45.4177 38.8884L47.2968 34.2063L43.8184 37.8605L46.5496 33.6187L42.4425 36.5486L45.9271 32.9003L41.3397 35L45.4518 32.0771L40.55 33.2707L45.1409 31.1788L40.1018 31.4231L45.0057 30.2379L40.0113 29.5242L45.0509 29.2884L40.2819 27.6424L45.275 28.3647L40.9037 25.8458L45.6699 27.5L41.8542 24.1994L46.2213 26.7257L43.0992 22.7627L46.9092 26.0697L44.5936 21.5875L47.7089 25.5558L46.2834 20.7163L48.5913 25.2025L48.1075 20.1807L49.5247 25.0226L50 20Z", color: "#DE36E0" },
        ],
      },
    ],
    'J': [
      {
        vb: { w: 90, h: 160 },
        ops: [
          { type: "fp", d: "M20 0L0 0L0 20L20 20Z", color: "#48DC2D" },
          { type: "fp", d: "M20 140L0 140L0 160L20 160Z", color: "#48DC2D" },
          { type: "fp", d: "M48.6602 126.961L31.3397 136.961L41.3397 154.2815L58.6602 144.2815Z", color: "#48DC2D" },
          { type: "fp", d: "M90 90L90.000000652164 70L70.000000652164 69.999999347836L70 89.999999347836Z", color: "#48DC2D" },
          { type: "fp", d: "M55 20L55.000000652164 0L35.000000652164005 -6.521640010248575e-7L35 19.999999347836Z", color: "#48DC2D" },
          { type: "fp", d: "M90 20L90.000000652164 0L70.000000652164 -6.521640010248575e-7L70 19.999999347836Z", color: "#48DC2D" },
          { type: "fp", d: "M90 55L90.000000652164 35L70.000000652164 34.999999347835995L70 54.999999347836Z", color: "#48DC2D" },
          { type: "fp", d: "M74.2812 128.66L84.2812 111.33949999999999L66.9607 101.33949999999999L56.960699999999996 118.66Z", color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 90, h: 160 },
        ops: [
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 44.99995, cy: 140.62125, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 70.62195, cy: 114.99974999999999, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80.000000218557, cy: 79.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 45.000000218557, cy: 9.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80.000000218557, cy: 9.999999781443, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80.000000218557, cy: 44.999999781443, r: 10, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 90, h: 160 },
        ops: [
          { type: "fp", d: "M20 140L0 140L0 160L20 160Z", color: "#0055FF" },
          { type: "fp", d: "M55 20L55.000000652164 0L35.000000652164005 -6.521640010248575e-7L35 19.999999347836Z", color: "#0055FF" },
          { type: "fp", d: "M90 55L90.000000652164 35L70.000000652164 34.999999347835995L70 54.999999347836Z", color: "#0055FF" },
          { type: "fp", d: "M74.2812 128.66L84.2812 111.33949999999999L66.9607 101.33949999999999L56.960699999999996 118.66Z", color: "#0055FF" },
          { type: "sp", d: "M10 10H80V80C80 118.66 48.6599 150 10 150", sw: 8, cap: "round", color: "black" },
          { type: "fp", d: "M20 0L0 0L0 20L20 20Z", color: "#0055FF" },
          { type: "fp", d: "M48.6602 126.961L31.3397 136.961L41.3397 154.2815L58.6602 144.2815Z", color: "#0055FF" },
          { type: "fp", d: "M90 90L90.000000652164 70L70.000000652164 69.999999347836L70 89.999999347836Z", color: "#0055FF" },
          { type: "fp", d: "M90 20L90.000000652164 0L70.000000652164 -6.521640010248575e-7L70 19.999999347836Z", color: "#0055FF" },
        ],
      },
    ],
    'K': [
      {
        vb: { w: 125, h: 161 },
        ops: [
          { type: "fc", cx: 100.83805, cy: 25.13095, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 87.27005, cy: 39.82384999999999, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 73.70015000000001, cy: 54.517250000000004, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 60.130750000000006, cy: 69.21035, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 100.83800000000002, cy: 135.21, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 87.2704, cy: 120.517, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 73.7001, cy: 105.82400000000001, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 60.130799999999994, cy: 91.131, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 36, cy: 80, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 115, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 114.99999999999999, cy: 150.341, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 130, h: 160 },
        ops: [
          { type: "sc", cx: 15, cy: 15, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 115, cy: 15, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 15, cy: 47.5, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 85, cy: 47.5, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 15, cy: 80, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 55, cy: 80, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 15, cy: 112.5, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 85, cy: 112.5, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 15, cy: 145, r: 10, sw: 10, color: "#48DC2D" },
          { type: "sc", cx: 115, cy: 145, r: 10, sw: 10, color: "#48DC2D" },
        ],
      },
    ],
    'L': [
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 109.99999999999999, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 69.99999999999999, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 29.999999999999996, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10.000000000000002, cy: 9.999999999999998, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 9.999999999999998, cy: 50, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10.000000000000002, cy: 130, r: 10, color: "#F8D01F" },
          { type: "sp", d: "M110 150H10V10", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 89.99999999999999, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10.000000000000002, cy: 70, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 50.00000000000001, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#F8D01F" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 110.00000000000001, cy: 150, r: 10, color: "#0055FF" },
          { type: "fc", cx: 77.00000000000001, cy: 150, r: 10, color: "#0055FF" },
          { type: "fc", cx: 10, cy: 80, r: 10, color: "#0055FF" },
          { type: "fc", cx: 43.99999999999999, cy: 150, r: 10, color: "#0055FF" },
          { type: "fc", cx: 9.999999999999998, cy: 10.000000000000002, r: 10, color: "#0055FF" },
          { type: "fc", cx: 10.000000000000002, cy: 45, r: 10, color: "#0055FF" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#0055FF" },
          { type: "fc", cx: 10, cy: 115, r: 10, color: "#0055FF" },
        ],
      },
    ],
    'M': [
      {
        vb: { w: 180, h: 160 },
        ops: [
          { type: "fr", x: 48, y: 80, w: 32, h: 32, color: "#F0850B" },
          { type: "fr", x: 98, y: 80, w: 32, h: 32, color: "#F0850B" },
          { type: "sc", cx: 16, cy: 16, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 48, cy: 64, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 164, cy: 16, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 16, cy: 80, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 164, cy: 80, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 132, cy: 64, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 90, cy: 128, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 16, cy: 144, r: 9, sw: 14, color: "#F0850B" },
          { type: "sc", cx: 164, cy: 144, r: 9, sw: 14, color: "#F0850B" },
          { type: "fr", x: 0, y: 32, w: 32, h: 32, color: "#F0850B" },
          { type: "fr", x: 148, y: 32, w: 32, h: 32, color: "#F0850B" },
          { type: "fr", x: 0, y: 96, w: 32, h: 32, color: "#F0850B" },
          { type: "fr", x: 148, y: 96, w: 32, h: 32, color: "#F0850B" },
        ],
      },
      {
        vb: { w: 180, h: 160 },
        ops: [
          { type: "sc", cx: 16, cy: 16, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 16, cy: 48, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 16, cy: 112, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 48, cy: 64, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 164, cy: 16, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 164, cy: 48, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 16, cy: 80, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 164, cy: 80, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 114, cy: 96, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 64, cy: 96, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 164, cy: 112, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 132, cy: 64, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 90, cy: 128, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 16, cy: 144, r: 11, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 164, cy: 144, r: 11, sw: 10, color: "#0055FF" },
        ],
      },
    ],
    'N': [
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 10, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 30, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 50, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 70, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 90, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 110, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 110, cy: 130, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 108, cy: 150, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 30, cy: 30, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 42, cy: 50, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 54, cy: 70, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 66, cy: 90, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 78, cy: 110, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 90, cy: 130, r: 10, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fp", d: "M10 0L10.3921 6.01926L11.9509 0.192147L11.1611 6.17224L13.8268 0.761205L11.8856 6.47231L15.5557 1.6853L12.5376 6.90796L17.0711 2.92893L13.092 7.46243L18.3147 4.4443L13.5277 8.11441L19.2388 6.17317L13.8278 8.83886L19.8079 8.0491L13.9807 9.60793L20 10L13.9807 10.3921L19.8079 11.9509L13.8278 11.1611L19.2388 13.8268L13.5277 11.8856L18.3147 15.5557L13.092 12.5376L17.0711 17.0711L12.5376 13.092L15.5557 18.3147L11.8856 13.5277L13.8268 19.2388L11.1611 13.8278L11.9509 19.8079L10.3921 13.9807L10 20L9.60793 13.9807L8.0491 19.8079L8.83886 13.8278L6.17317 19.2388L8.11441 13.5277L4.4443 18.3147L7.46243 13.092L2.92893 17.0711L6.90796 12.5376L1.6853 15.5557L6.47231 11.8856L0.761205 13.8268L6.17224 11.1611L0.192147 11.9509L6.01926 10.3921L0 10L6.01926 9.60793L0.192147 8.0491L6.17224 8.83886L0.761205 6.17317L6.47231 8.11441L1.6853 4.4443L6.90796 7.46243L2.92893 2.92893L7.46243 6.90796L4.4443 1.6853L8.11441 6.47231L6.17317 0.761205L8.83886 6.17224L8.0491 0.192147L9.60793 6.01926L10 0Z", color: "#5F1CEF" },
          { type: "fp", d: "M30 20L30.3921 26.0193L31.9509 20.1921L31.1611 26.1722L33.8268 20.7612L31.8856 26.4723L35.5557 21.6853L32.5376 26.908L37.0711 22.9289L33.092 27.4624L38.3147 24.4443L33.5277 28.1144L39.2388 26.1732L33.8278 28.8389L39.8079 28.0491L33.9807 29.6079L40 30L33.9807 30.3921L39.8079 31.9509L33.8278 31.1611L39.2388 33.8268L33.5277 31.8856L38.3147 35.5557L33.092 32.5376L37.0711 37.0711L32.5376 33.092L35.5557 38.3147L31.8856 33.5277L33.8268 39.2388L31.1611 33.8278L31.9509 39.8079L30.3921 33.9807L30 40L29.6079 33.9807L28.0491 39.8079L28.8389 33.8278L26.1732 39.2388L28.1144 33.5277L24.4443 38.3147L27.4624 33.092L22.9289 37.0711L26.908 32.5376L21.6853 35.5557L26.4723 31.8856L20.7612 33.8268L26.1722 31.1611L20.1921 31.9509L26.0193 30.3921L20 30L26.0193 29.6079L20.1921 28.0491L26.1722 28.8389L20.7612 26.1732L26.4723 28.1144L21.6853 24.4443L26.908 27.4624L22.9289 22.9289L27.4624 26.908L24.4443 21.6853L28.1144 26.4723L26.1732 20.7612L28.8389 26.1722L28.0491 20.1921L29.6079 26.0193L30 20Z", color: "#5F1CEF" },
          { type: "fp", d: "M42 40L42.3921 46.0193L43.9509 40.1921L43.1611 46.1722L45.8268 40.7612L43.8856 46.4723L47.5557 41.6853L44.5376 46.908L49.0711 42.9289L45.092 47.4624L50.3147 44.4443L45.5277 48.1144L51.2388 46.1732L45.8278 48.8389L51.8079 48.0491L45.9807 49.6079L52 50L45.9807 50.3921L51.8079 51.9509L45.8278 51.1611L51.2388 53.8268L45.5277 51.8856L50.3147 55.5557L45.092 52.5376L49.0711 57.0711L44.5376 53.092L47.5557 58.3147L43.8856 53.5277L45.8268 59.2388L43.1611 53.8278L43.9509 59.8079L42.3921 53.9807L42 60L41.6079 53.9807L40.0491 59.8079L40.8389 53.8278L38.1732 59.2388L40.1144 53.5277L36.4443 58.3147L39.4624 53.092L34.9289 57.0711L38.908 52.5376L33.6853 55.5557L38.4723 51.8856L32.7612 53.8268L38.1722 51.1611L32.1921 51.9509L38.0193 50.3921L32 50L38.0193 49.6079L32.1921 48.0491L38.1722 48.8389L32.7612 46.1732L38.4723 48.1144L33.6853 44.4443L38.908 47.4624L34.9289 42.9289L39.4624 46.908L36.4443 41.6853L40.1144 46.4723L38.1732 40.7612L40.8389 46.1722L40.0491 40.1921L41.6079 46.0193L42 40Z", color: "#5F1CEF" },
          { type: "fp", d: "M54 60L54.3921 66.0193L55.9509 60.1921L55.1611 66.1722L57.8268 60.7612L55.8856 66.4723L59.5557 61.6853L56.5376 66.908L61.0711 62.9289L57.092 67.4624L62.3147 64.4443L57.5277 68.1144L63.2388 66.1732L57.8278 68.8389L63.8079 68.0491L57.9807 69.6079L64 70L57.9807 70.3921L63.8079 71.9509L57.8278 71.1611L63.2388 73.8268L57.5277 71.8856L62.3147 75.5557L57.092 72.5376L61.0711 77.0711L56.5376 73.092L59.5557 78.3147L55.8856 73.5277L57.8268 79.2388L55.1611 73.8278L55.9509 79.8079L54.3921 73.9807L54 80L53.6079 73.9807L52.0491 79.8079L52.8389 73.8278L50.1732 79.2388L52.1144 73.5277L48.4443 78.3147L51.4624 73.092L46.9289 77.0711L50.908 72.5376L45.6853 75.5557L50.4723 71.8856L44.7612 73.8268L50.1722 71.1611L44.1921 71.9509L50.0193 70.3921L44 70L50.0193 69.6079L44.1921 68.0491L50.1722 68.8389L44.7612 66.1732L50.4723 68.1144L45.6853 64.4443L50.908 67.4624L46.9289 62.9289L51.4624 66.908L48.4443 61.6853L52.1144 66.4723L50.1732 60.7612L52.8389 66.1722L52.0491 60.1921L53.6079 66.0193L54 60Z", color: "#5F1CEF" },
          { type: "fp", d: "M66 80L66.3921 86.0193L67.9509 80.1921L67.1611 86.1722L69.8268 80.7612L67.8856 86.4723L71.5557 81.6853L68.5376 86.908L73.0711 82.9289L69.092 87.4624L74.3147 84.4443L69.5277 88.1144L75.2388 86.1732L69.8278 88.8389L75.8079 88.0491L69.9807 89.6079L76 90L69.9807 90.3921L75.8079 91.9509L69.8278 91.1611L75.2388 93.8268L69.5277 91.8856L74.3147 95.5557L69.092 92.5376L73.0711 97.0711L68.5376 93.092L71.5557 98.3147L67.8856 93.5277L69.8268 99.2388L67.1611 93.8278L67.9509 99.8079L66.3921 93.9807L66 100L65.6079 93.9807L64.0491 99.8079L64.8389 93.8278L62.1732 99.2388L64.1144 93.5277L60.4443 98.3147L63.4624 93.092L58.9289 97.0711L62.908 92.5376L57.6853 95.5557L62.4723 91.8856L56.7612 93.8268L62.1722 91.1611L56.1921 91.9509L62.0193 90.3921L56 90L62.0193 89.6079L56.1921 88.0491L62.1722 88.8389L56.7612 86.1732L62.4723 88.1144L57.6853 84.4443L62.908 87.4624L58.9289 82.9289L63.4624 86.908L60.4443 81.6853L64.1144 86.4723L62.1732 80.7612L64.8389 86.1722L64.0491 80.1921L65.6079 86.0193L66 80Z", color: "#5F1CEF" },
          { type: "fp", d: "M78 100L78.3921 106.019L79.9509 100.192L79.1611 106.172L81.8268 100.761L79.8856 106.472L83.5557 101.685L80.5376 106.908L85.0711 102.929L81.092 107.462L86.3147 104.444L81.5277 108.114L87.2388 106.173L81.8278 108.839L87.8079 108.049L81.9807 109.608L88 110L81.9807 110.392L87.8079 111.951L81.8278 111.161L87.2388 113.827L81.5277 111.886L86.3147 115.556L81.092 112.538L85.0711 117.071L80.5376 113.092L83.5557 118.315L79.8856 113.528L81.8268 119.239L79.1611 113.828L79.9509 119.808L78.3921 113.981L78 120L77.6079 113.981L76.0491 119.808L76.8389 113.828L74.1732 119.239L76.1144 113.528L72.4443 118.315L75.4624 113.092L70.9289 117.071L74.908 112.538L69.6853 115.556L74.4723 111.886L68.7612 113.827L74.1722 111.161L68.1921 111.951L74.0193 110.392L68 110L74.0193 109.608L68.1921 108.049L74.1722 108.839L68.7612 106.173L74.4723 108.114L69.6853 104.444L74.908 107.462L70.9289 102.929L75.4624 106.908L72.4443 101.685L76.1144 106.472L74.1732 100.761L76.8389 106.172L76.0491 100.192L77.6079 106.019L78 100Z", color: "#5F1CEF" },
          { type: "fp", d: "M90 120L90.3921 126.019L91.9509 120.192L91.1611 126.172L93.8268 120.761L91.8856 126.472L95.5557 121.685L92.5376 126.908L97.0711 122.929L93.092 127.462L98.3147 124.444L93.5277 128.114L99.2388 126.173L93.8278 128.839L99.8079 128.049L93.9807 129.608L100 130L93.9807 130.392L99.8079 131.951L93.8278 131.161L99.2388 133.827L93.5277 131.886L98.3147 135.556L93.092 132.538L97.0711 137.071L92.5376 133.092L95.5557 138.315L91.8856 133.528L93.8268 139.239L91.1611 133.828L91.9509 139.808L90.3921 133.981L90 140L89.6079 133.981L88.0491 139.808L88.8389 133.828L86.1732 139.239L88.1144 133.528L84.4443 138.315L87.4624 133.092L82.9289 137.071L86.908 132.538L81.6853 135.556L86.4723 131.886L80.7612 133.827L86.1722 131.161L80.1921 131.951L86.0193 130.392L80 130L86.0193 129.608L80.1921 128.049L86.1722 128.839L80.7612 126.173L86.4723 128.114L81.6853 124.444L86.908 127.462L82.9289 122.929L87.4624 126.908L84.4443 121.685L88.1144 126.472L86.1732 120.761L88.8389 126.172L88.0491 120.192L89.6079 126.019L90 120Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 0L110.392 6.01926L111.951 0.192147L111.161 6.17224L113.827 0.761205L111.886 6.47231L115.556 1.6853L112.538 6.90796L117.071 2.92893L113.092 7.46243L118.315 4.4443L113.528 8.11441L119.239 6.17317L113.828 8.83886L119.808 8.0491L113.981 9.60793L120 10L113.981 10.3921L119.808 11.9509L113.828 11.1611L119.239 13.8268L113.528 11.8856L118.315 15.5557L113.092 12.5376L117.071 17.0711L112.538 13.092L115.556 18.3147L111.886 13.5277L113.827 19.2388L111.161 13.8278L111.951 19.8079L110.392 13.9807L110 20L109.608 13.9807L108.049 19.8079L108.839 13.8278L106.173 19.2388L108.114 13.5277L104.444 18.3147L107.462 13.092L102.929 17.0711L106.908 12.5376L101.685 15.5557L106.472 11.8856L100.761 13.8268L106.172 11.1611L100.192 11.9509L106.019 10.3921L100 10L106.019 9.60793L100.192 8.0491L106.172 8.83886L100.761 6.17317L106.472 8.11441L101.685 4.4443L106.908 7.46243L102.929 2.92893L107.462 6.90796L104.444 1.6853L108.114 6.47231L106.173 0.761205L108.839 6.17224L108.049 0.192147L109.608 6.01926L110 0Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 20L10.3921 26.0193L11.9509 20.1921L11.1611 26.1722L13.8268 20.7612L11.8856 26.4723L15.5557 21.6853L12.5376 26.908L17.0711 22.9289L13.092 27.4624L18.3147 24.4443L13.5277 28.1144L19.2388 26.1732L13.8278 28.8389L19.8079 28.0491L13.9807 29.6079L20 30L13.9807 30.3921L19.8079 31.9509L13.8278 31.1611L19.2388 33.8268L13.5277 31.8856L18.3147 35.5557L13.092 32.5376L17.0711 37.0711L12.5376 33.092L15.5557 38.3147L11.8856 33.5277L13.8268 39.2388L11.1611 33.8278L11.9509 39.8079L10.3921 33.9807L10 40L9.60793 33.9807L8.0491 39.8079L8.83886 33.8278L6.17317 39.2388L8.11441 33.5277L4.4443 38.3147L7.46243 33.092L2.92893 37.0711L6.90796 32.5376L1.6853 35.5557L6.47231 31.8856L0.761205 33.8268L6.17224 31.1611L0.192147 31.9509L6.01926 30.3921L0 30L6.01926 29.6079L0.192147 28.0491L6.17224 28.8389L0.761205 26.1732L6.47231 28.1144L1.6853 24.4443L6.90796 27.4624L2.92893 22.9289L7.46243 26.908L4.4443 21.6853L8.11441 26.4723L6.17317 20.7612L8.83886 26.1722L8.0491 20.1921L9.60793 26.0193L10 20Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 20L110.392 26.0193L111.951 20.1921L111.161 26.1722L113.827 20.7612L111.886 26.4723L115.556 21.6853L112.538 26.908L117.071 22.9289L113.092 27.4624L118.315 24.4443L113.528 28.1144L119.239 26.1732L113.828 28.8389L119.808 28.0491L113.981 29.6079L120 30L113.981 30.3921L119.808 31.9509L113.828 31.1611L119.239 33.8268L113.528 31.8856L118.315 35.5557L113.092 32.5376L117.071 37.0711L112.538 33.092L115.556 38.3147L111.886 33.5277L113.827 39.2388L111.161 33.8278L111.951 39.8079L110.392 33.9807L110 40L109.608 33.9807L108.049 39.8079L108.839 33.8278L106.173 39.2388L108.114 33.5277L104.444 38.3147L107.462 33.092L102.929 37.0711L106.908 32.5376L101.685 35.5557L106.472 31.8856L100.761 33.8268L106.172 31.1611L100.192 31.9509L106.019 30.3921L100 30L106.019 29.6079L100.192 28.0491L106.172 28.8389L100.761 26.1732L106.472 28.1144L101.685 24.4443L106.908 27.4624L102.929 22.9289L107.462 26.908L104.444 21.6853L108.114 26.4723L106.173 20.7612L108.839 26.1722L108.049 20.1921L109.608 26.0193L110 20Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 40L10.3921 46.0193L11.9509 40.1921L11.1611 46.1722L13.8268 40.7612L11.8856 46.4723L15.5557 41.6853L12.5376 46.908L17.0711 42.9289L13.092 47.4624L18.3147 44.4443L13.5277 48.1144L19.2388 46.1732L13.8278 48.8389L19.8079 48.0491L13.9807 49.6079L20 50L13.9807 50.3921L19.8079 51.9509L13.8278 51.1611L19.2388 53.8268L13.5277 51.8856L18.3147 55.5557L13.092 52.5376L17.0711 57.0711L12.5376 53.092L15.5557 58.3147L11.8856 53.5277L13.8268 59.2388L11.1611 53.8278L11.9509 59.8079L10.3921 53.9807L10 60L9.60793 53.9807L8.0491 59.8079L8.83886 53.8278L6.17317 59.2388L8.11441 53.5277L4.4443 58.3147L7.46243 53.092L2.92893 57.0711L6.90796 52.5376L1.6853 55.5557L6.47231 51.8856L0.761205 53.8268L6.17224 51.1611L0.192147 51.9509L6.01926 50.3921L0 50L6.01926 49.6079L0.192147 48.0491L6.17224 48.8389L0.761205 46.1732L6.47231 48.1144L1.6853 44.4443L6.90796 47.4624L2.92893 42.9289L7.46243 46.908L4.4443 41.6853L8.11441 46.4723L6.17317 40.7612L8.83886 46.1722L8.0491 40.1921L9.60793 46.0193L10 40Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 40L110.392 46.0193L111.951 40.1921L111.161 46.1722L113.827 40.7612L111.886 46.4723L115.556 41.6853L112.538 46.908L117.071 42.9289L113.092 47.4624L118.315 44.4443L113.528 48.1144L119.239 46.1732L113.828 48.8389L119.808 48.0491L113.981 49.6079L120 50L113.981 50.3921L119.808 51.9509L113.828 51.1611L119.239 53.8268L113.528 51.8856L118.315 55.5557L113.092 52.5376L117.071 57.0711L112.538 53.092L115.556 58.3147L111.886 53.5277L113.827 59.2388L111.161 53.8278L111.951 59.8079L110.392 53.9807L110 60L109.608 53.9807L108.049 59.8079L108.839 53.8278L106.173 59.2388L108.114 53.5277L104.444 58.3147L107.462 53.092L102.929 57.0711L106.908 52.5376L101.685 55.5557L106.472 51.8856L100.761 53.8268L106.172 51.1611L100.192 51.9509L106.019 50.3921L100 50L106.019 49.6079L100.192 48.0491L106.172 48.8389L100.761 46.1732L106.472 48.1144L101.685 44.4443L106.908 47.4624L102.929 42.9289L107.462 46.908L104.444 41.6853L108.114 46.4723L106.173 40.7612L108.839 46.1722L108.049 40.1921L109.608 46.0193L110 40Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 60L10.3921 66.0193L11.9509 60.1921L11.1611 66.1722L13.8268 60.7612L11.8856 66.4723L15.5557 61.6853L12.5376 66.908L17.0711 62.9289L13.092 67.4624L18.3147 64.4443L13.5277 68.1144L19.2388 66.1732L13.8278 68.8389L19.8079 68.0491L13.9807 69.6079L20 70L13.9807 70.3921L19.8079 71.9509L13.8278 71.1611L19.2388 73.8268L13.5277 71.8856L18.3147 75.5557L13.092 72.5376L17.0711 77.0711L12.5376 73.092L15.5557 78.3147L11.8856 73.5277L13.8268 79.2388L11.1611 73.8278L11.9509 79.8079L10.3921 73.9807L10 80L9.60793 73.9807L8.0491 79.8079L8.83886 73.8278L6.17317 79.2388L8.11441 73.5277L4.4443 78.3147L7.46243 73.092L2.92893 77.0711L6.90796 72.5376L1.6853 75.5557L6.47231 71.8856L0.761205 73.8268L6.17224 71.1611L0.192147 71.9509L6.01926 70.3921L0 70L6.01926 69.6079L0.192147 68.0491L6.17224 68.8389L0.761205 66.1732L6.47231 68.1144L1.6853 64.4443L6.90796 67.4624L2.92893 62.9289L7.46243 66.908L4.4443 61.6853L8.11441 66.4723L6.17317 60.7612L8.83886 66.1722L8.0491 60.1921L9.60793 66.0193L10 60Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 60L110.392 66.0193L111.951 60.1921L111.161 66.1722L113.827 60.7612L111.886 66.4723L115.556 61.6853L112.538 66.908L117.071 62.9289L113.092 67.4624L118.315 64.4443L113.528 68.1144L119.239 66.1732L113.828 68.8389L119.808 68.0491L113.981 69.6079L120 70L113.981 70.3921L119.808 71.9509L113.828 71.1611L119.239 73.8268L113.528 71.8856L118.315 75.5557L113.092 72.5376L117.071 77.0711L112.538 73.092L115.556 78.3147L111.886 73.5277L113.827 79.2388L111.161 73.8278L111.951 79.8079L110.392 73.9807L110 80L109.608 73.9807L108.049 79.8079L108.839 73.8278L106.173 79.2388L108.114 73.5277L104.444 78.3147L107.462 73.092L102.929 77.0711L106.908 72.5376L101.685 75.5557L106.472 71.8856L100.761 73.8268L106.172 71.1611L100.192 71.9509L106.019 70.3921L100 70L106.019 69.6079L100.192 68.0491L106.172 68.8389L100.761 66.1732L106.472 68.1144L101.685 64.4443L106.908 67.4624L102.929 62.9289L107.462 66.908L104.444 61.6853L108.114 66.4723L106.173 60.7612L108.839 66.1722L108.049 60.1921L109.608 66.0193L110 60Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 80L10.3921 86.0193L11.9509 80.1921L11.1611 86.1722L13.8268 80.7612L11.8856 86.4723L15.5557 81.6853L12.5376 86.908L17.0711 82.9289L13.092 87.4624L18.3147 84.4443L13.5277 88.1144L19.2388 86.1732L13.8278 88.8389L19.8079 88.0491L13.9807 89.6079L20 90L13.9807 90.3921L19.8079 91.9509L13.8278 91.1611L19.2388 93.8268L13.5277 91.8856L18.3147 95.5557L13.092 92.5376L17.0711 97.0711L12.5376 93.092L15.5557 98.3147L11.8856 93.5277L13.8268 99.2388L11.1611 93.8278L11.9509 99.8079L10.3921 93.9807L10 100L9.60793 93.9807L8.0491 99.8079L8.83886 93.8278L6.17317 99.2388L8.11441 93.5277L4.4443 98.3147L7.46243 93.092L2.92893 97.0711L6.90796 92.5376L1.6853 95.5557L6.47231 91.8856L0.761205 93.8268L6.17224 91.1611L0.192147 91.9509L6.01926 90.3921L0 90L6.01926 89.6079L0.192147 88.0491L6.17224 88.8389L0.761205 86.1732L6.47231 88.1144L1.6853 84.4443L6.90796 87.4624L2.92893 82.9289L7.46243 86.908L4.4443 81.6853L8.11441 86.4723L6.17317 80.7612L8.83886 86.1722L8.0491 80.1921L9.60793 86.0193L10 80Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 80L110.392 86.0193L111.951 80.1921L111.161 86.1722L113.827 80.7612L111.886 86.4723L115.556 81.6853L112.538 86.908L117.071 82.9289L113.092 87.4624L118.315 84.4443L113.528 88.1144L119.239 86.1732L113.828 88.8389L119.808 88.0491L113.981 89.6079L120 90L113.981 90.3921L119.808 91.9509L113.828 91.1611L119.239 93.8268L113.528 91.8856L118.315 95.5557L113.092 92.5376L117.071 97.0711L112.538 93.092L115.556 98.3147L111.886 93.5277L113.827 99.2388L111.161 93.8278L111.951 99.8079L110.392 93.9807L110 100L109.608 93.9807L108.049 99.8079L108.839 93.8278L106.173 99.2388L108.114 93.5277L104.444 98.3147L107.462 93.092L102.929 97.0711L106.908 92.5376L101.685 95.5557L106.472 91.8856L100.761 93.8268L106.172 91.1611L100.192 91.9509L106.019 90.3921L100 90L106.019 89.6079L100.192 88.0491L106.172 88.8389L100.761 86.1732L106.472 88.1144L101.685 84.4443L106.908 87.4624L102.929 82.9289L107.462 86.908L104.444 81.6853L108.114 86.4723L106.173 80.7612L108.839 86.1722L108.049 80.1921L109.608 86.0193L110 80Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 100L10.3921 106.019L11.9509 100.192L11.1611 106.172L13.8268 100.761L11.8856 106.472L15.5557 101.685L12.5376 106.908L17.0711 102.929L13.092 107.462L18.3147 104.444L13.5277 108.114L19.2388 106.173L13.8278 108.839L19.8079 108.049L13.9807 109.608L20 110L13.9807 110.392L19.8079 111.951L13.8278 111.161L19.2388 113.827L13.5277 111.886L18.3147 115.556L13.092 112.538L17.0711 117.071L12.5376 113.092L15.5557 118.315L11.8856 113.528L13.8268 119.239L11.1611 113.828L11.9509 119.808L10.3921 113.981L10 120L9.60793 113.981L8.0491 119.808L8.83886 113.828L6.17317 119.239L8.11441 113.528L4.4443 118.315L7.46243 113.092L2.92893 117.071L6.90796 112.538L1.6853 115.556L6.47231 111.886L0.761205 113.827L6.17224 111.161L0.192147 111.951L6.01926 110.392L0 110L6.01926 109.608L0.192147 108.049L6.17224 108.839L0.761205 106.173L6.47231 108.114L1.6853 104.444L6.90796 107.462L2.92893 102.929L7.46243 106.908L4.4443 101.685L8.11441 106.472L6.17317 100.761L8.83886 106.172L8.0491 100.192L9.60793 106.019L10 100Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 100L110.392 106.019L111.951 100.192L111.161 106.172L113.827 100.761L111.886 106.472L115.556 101.685L112.538 106.908L117.071 102.929L113.092 107.462L118.315 104.444L113.528 108.114L119.239 106.173L113.828 108.839L119.808 108.049L113.981 109.608L120 110L113.981 110.392L119.808 111.951L113.828 111.161L119.239 113.827L113.528 111.886L118.315 115.556L113.092 112.538L117.071 117.071L112.538 113.092L115.556 118.315L111.886 113.528L113.827 119.239L111.161 113.828L111.951 119.808L110.392 113.981L110 120L109.608 113.981L108.049 119.808L108.839 113.828L106.173 119.239L108.114 113.528L104.444 118.315L107.462 113.092L102.929 117.071L106.908 112.538L101.685 115.556L106.472 111.886L100.761 113.827L106.172 111.161L100.192 111.951L106.019 110.392L100 110L106.019 109.608L100.192 108.049L106.172 108.839L100.761 106.173L106.472 108.114L101.685 104.444L106.908 107.462L102.929 102.929L107.462 106.908L104.444 101.685L108.114 106.472L106.173 100.761L108.839 106.172L108.049 100.192L109.608 106.019L110 100Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 120L10.3921 126.019L11.9509 120.192L11.1611 126.172L13.8268 120.761L11.8856 126.472L15.5557 121.685L12.5376 126.908L17.0711 122.929L13.092 127.462L18.3147 124.444L13.5277 128.114L19.2388 126.173L13.8278 128.839L19.8079 128.049L13.9807 129.608L20 130L13.9807 130.392L19.8079 131.951L13.8278 131.161L19.2388 133.827L13.5277 131.886L18.3147 135.556L13.092 132.538L17.0711 137.071L12.5376 133.092L15.5557 138.315L11.8856 133.528L13.8268 139.239L11.1611 133.828L11.9509 139.808L10.3921 133.981L10 140L9.60793 133.981L8.0491 139.808L8.83886 133.828L6.17317 139.239L8.11441 133.528L4.4443 138.315L7.46243 133.092L2.92893 137.071L6.90796 132.538L1.6853 135.556L6.47231 131.886L0.761205 133.827L6.17224 131.161L0.192147 131.951L6.01926 130.392L0 130L6.01926 129.608L0.192147 128.049L6.17224 128.839L0.761205 126.173L6.47231 128.114L1.6853 124.444L6.90796 127.462L2.92893 122.929L7.46243 126.908L4.4443 121.685L8.11441 126.472L6.17317 120.761L8.83886 126.172L8.0491 120.192L9.60793 126.019L10 120Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 120L110.392 126.019L111.951 120.192L111.161 126.172L113.827 120.761L111.886 126.472L115.556 121.685L112.538 126.908L117.071 122.929L113.092 127.462L118.315 124.444L113.528 128.114L119.239 126.173L113.828 128.839L119.808 128.049L113.981 129.608L120 130L113.981 130.392L119.808 131.951L113.828 131.161L119.239 133.827L113.528 131.886L118.315 135.556L113.092 132.538L117.071 137.071L112.538 133.092L115.556 138.315L111.886 133.528L113.827 139.239L111.161 133.828L111.951 139.808L110.392 133.981L110 140L109.608 133.981L108.049 139.808L108.839 133.828L106.173 139.239L108.114 133.528L104.444 138.315L107.462 133.092L102.929 137.071L106.908 132.538L101.685 135.556L106.472 131.886L100.761 133.827L106.172 131.161L100.192 131.951L106.019 130.392L100 130L106.019 129.608L100.192 128.049L106.172 128.839L100.761 126.173L106.472 128.114L101.685 124.444L106.908 127.462L102.929 122.929L107.462 126.908L104.444 121.685L108.114 126.472L106.173 120.761L108.839 126.172L108.049 120.192L109.608 126.019L110 120Z", color: "#5F1CEF" },
          { type: "fp", d: "M10 140L10.3921 146.019L11.9509 140.192L11.1611 146.172L13.8268 140.761L11.8856 146.472L15.5557 141.685L12.5376 146.908L17.0711 142.929L13.092 147.462L18.3147 144.444L13.5277 148.114L19.2388 146.173L13.8278 148.839L19.8079 148.049L13.9807 149.608L20 150L13.9807 150.392L19.8079 151.951L13.8278 151.161L19.2388 153.827L13.5277 151.886L18.3147 155.556L13.092 152.538L17.0711 157.071L12.5376 153.092L15.5557 158.315L11.8856 153.528L13.8268 159.239L11.1611 153.828L11.9509 159.808L10.3921 153.981L10 160L9.60793 153.981L8.0491 159.808L8.83886 153.828L6.17317 159.239L8.11441 153.528L4.4443 158.315L7.46243 153.092L2.92893 157.071L6.90796 152.538L1.6853 155.556L6.47231 151.886L0.761205 153.827L6.17224 151.161L0.192147 151.951L6.01926 150.392L0 150L6.01926 149.608L0.192147 148.049L6.17224 148.839L0.761205 146.173L6.47231 148.114L1.6853 144.444L6.90796 147.462L2.92893 142.929L7.46243 146.908L4.4443 141.685L8.11441 146.472L6.17317 140.761L8.83886 146.172L8.0491 140.192L9.60793 146.019L10 140Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 140L110.392 146.019L111.951 140.192L111.161 146.172L113.827 140.761L111.886 146.472L115.556 141.685L112.538 146.908L117.071 142.929L113.092 147.462L118.315 144.444L113.528 148.114L119.239 146.173L113.828 148.839L119.808 148.049L113.981 149.608L120 150L113.981 150.392L119.808 151.951L113.828 151.161L119.239 153.827L113.528 151.886L118.315 155.556L113.092 152.538L117.071 157.071L112.538 153.092L115.556 158.315L111.886 153.528L113.827 159.239L111.161 153.828L111.951 159.808L110.392 153.981L110 160L109.608 153.981L108.049 159.808L108.839 153.828L106.173 159.239L108.114 153.528L104.444 158.315L107.462 153.092L102.929 157.071L106.908 152.538L101.685 155.556L106.472 151.886L100.761 153.827L106.172 151.161L100.192 151.951L106.019 150.392L100 150L106.019 149.608L100.192 148.049L106.172 148.839L100.761 146.173L106.472 148.114L101.685 144.444L106.908 147.462L102.929 142.929L107.462 146.908L104.444 141.685L108.114 146.472L106.173 140.761L108.839 146.172L108.049 140.192L109.608 146.019L110 140Z", color: "#5F1CEF" },
        ],
      },
    ],
    'O': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 80, cy: 80, r: 50, sw: 60, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 80, cy: 80, r: 75, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 80, cy: 80, r: 55, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 80, cy: 80, r: 35, sw: 10, color: "#0055FF" },
          { type: "sc", cx: 80, cy: 80, r: 15, sw: 10, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 80, cy: 16, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 80, cy: 144, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 144, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 16, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 135.426, cy: 48, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 24.574300000000008, cy: 112, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 112, cy: 24.574200000000005, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 48, cy: 135.426, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 48, cy: 24.5744, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 112.00000000000001, cy: 135.426, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 24.574199999999998, cy: 48, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 135.426, cy: 112.00000000000001, r: 9, sw: 14, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 80, cy: 80, r: 75, sw: 10, color: "#F8D01F" },
          { type: "fc", cx: 80, cy: 80, r: 55, color: "#F8D01F" },
          { type: "sc", cx: 80, cy: 80, r: 55, sw: 10, color: "#F8D01F" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fr", x: 0, y: 0, w: 160, h: 160, color: "#1CBAEF" },
          { type: "fc", cx: 80, cy: 80, r: 80, color: "white" },
        ],
      },
    ],
    'P': [
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 30, cy: 90, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 50, cy: 90, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 70, cy: 90, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 110.000000437114, cy: 49.999999562886, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 89.99974999999999, cy: 15.358950000000002, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 104.64075, cy: 69.99995, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 104.64075, cy: 29.999950000000002, r: 10, color: "#DE36E0" },
          { type: "fc", cx: 89.99915, cy: 84.64104999999999, r: 10, color: "#DE36E0" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 30, cy: 90, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 70, cy: 90, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 104.64075, cy: 69.99995, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 104.64075, cy: 29.999950000000002, r: 10, color: "#1CBAEF" },
          { type: "sp", d: "M10 10H70C92.0914 10 110 27.9086 110 50C110 72.0914 92.0914 90 70 90H10V10Z", sw: 8, cap: "round", color: "black" },
          { type: "sp", d: "M10 80V150", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 50, cy: 90, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 110.000000437114, cy: 49.999999562886, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 89.99974999999999, cy: 15.358950000000002, r: 10, color: "#1CBAEF" },
          { type: "fc", cx: 89.99915, cy: 84.64104999999999, r: 10, color: "#1CBAEF" },
        ],
      },
    ],
    'Q': [
      {
        vb: { w: 171, h: 171 },
        ops: [
          { type: "fp", d: "M84.999 0L86.879 0.118279L88.7294 0.471252L90.5209 1.05335L92.2253 1.8554L93.8158 2.86475L95.2672 4.06547L96.5567 5.43864L97.6639 6.9626L98.5714 8.61331L99.2649 10.3647L99.7333 12.1893L99.9694 14.0581V15.9419L99.7333 17.8107L99.2649 19.6353L98.5714 21.3867L97.6639 23.0374L96.5567 24.5614L95.2672 25.9345L93.8158 27.1353L92.2253 28.1446L90.5209 28.9466L88.7294 29.5287L86.879 29.8817L84.999 30L83.119 29.8817L81.2687 29.5287L79.4772 28.9466L77.7727 28.1446L76.1822 27.1353L74.7308 25.9345L73.4413 24.5614L72.3341 23.0374L71.4266 21.3867L70.7332 19.6353L70.2647 17.8107L70.0286 15.9419V14.0581L70.2647 12.1893L70.7332 10.3647L71.4266 8.61331L72.3341 6.9626L73.4413 5.43864L74.7308 4.06547L76.1822 2.86475L77.7727 1.8554L79.4772 1.05335L81.2687 0.471252L83.119 0.118279L84.999 0Z", color: "#0055FF" },
          { type: "fp", d: "M144.606 144.607L146.019 143.361L147.577 142.302L149.255 141.447L151.027 140.809L152.866 140.398L154.741 140.221L156.624 140.28L158.484 140.574L160.293 141.1L162.022 141.848L163.643 142.807L165.132 143.961L166.464 145.293L167.618 146.782L168.577 148.403L169.325 150.132L169.851 151.941L170.146 153.802L170.205 155.684L170.028 157.56L169.617 159.398L168.979 161.17L168.123 162.849L167.065 164.407L165.819 165.82L164.406 167.065L162.848 168.124L161.169 168.979L159.397 169.618L157.559 170.028L155.683 170.206L153.801 170.147L151.94 169.852L150.131 169.326L148.402 168.578L146.781 167.619L145.293 166.465L143.961 165.133L142.806 163.644L141.847 162.023L141.099 160.294L140.573 158.485L140.279 156.625L140.22 154.742L140.397 152.867L140.808 151.028L141.446 149.256L142.301 147.578L143.36 146.02L144.606 144.607Z", color: "#0055FF" },
          { type: "fp", d: "M98.6056 98.6065L100.019 97.3608L101.577 96.302L103.255 95.4468L105.027 94.8087L106.866 94.3978L108.741 94.2205L110.624 94.2797L112.484 94.5744L114.293 95.0999L116.022 95.848L117.643 96.8069L119.132 97.9615L120.464 99.2935L121.618 100.782L122.577 102.403L123.325 104.132L123.851 105.941L124.146 107.802L124.205 109.684L124.028 111.56L123.617 113.398L122.979 115.17L122.123 116.849L121.065 118.407L119.819 119.82L118.406 121.065L116.848 122.124L115.169 122.979L113.397 123.618L111.559 124.028L109.683 124.206L107.801 124.147L105.94 123.852L104.131 123.326L102.402 122.578L100.781 121.619L99.2925 120.465L97.9606 119.133L96.806 117.644L95.8471 116.023L95.099 114.294L94.5735 112.485L94.2788 110.625L94.2196 108.742L94.3969 106.867L94.8078 105.028L95.4459 103.256L96.3011 101.578L97.3599 100.02L98.6056 98.6065Z", color: "#0055FF" },
          { type: "fp", d: "M121.606 121.607L123.019 120.361L124.577 119.302L126.255 118.447L128.027 117.809L129.866 117.398L131.741 117.221L133.624 117.28L135.484 117.574L137.293 118.1L139.022 118.848L140.643 119.807L142.132 120.961L143.464 122.293L144.618 123.782L145.577 125.403L146.325 127.132L146.851 128.941L147.146 130.802L147.205 132.684L147.028 134.56L146.617 136.398L145.979 138.17L145.123 139.849L144.065 141.407L142.819 142.82L141.406 144.065L139.848 145.124L138.169 145.979L136.397 146.618L134.559 147.028L132.683 147.206L130.801 147.147L128.94 146.852L127.131 146.326L125.402 145.578L123.781 144.619L122.293 143.465L120.961 142.133L119.806 140.644L118.847 139.023L118.099 137.294L117.573 135.485L117.279 133.625L117.22 131.742L117.397 129.867L117.808 128.028L118.446 126.256L119.301 124.578L120.36 123.02L121.606 121.607Z", color: "#0055FF" },
          { type: "fp", d: "M84.999 140L86.879 140.118L88.7294 140.471L90.5209 141.053L92.2253 141.855L93.8158 142.865L95.2672 144.065L96.5567 145.439L97.6639 146.963L98.5714 148.613L99.2649 150.365L99.7333 152.189L99.9694 154.058V155.942L99.7333 157.811L99.2649 159.635L98.5714 161.387L97.6639 163.037L96.5567 164.561L95.2672 165.935L93.8158 167.135L92.2253 168.145L90.5209 168.947L88.7294 169.529L86.879 169.882L84.999 170L83.119 169.882L81.2687 169.529L79.4772 168.947L77.7727 168.145L76.1822 167.135L74.7308 165.935L73.4413 164.561L72.3341 163.037L71.4266 161.387L70.7332 159.635L70.2647 157.811L70.0286 155.942V154.058L70.2647 152.189L70.7332 150.365L71.4266 148.613L72.3341 146.963L73.4413 145.439L74.7308 144.065L76.1822 142.865L77.7727 141.855L79.4772 141.053L81.2687 140.471L83.119 140.118L84.999 140Z", color: "#0055FF" },
          { type: "fp", d: "M127.499 11.3879L129.068 12.4304L130.494 13.6612L131.755 15.0611L132.83 16.6079L133.702 18.2773L134.359 20.0428L134.789 21.8768L134.986 23.7502L134.947 25.6335L134.671 27.497L134.165 29.3113L133.435 31.0478L132.493 32.6792L131.354 34.1796L130.036 35.5255L128.56 36.6956L126.949 37.6714L125.228 38.4375L123.424 38.982L121.567 39.2961L119.685 39.375L117.808 39.2174L115.965 38.8258L114.186 38.2063L112.499 37.3687L110.93 36.3263L109.504 35.0954L108.244 33.6955L107.169 32.1487L106.296 30.4794L105.639 28.7138L105.209 26.8799L105.012 25.0065L105.052 23.1232L105.327 21.2596L105.834 19.4453L106.563 17.7088L107.505 16.0774L108.644 14.577L109.962 13.2311L111.438 12.0611L113.05 11.0853L114.771 10.3191L116.574 9.77464L118.431 9.46049L120.313 9.38161L122.19 9.53924L124.033 9.93088L125.812 10.5504L127.499 11.3879Z", color: "#0055FF" },
          { type: "fp", d: "M57.4992 132.631L59.0682 133.674L60.4941 134.905L61.7546 136.305L62.8296 137.851L63.7024 139.521L64.359 141.286L64.7891 143.12L64.986 144.994L64.9466 146.877L64.6714 148.74L64.1648 150.555L63.4348 152.291L62.493 153.923L61.3541 155.423L60.0361 156.769L58.5599 157.939L56.9486 158.915L55.2277 159.681L53.4244 160.225L51.5671 160.54L49.685 160.618L47.8079 160.461L45.9654 160.069L44.1864 159.45L42.4992 158.612L40.9302 157.57L39.5042 156.339L38.2438 154.939L37.1687 153.392L36.296 151.723L35.6394 149.957L35.2092 148.123L35.0123 146.25L35.0518 144.367L35.327 142.503L35.8335 140.689L36.5635 138.952L37.5054 137.321L38.6442 135.82L39.9622 134.475L41.4385 133.304L43.0497 132.329L44.7706 131.562L46.5739 131.018L48.4312 130.704L50.3133 130.625L52.1904 130.783L54.033 131.174L55.8119 131.794L57.4992 132.631Z", color: "#0055FF" },
          { type: "fp", d: "M158.611 42.5001L159.449 44.1874L160.068 45.9663L160.46 47.8089L160.618 49.686L160.539 51.5681L160.225 53.4254L159.68 55.2287L158.914 56.9496L157.938 58.5609L156.768 60.0371L155.422 61.3551L153.922 62.494L152.29 63.4358L150.554 64.1658L148.74 64.6724L146.876 64.9475L144.993 64.987L143.119 64.7901L141.285 64.3599L139.52 63.7033L137.851 62.8306L136.304 61.7555L134.904 60.4951L133.673 59.0691L132.631 57.5001L131.793 55.8129L131.174 54.0339L130.782 52.1914L130.624 50.3143L130.703 48.4322L131.017 46.5749L131.562 44.7716L132.328 43.0507L133.304 41.4394L134.474 39.9632L135.82 38.6452L137.32 37.5063L138.951 36.5645L140.688 35.8345L142.502 35.3279L144.366 35.0528L146.249 35.0133L148.122 35.2102L149.956 35.6404L151.722 36.297L153.391 37.1697L154.938 38.2447L156.338 39.5052L157.569 40.9312L158.611 42.5001Z", color: "#0055FF" },
          { type: "fp", d: "M37.3682 112.5L38.2057 114.187L38.8252 115.966L39.2169 117.809L39.3745 119.686L39.2956 121.568L38.9815 123.425L38.437 125.228L37.6708 126.949L36.695 128.561L35.525 130.037L34.1791 131.355L32.6787 132.494L31.0473 133.436L29.3108 134.166L27.4965 134.672L25.633 134.947L23.7496 134.987L21.8763 134.79L20.0423 134.36L18.2767 133.703L16.6074 132.83L15.0606 131.755L13.6607 130.495L12.4298 129.069L11.3874 127.5L10.5498 125.813L9.93034 124.034L9.5387 122.191L9.38107 120.314L9.45996 118.432L9.7741 116.575L10.3186 114.771L11.0847 113.05L12.0605 111.439L13.2306 109.963L14.5765 108.645L16.0769 107.506L17.7083 106.564L19.4448 105.834L21.2591 105.328L23.1226 105.053L25.0059 105.013L26.8793 105.21L28.7133 105.64L30.4788 106.297L32.1482 107.169L33.695 108.245L35.0949 109.505L36.3257 110.931L37.3682 112.5Z", color: "#0055FF" },
          { type: "fp", d: "M169.999 85L169.881 86.88L169.528 88.7303L168.946 90.5219L168.144 92.2263L167.134 93.8168L165.934 95.2682L164.56 96.5577L163.036 97.6649L161.386 98.5724L159.634 99.2658L157.81 99.7343L155.941 99.9704L154.057 99.9704L152.188 99.7343L150.364 99.2658L148.612 98.5724L146.962 97.6649L145.438 96.5577L144.064 95.2682L142.864 93.8168L141.854 92.2263L141.052 90.5219L140.47 88.7303L140.117 86.88L139.999 85L140.117 83.12L140.47 81.2697L141.052 79.4781L141.854 77.7737L142.864 76.1832L144.064 74.7318L145.438 73.4423L146.962 72.3351L148.612 71.4276L150.364 70.7342L152.188 70.2657L154.057 70.0296L155.941 70.0296L157.81 70.2657L159.634 70.7342L161.386 71.4276L163.036 72.3351L164.56 73.4423L165.934 74.7318L167.134 76.1832L168.144 77.7737L168.946 79.4781L169.528 81.2697L169.881 83.12L169.999 85Z", color: "#0055FF" },
          { type: "fp", d: "M30 85L29.8817 86.88L29.5287 88.7303L28.9466 90.5219L28.1446 92.2263L27.1353 93.8168L25.9345 95.2682L24.5614 96.5577L23.0374 97.6649L21.3867 98.5724L19.6353 99.2658L17.8107 99.7343L15.9419 99.9704L14.0581 99.9704L12.1893 99.7343L10.3647 99.2658L8.61331 98.5724L6.9626 97.6649L5.43864 96.5577L4.06547 95.2682L2.86475 93.8168L1.8554 92.2263L1.05335 90.5219L0.471252 88.7303L0.118278 86.88L-4.89123e-07 85L0.118278 83.12L0.471252 81.2697L1.05335 79.4781L1.8554 77.7737L2.86475 76.1832L4.06547 74.7318L5.43864 73.4423L6.9626 72.3351L8.61331 71.4276L10.3647 70.7342L12.1893 70.2657L14.0581 70.0296L15.9419 70.0296L17.8107 70.2657L19.6353 70.7342L21.3867 71.4276L23.0374 72.3351L24.5614 73.4423L25.9345 74.7318L27.1353 76.1832L28.1446 77.7737L28.9466 79.4781L29.5287 81.2697L29.8817 83.12L30 85Z", color: "#0055FF" },
          { type: "fp", d: "M37.3682 57.5001L36.3257 59.0691L35.0949 60.4951L33.695 61.7555L32.1482 62.8306L30.4788 63.7033L28.7133 64.3599L26.8793 64.7901L25.0059 64.987L23.1226 64.9475L21.2591 64.6724L19.4448 64.1658L17.7083 63.4358L16.0769 62.494L14.5765 61.3551L13.2306 60.0371L12.0605 58.5608L11.0847 56.9496L10.3186 55.2287L9.7741 53.4254L9.45995 51.5681L9.38107 49.686L9.5387 47.8089L9.93034 45.9663L10.5498 44.1874L11.3874 42.5001L12.4298 40.9312L13.6607 39.5052L15.0606 38.2447L16.6074 37.1697L18.2767 36.297L20.0423 35.6404L21.8763 35.2102L23.7496 35.0133L25.633 35.0528L27.4965 35.3279L29.3108 35.8345L31.0473 36.5645L32.6787 37.5063L34.1791 38.6452L35.525 39.9632L36.695 41.4394L37.6708 43.0507L38.437 44.7716L38.9815 46.5749L39.2956 48.4322L39.3745 50.3143L39.2169 52.1914L38.8252 54.0339L38.2057 55.8129L37.3682 57.5001Z", color: "#0055FF" },
          { type: "fp", d: "M57.4999 37.3689L55.8126 38.2065L54.0336 38.826L52.1911 39.2176L50.314 39.3752L48.4319 39.2963L46.5746 38.9822L44.7713 38.4377L43.0504 37.6716L41.4391 36.6958L39.9629 35.5257L38.6449 34.1798L37.506 32.6794L36.5642 31.048L35.8342 29.3115L35.3276 27.4972L35.0525 25.6337L35.013 23.7504L35.2099 21.877L35.6401 20.043L36.2967 18.2775L37.1694 16.6081L38.2445 15.0613L39.5049 13.6614L40.9309 12.4306L42.4999 11.3881L44.1871 10.5506L45.9661 9.93107L47.8086 9.53943L49.6857 9.3818L51.5678 9.46069L53.4251 9.77483L55.2284 10.3193L56.9493 11.0855L58.5606 12.0613L60.0368 13.2313L61.3548 14.5772L62.4937 16.0776L63.4355 17.709L64.1655 19.4455L64.6721 21.2598L64.9472 23.1233L64.9867 25.0066L64.7898 26.88L64.3596 28.714L63.703 30.4796L62.8303 32.1489L61.7553 33.6957L60.4948 35.0956L59.0688 36.3265L57.4999 37.3689Z", color: "#0055FF" },
        ],
      },
      {
        vb: { w: 170, h: 171 },
        ops: [
          { type: "fp", d: "M84.8594 0L86.4934 3.11177L88.9063 0.556241L89.6402 3.99346L92.6531 2.18371L92.4324 5.69146L95.8219 4.7617L94.663 8.07984L98.1777 8.09902L96.1665 10.9814L99.5456 11.9482L96.8314 14.1811L99.8244 16.0236L96.6084 17.4415L98.9933 20.0232L95.514 20.5208L97.1139 23.6502L93.6294 23.1906L94.3257 26.6357L91.0944 25.253L90.8354 28.7582L88.0969 26.555L86.9019 29.8603L84.8594 27L82.8169 29.8603L81.6218 26.555L78.8834 28.7582L78.6244 25.253L75.3931 26.6357L76.0893 23.1906L72.6048 23.6502L74.2048 20.5208L70.7255 20.0232L73.1104 17.4415L69.8943 16.0236L72.8873 14.1811L70.1731 11.9482L73.5522 10.9814L71.5411 8.09902L75.0557 8.07984L73.8968 4.7617L77.2863 5.69146L77.0656 2.18371L80.0786 3.99346L80.8124 0.556241L83.2254 3.11177L84.8594 0Z", color: "#E32B1A" },
          { type: "fp", d: "M144.466 144.607L147.822 145.651L147.721 142.138L150.67 144.05L151.521 140.64L153.845 143.276L155.585 140.222L157.112 143.388L159.61 140.916L160.226 144.376L163.299 142.67L162.959 146.169L166.378 145.355L165.107 148.632L168.619 148.771L166.51 151.583L169.854 152.664L167.066 154.803L169.994 156.747L166.731 158.054L169.027 160.716L165.533 161.094L167.025 164.277L163.558 163.698L164.136 167.165L160.954 165.673L160.575 169.167L157.914 166.872L156.607 170.134L154.663 167.206L152.524 169.995L151.442 166.651L148.63 168.759L148.491 165.247L145.215 166.519L146.028 163.1L142.53 163.44L144.236 160.367L140.775 159.751L143.247 157.252L140.081 155.725L143.135 153.986L140.499 151.662L143.909 150.811L141.998 147.861L145.511 147.962L144.466 144.607Z", color: "#E32B1A" },
          { type: "fp", d: "M98.466 98.6065L101.822 99.6515L101.721 96.1382L104.67 98.0498L105.521 94.6396L107.845 97.276L109.585 94.2219L111.112 97.3876L113.61 94.916L114.226 98.3762L117.299 96.6704L116.959 100.169L120.378 99.3551L119.107 102.632L122.619 102.771L120.51 105.583L123.854 106.664L121.066 108.803L123.994 110.747L120.731 112.054L123.027 114.716L119.533 115.094L121.025 118.277L117.558 117.698L118.136 121.165L114.954 119.673L114.575 123.167L111.914 120.872L110.607 124.134L108.663 121.206L106.524 123.995L105.442 120.651L102.63 122.759L102.491 119.247L99.2145 120.519L100.028 117.1L96.5298 117.44L98.2357 114.367L94.7754 113.751L97.2471 111.252L94.0813 109.725L97.1355 107.986L94.4991 105.662L97.9092 104.811L95.9977 101.861L99.5109 101.962L98.466 98.6065Z", color: "#E32B1A" },
          { type: "fp", d: "M121.466 121.607L124.822 122.651L124.721 119.138L127.67 121.05L128.521 117.64L130.845 120.276L132.585 117.222L134.112 120.388L136.61 117.916L137.226 121.376L140.299 119.67L139.959 123.169L143.378 122.355L142.107 125.632L145.619 125.771L143.51 128.583L146.854 129.664L144.066 131.803L146.994 133.747L143.731 135.054L146.027 137.716L142.533 138.094L144.025 141.277L140.558 140.698L141.136 144.165L137.954 142.673L137.575 146.167L134.914 143.872L133.607 147.134L131.663 144.206L129.524 146.995L128.442 143.651L125.63 145.759L125.491 142.247L122.215 143.519L123.028 140.1L119.53 140.44L121.236 137.367L117.775 136.751L120.247 134.252L117.081 132.725L120.135 130.986L117.499 128.662L120.909 127.811L118.998 124.861L122.511 124.962L121.466 121.607Z", color: "#E32B1A" },
          { type: "fp", d: "M84.8594 140L86.4934 143.112L88.9063 140.556L89.6402 143.993L92.6531 142.184L92.4324 145.691L95.8219 144.762L94.663 148.08L98.1777 148.099L96.1665 150.981L99.5456 151.948L96.8314 154.181L99.8244 156.024L96.6084 157.441L98.9933 160.023L95.514 160.521L97.1139 163.65L93.6294 163.191L94.3257 166.636L91.0944 165.253L90.8354 168.758L88.0969 166.555L86.9019 169.86L84.8594 167L82.8169 169.86L81.6218 166.555L78.8834 168.758L78.6244 165.253L75.3931 166.636L76.0893 163.191L72.6048 163.65L74.2048 160.521L70.7255 160.023L73.1104 157.441L69.8943 156.024L72.8873 154.181L70.1731 151.948L73.5522 150.981L71.5411 148.099L75.0557 148.08L73.8968 144.762L77.2863 145.691L77.0656 142.184L80.0786 143.993L80.8124 140.556L83.2254 143.112L84.8594 140Z", color: "#E32B1A" },
          { type: "fp", d: "M127.36 11.3879L127.219 14.8998L130.586 13.8931L129.503 17.2368L133.017 17.176L131.072 20.1034L134.473 20.993L131.81 23.2871L134.844 25.061L131.661 26.5517L134.104 29.0785L130.637 29.6551L132.308 32.7473L128.814 32.3672L129.588 35.7955L126.326 34.4868L126.147 37.9969L123.359 35.8566L122.24 39.1883L120.133 36.3752L118.156 39.2813L116.886 36.004L114.198 38.269L113.86 34.7706L110.661 36.2265L111.278 32.7665L107.805 33.3052L109.333 30.1402L105.844 29.7219L108.169 27.0866L104.922 25.7423L107.872 23.8321L105.108 21.6616L108.464 20.6182L106.388 17.7823L109.901 17.6831L108.667 14.3922L112.077 15.2446L111.776 11.7428L114.829 13.4835L115.485 10.0304L117.955 12.5304L119.518 9.38221L121.222 12.456L123.577 9.84618L124.389 13.2658L127.36 11.3879Z", color: "#E32B1A" },
          { type: "fp", d: "M57.3595 132.631L57.2187 136.143L60.5862 135.137L59.5031 138.48L63.0173 138.419L61.0722 141.347L64.4725 142.236L61.8098 144.531L64.844 146.304L61.6611 147.795L64.1041 150.322L60.6371 150.899L62.3078 153.991L58.8137 153.611L59.5883 157.039L56.3263 155.73L56.1472 159.24L53.3593 157.1L52.2398 160.432L50.1327 157.619L48.1558 160.525L46.8858 157.247L44.1982 159.512L43.8595 156.014L40.6605 157.47L41.2782 154.01L37.8051 154.549L39.3333 151.384L35.8436 150.965L38.1691 148.33L34.9217 146.986L37.872 145.076L35.1076 142.905L38.4638 141.862L36.3876 139.026L39.9009 138.927L38.6668 135.636L42.0765 136.488L41.776 132.986L44.8294 134.727L45.4848 131.274L47.9553 133.774L49.5181 130.626L51.2225 133.699L53.5766 131.09L54.3886 134.509L57.3595 132.631Z", color: "#E32B1A" },
          { type: "fp", d: "M158.472 42.5001L156.594 45.4711L160.013 46.283L157.404 48.6372L160.477 50.3416L157.329 51.9043L159.829 54.3748L156.376 55.0303L158.117 58.0836L154.615 57.7831L155.467 61.1929L152.177 59.9588L152.077 63.4721L149.241 61.3958L148.198 64.7521L146.027 61.9877L144.117 64.938L142.773 61.6905L140.138 64.0161L139.719 60.5263L136.554 62.0546L137.093 58.5815L133.633 59.1991L135.089 56.0001L131.591 55.6614L133.856 52.9738L130.578 51.7038L133.484 49.727L130.671 47.6199L134.003 46.5004L131.863 43.7125L135.373 43.5334L134.064 40.2714L137.492 41.0459L137.112 37.5519L140.204 39.2226L140.781 35.7556L143.308 38.1986L144.799 35.0157L146.573 38.0499L148.867 35.3872L149.756 38.7874L152.684 36.8424L152.623 40.3566L155.966 39.2735L154.96 42.6409L158.472 42.5001Z", color: "#E32B1A" },
          { type: "fp", d: "M37.2285 112.5L35.3506 115.471L38.7703 116.283L36.1605 118.637L39.2342 120.341L36.0861 121.904L38.586 124.375L35.133 125.03L36.8737 128.083L33.3719 127.783L34.2242 131.193L30.9333 129.959L30.8342 133.472L27.9983 131.396L26.9549 134.752L24.7843 131.987L22.8741 134.938L21.5298 131.69L18.8945 134.016L18.4763 130.526L15.3112 132.054L15.85 128.581L12.39 129.199L13.8458 126L10.3475 125.661L12.6124 122.974L9.3352 121.704L12.2412 119.727L9.42819 117.62L12.7598 116.5L10.6196 113.712L14.1297 113.533L12.821 110.271L16.2493 111.046L15.8691 107.552L18.9613 109.222L19.538 105.755L22.0647 108.198L23.5554 105.015L25.3294 108.05L27.6235 105.387L28.513 108.787L31.4405 106.842L31.3797 110.356L34.7233 109.273L33.7166 112.641L37.2285 112.5Z", color: "#E32B1A" },
          { type: "fp", d: "M169.859 85L166.748 86.634L169.303 89.047L165.866 89.7808L167.676 92.7938L164.168 92.5731L165.098 95.9625L161.78 94.8036L161.76 98.3183L158.878 96.3071L157.911 99.6863L155.678 96.972L153.836 99.965L152.418 96.749L149.836 99.1339L149.339 95.6546L146.209 97.2545L146.669 93.77L143.224 94.4663L144.606 91.235L141.101 90.976L143.304 88.2376L139.999 87.0425L142.859 85L139.999 82.9575L143.304 81.7624L141.101 79.024L144.606 78.765L143.224 75.5337L146.669 76.23L146.209 72.7455L149.339 74.3454L149.836 70.8661L152.418 73.251L153.836 70.035L155.678 73.028L157.911 70.3137L158.878 73.6929L161.76 71.6817L161.78 75.1964L165.098 74.0375L164.168 77.4269L167.676 77.2062L165.866 80.2192L169.303 80.953L166.748 83.366L169.859 85Z", color: "#E32B1A" },
          { type: "fp", d: "M29.8604 85L26.7486 86.634L29.3041 89.047L25.8669 89.7808L27.6766 92.7938L24.1689 92.5731L25.0986 95.9625L21.7805 94.8036L21.7613 98.3183L18.8789 96.3071L17.9122 99.6863L15.6793 96.972L13.8367 99.965L12.4189 96.749L9.83716 99.1339L9.33957 95.6546L6.21015 97.2545L6.66971 93.77L3.22468 94.4663L4.60732 91.235L1.10218 90.976L3.30534 88.2376L6.04794e-05 87.0425L2.86035 85L6.06126e-05 82.9575L3.30534 81.7624L1.10218 79.024L4.60732 78.765L3.22468 75.5337L6.66971 76.23L6.21015 72.7455L9.33957 74.3454L9.83716 70.8661L12.4189 73.251L13.8367 70.035L15.6793 73.028L17.9122 70.3137L18.8789 73.6929L21.7613 71.6817L21.7805 75.1964L25.0986 74.0375L24.1689 77.4269L27.6766 77.2062L25.8669 80.2192L29.3041 80.953L26.7486 83.366L29.8604 85Z", color: "#E32B1A" },
          { type: "fp", d: "M37.2285 57.5001L33.7166 57.3593L34.7233 60.7268L31.3797 59.6437L31.4405 63.1579L28.513 61.2129L27.6235 64.6131L25.3294 61.9504L23.5554 64.9846L22.0647 61.8017L19.538 64.2447L18.9613 60.7777L15.8691 62.4484L16.2493 58.9543L12.821 59.7289L14.1297 56.4669L10.6196 56.2878L12.7598 53.4999L9.42819 52.3804L12.2412 50.2733L9.3352 48.2964L12.6124 47.0265L10.3475 44.3389L13.8458 44.0001L12.39 40.8011L15.85 41.4188L15.3112 37.9457L18.4763 39.474L18.8945 35.9842L21.5299 38.3098L22.8741 35.0623L24.7843 38.0126L26.9549 35.2482L27.9983 38.6045L30.8342 36.5282L30.9333 40.0415L34.2242 38.8074L33.3719 42.2172L36.8737 41.9167L35.133 44.97L38.586 45.6255L36.0861 48.096L39.2342 49.6587L36.1605 51.3631L38.7703 53.7173L35.3506 54.5292L37.2285 57.5001Z", color: "#E32B1A" },
          { type: "fp", d: "M57.3602 37.3689L54.3892 35.491L53.5773 38.9107L51.2232 36.3009L49.5188 39.3746L47.956 36.2265L45.4855 38.7264L44.8301 35.2734L41.7767 37.0141L42.0772 33.5123L38.6674 34.3646L39.9016 31.0737L36.3883 30.9745L38.4645 28.1386L35.1083 27.0953L37.8726 24.9247L34.9224 23.0145L38.1698 21.6702L35.8443 19.0349L39.334 18.6166L37.8057 15.4516L41.2789 15.9904L40.6612 12.5304L43.8602 13.9862L44.1989 10.4879L46.8865 12.7528L48.1565 9.47558L50.1334 12.3816L52.2404 9.56857L53.36 12.9002L56.1479 10.7599L56.327 14.2701L59.5889 12.9613L58.8144 16.3896L62.3085 16.0095L60.6377 19.1017L64.1048 19.6784L61.6617 22.2051L64.8447 23.6958L61.8105 25.4697L64.4732 27.7639L61.0729 28.6534L63.0179 31.5809L59.5038 31.52L60.5868 34.8637L57.2194 33.857L57.3602 37.3689Z", color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 171, h: 171 },
        ops: [
          { type: "fp", d: "M84.999 0L85.6262 9.03287L88.1177 0.327786L86.8531 9.29366L91.1001 1.29682L87.999 9.80385L93.8158 2.86475L89.0138 10.5411L96.1462 4.96304L89.8531 11.4733L97.9894 7.5L90.4803 12.5596L99.2649 10.3647L90.8679 13.7525L99.9169 13.4321L90.999 15L99.9169 16.5679L90.8679 16.2475L99.2649 19.6353L90.4803 17.4404L97.9894 22.5L89.8531 18.5267L96.1462 25.037L89.0138 19.4589L93.8158 27.1353L87.999 20.1962L91.1001 28.7032L86.8531 20.7063L88.1177 29.6722L85.6262 20.9671L84.999 30L84.3719 20.9671L81.8803 29.6722L83.1449 20.7063L78.898 28.7032L81.999 20.1962L76.1822 27.1353L80.9842 19.4589L73.8519 25.037L80.1449 18.5267L72.0086 22.5L79.5178 17.4404L70.7332 19.6353L79.1301 16.2475L70.0812 16.5679L78.999 15L70.0812 13.4321L79.1301 13.7525L70.7332 10.3647L79.5178 12.5596L72.0086 7.5L80.1449 11.4733L73.8519 4.96304L80.9842 10.5411L76.1822 2.86475L81.999 9.80385L78.898 1.29682L83.1449 9.29366L81.8803 0.327786L84.3719 9.03287L84.999 0Z", color: "#DE36E0" },
          { type: "fp", d: "M144.606 144.607L151.436 150.55L147.043 142.633L152.488 149.867L149.837 141.209L153.659 149.418L152.866 140.398L154.898 149.221L155.997 140.234L156.151 149.287L159.095 140.724L157.362 149.612L162.022 141.848L158.48 150.181L164.652 143.556L159.455 150.97L166.869 145.773L160.244 151.945L168.577 148.403L160.814 153.063L169.701 151.331L161.138 154.275L170.192 154.428L161.204 155.527L170.028 157.56L161.008 156.766L169.216 160.589L160.558 157.937L167.792 163.383L159.875 158.989L165.819 165.82L158.988 159.876L163.382 167.793L157.936 160.559L160.588 169.217L156.765 161.009L157.559 170.028L155.526 161.205L154.427 170.193L154.274 161.139L151.33 169.702L153.062 160.815L148.402 168.578L151.944 160.245L145.772 166.87L150.97 159.456L143.555 164.653L150.18 158.481L141.847 162.023L149.611 157.363L140.723 159.095L149.286 156.152L140.233 155.998L149.22 154.899L140.397 152.867L149.417 153.66L141.209 149.838L149.866 152.489L142.632 147.044L150.549 151.437L144.606 144.607Z", color: "#DE36E0" },
          { type: "fp", d: "M98.6056 98.6065L105.436 104.55L101.043 96.6331L106.488 103.867L103.837 95.2094L107.659 103.418L106.866 94.3978L108.898 103.221L109.997 94.2337L110.151 103.287L113.095 94.7242L111.362 103.612L116.022 95.848L112.48 104.181L118.652 97.5559L113.455 104.97L120.869 99.7733L114.244 105.945L122.577 102.403L114.814 107.063L123.701 105.331L115.138 108.275L124.192 108.428L115.204 109.527L124.028 111.56L115.008 110.766L123.216 114.589L114.558 111.937L121.792 117.383L113.875 112.989L119.819 119.82L112.988 113.876L117.382 121.793L111.936 114.559L114.588 123.217L110.765 115.009L111.559 124.028L109.526 115.205L108.427 124.193L108.274 115.139L105.33 123.702L107.062 114.815L102.402 122.578L105.944 114.245L99.7724 120.87L104.97 113.456L97.555 118.653L104.18 112.481L95.8471 116.023L103.611 111.363L94.7233 113.095L103.286 110.152L94.2328 109.998L103.22 108.899L94.3969 106.867L103.417 107.66L95.2085 103.838L103.866 106.489L96.6322 101.044L104.549 105.437L98.6056 98.6065Z", color: "#DE36E0" },
          { type: "fp", d: "M121.606 121.607L129.212 127.017L128.33 117.724L132.212 126.213L136.095 117.724L135.212 127.017L142.819 121.607L137.408 129.213L146.701 128.331L138.212 132.213L146.701 136.095L137.408 135.213L142.819 142.82L135.212 137.409L136.095 146.702L132.212 138.213L128.33 146.702L129.212 137.409L121.606 142.82L127.016 135.213L117.723 136.095L126.212 132.213L117.723 128.331L127.016 129.213L121.606 121.607Z", color: "#DE36E0" },
          { type: "fp", d: "M84.999 140L85.6262 149.033L88.1177 140.328L86.8531 149.294L91.1001 141.297L87.999 149.804L93.8158 142.865L89.0138 150.541L96.1462 144.963L89.8531 151.473L97.9894 147.5L90.4803 152.56L99.2649 150.365L90.8679 153.753L99.9169 153.432L90.999 155L99.9169 156.568L90.8679 156.247L99.2649 159.635L90.4803 157.44L97.9894 162.5L89.8531 158.527L96.1462 165.037L89.0138 159.459L93.8158 167.135L87.999 160.196L91.1001 168.703L86.8531 160.706L88.1177 169.672L85.6262 160.967L84.999 170L84.3719 160.967L81.8803 169.672L83.1449 160.706L78.898 168.703L81.999 160.196L76.1822 167.135L80.9842 159.459L73.8519 165.037L80.1449 158.527L72.0086 162.5L79.5178 157.44L70.7332 159.635L79.1301 156.247L70.0812 156.568L78.999 155L70.0812 153.432L79.1301 153.753L70.7332 150.365L79.5178 152.56L72.0086 147.5L80.1449 151.473L73.8519 144.963L80.9842 150.541L76.1822 142.865L81.999 149.804L78.898 141.297L83.1449 149.294L81.8803 140.328L84.3719 149.033L84.999 140Z", color: "#DE36E0" },
          { type: "fp", d: "M127.499 11.3879L124.242 20.1357L132.99 16.8783L125.795 22.8254L134.999 24.3783L125.795 25.9312L132.99 31.8783L124.242 28.621L127.499 37.3687L121.552 30.1739L119.999 39.3783L118.446 30.1739L112.499 37.3687L115.757 28.621L107.009 31.8783L114.204 25.9312L104.999 24.3783L114.204 22.8254L107.009 16.8783L115.757 20.1357L112.499 11.3879L118.446 18.5828L119.999 9.37832L121.552 18.5828L127.499 11.3879Z", color: "#DE36E0" },
          { type: "fp", d: "M57.4992 132.631L54.2418 141.379L62.9896 138.122L55.7947 144.069L64.9992 145.622L55.7947 147.175L62.9896 153.122L54.2418 149.864L57.4992 158.612L51.5521 151.417L49.9992 160.622L48.4463 151.417L42.4992 158.612L45.7565 149.864L37.0088 153.122L44.2036 147.175L34.9992 145.622L44.2036 144.069L37.0088 138.122L45.7565 141.379L42.4992 132.631L48.4463 139.826L49.9992 130.622L51.5521 139.826L57.4992 132.631Z", color: "#DE36E0" },
          { type: "fp", d: "M158.611 42.5001L151.102 47.5597L159.887 45.3649L151.49 48.7527L160.539 48.4322L151.621 50.0001L160.539 51.5681L151.49 51.2476L159.887 54.6354L151.102 52.4406L158.611 57.5001L150.475 53.5269L156.768 60.0371L149.636 54.459L154.438 62.1354L148.621 55.1963L151.722 63.7033L147.475 55.7065L148.74 64.6724L146.248 55.9673L145.621 65.0001L144.994 55.9673L142.502 64.6724L143.767 55.7065L139.52 63.7033L142.621 55.1963L136.804 62.1354L141.606 54.459L134.474 60.0371L140.767 53.5269L132.631 57.5001L140.14 52.4406L131.355 54.6354L139.752 51.2476L130.703 51.5681L139.621 50.0001L130.703 48.4322L139.752 48.7527L131.355 45.3649L140.14 47.5597L132.631 42.5001L140.767 46.4734L134.474 39.9632L141.606 45.5413L136.804 37.8649L142.621 44.804L139.52 36.297L143.767 44.2938L142.502 35.3279L144.994 44.033L145.621 35.0001L146.248 44.033L148.74 35.3279L147.475 44.2938L151.722 36.297L148.621 44.804L154.438 37.8649L149.636 45.5413L156.768 39.9632L150.475 46.4734L158.611 42.5001Z", color: "#DE36E0" },
          { type: "fp", d: "M37.3682 112.5L29.8591 117.559L38.6436 115.365L30.2467 118.752L39.2956 118.432L30.3778 120L39.2956 121.568L30.2467 121.247L38.6436 124.635L29.8591 122.44L37.3682 127.5L29.2319 123.527L35.525 130.037L28.3926 124.459L33.1946 132.135L27.3778 125.196L30.4788 133.703L26.2319 125.706L27.4965 134.672L25.005 125.967L24.3778 135L23.7506 125.967L21.2591 134.672L22.5237 125.706L18.2767 133.703L21.3778 125.196L15.561 132.135L20.363 124.459L13.2306 130.037L19.5237 123.527L11.3874 127.5L18.8965 122.44L10.1119 124.635L18.5089 121.247L9.45995 121.568L18.3778 120L9.45996 118.432L18.5089 118.752L10.1119 115.365L18.8965 117.559L11.3874 112.5L19.5237 116.473L13.2306 109.963L20.363 115.541L15.561 107.865L21.3778 114.804L18.2767 106.297L22.5237 114.294L21.2591 105.328L23.7506 114.033L24.3778 105L25.005 114.033L27.4965 105.328L26.2319 114.294L30.4788 106.297L27.3778 114.804L33.1946 107.865L28.3926 115.541L35.525 109.963L29.2319 116.473L37.3682 112.5Z", color: "#DE36E0" },
          { type: "fp", d: "M169.999 85L160.795 86.5529L167.989 92.5L159.242 89.2426L162.499 97.9904L156.552 90.7956L154.999 100L153.446 90.7956L147.499 97.9904L150.756 89.2426L142.009 92.5L149.203 86.5529L139.999 85L149.203 83.4471L142.009 77.5L150.756 80.7574L147.499 72.0096L153.446 79.2044L154.999 70L156.552 79.2044L162.499 72.0096L159.242 80.7574L167.989 77.5L160.795 83.4471L169.999 85Z", color: "#DE36E0" },
          { type: "fp", d: "M30 85L20.7956 86.5529L27.9904 92.5L19.2426 89.2426L22.5 97.9904L16.5529 90.7956L15 100L13.4471 90.7956L7.5 97.9904L10.7574 89.2426L2.00962 92.5L9.20444 86.5529L-4.89123e-07 85L9.20444 83.4471L2.00962 77.5L10.7574 80.7574L7.5 72.0096L13.4471 79.2044L15 70L16.5529 79.2044L22.5 72.0096L19.2426 80.7574L27.9904 77.5L20.7956 83.4471L30 85Z", color: "#DE36E0" },
          { type: "fp", d: "M37.3682 57.5001L29.2319 53.5269L35.525 60.0371L28.3926 54.459L33.1946 62.1354L27.3778 55.1963L30.4788 63.7033L26.2319 55.7065L27.4965 64.6724L25.005 55.9673L24.3778 65.0001L23.7506 55.9673L21.2591 64.6724L22.5237 55.7065L18.2767 63.7033L21.3778 55.1963L15.561 62.1354L20.363 54.459L13.2306 60.0371L19.5237 53.5269L11.3874 57.5001L18.8965 52.4406L10.1119 54.6354L18.5089 51.2476L9.45995 51.5681L18.3778 50.0001L9.45995 48.4322L18.5089 48.7527L10.1119 45.3649L18.8965 47.5597L11.3874 42.5001L19.5237 46.4734L13.2306 39.9632L20.363 45.5413L15.561 37.8649L21.3778 44.804L18.2767 36.297L22.5237 44.2938L21.2591 35.3279L23.7506 44.033L24.3778 35.0001L25.005 44.033L27.4965 35.3279L26.2319 44.2938L30.4788 36.297L27.3778 44.804L33.1946 37.8649L28.3926 45.5413L35.525 39.9632L29.2319 46.4734L37.3682 42.5001L29.8591 47.5597L38.6436 45.3649L30.2467 48.7527L39.2956 48.4322L30.3778 50.0001L39.2956 51.5681L30.2467 51.2476L38.6436 54.6354L29.8591 52.4406L37.3682 57.5001Z", color: "#DE36E0" },
          { type: "fp", d: "M57.4999 37.3689L51.5528 30.1741L49.9999 39.3785L48.4469 30.1741L42.4999 37.3689L45.7572 28.6212L37.0095 31.8785L44.2043 25.9314L34.9999 24.3785L44.2043 22.8256L37.0095 16.8785L45.7572 20.1359L42.4999 11.3881L48.4469 18.583L49.9999 9.37851L51.5528 18.583L57.4999 11.3881L54.2425 20.1359L62.9902 16.8785L55.7954 22.8256L64.9999 24.3785L55.7954 25.9314L62.9902 31.8785L54.2425 28.6212L57.4999 37.3689Z", color: "#DE36E0" },
        ],
      },
    ],
    'R': [
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "sc", cx: 10, cy: 10, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 30, cy: 10, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 50, cy: 10, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 90, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 70, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 50, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 30, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 110, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 130, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 10, cy: 150, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 50, cy: 110, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 69, cy: 123, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 107, cy: 150, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 88, cy: 136, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 50, cy: 90, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 70, cy: 10, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 70, cy: 10, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 70, cy: 90, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 110.000000437114, cy: 49.999999562886, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 89.99974999999999, cy: 15.358950000000002, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 104.64075, cy: 69.99995, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 104.64075, cy: 29.999950000000002, r: 7.5, sw: 5, color: "#0055FF" },
          { type: "sc", cx: 89.99915, cy: 84.64104999999999, r: 7.5, sw: 5, color: "#0055FF" },
        ],
      },
      {
        vb: { w: 120, h: 160 },
        ops: [
          { type: "fc", cx: 10, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 30, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 90, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 70, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 50, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 30, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 110, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 130, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 10, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 110, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 69, cy: 123, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 107, cy: 150, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 88, cy: 136, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 50, cy: 90, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 70, cy: 90, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 110.000000437114, cy: 49.999999562886, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 89.99974999999999, cy: 15.358950000000002, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 104.64075, cy: 69.99995, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 104.64075, cy: 29.999950000000002, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 89.99915, cy: 84.64104999999999, r: 10, color: "#48DC2D" },
        ],
      },
    ],
    'S': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 144, cy: 16, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 112, cy: 16, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 80, cy: 16, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 48, cy: 16, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 16, cy: 16, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 16, cy: 48, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 16, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 48, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 80, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 112, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 144, cy: 80, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 144, cy: 112, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 16, cy: 144, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 48, cy: 144, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 80, cy: 144, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 112, cy: 144, r: 9, sw: 14, color: "#48DC2D" },
          { type: "sc", cx: 144, cy: 144, r: 9, sw: 14, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 128, cy: 16, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 96, cy: 16, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 64, cy: 16, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 32, cy: 16, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 16, cy: 48, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 32, cy: 80, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 64, cy: 80, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 96, cy: 80, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 128, cy: 80, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 144, cy: 112, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 32, cy: 144, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 64, cy: 144, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 96, cy: 144, r: 16, color: "#E32B1A" },
          { type: "fc", cx: 128, cy: 144, r: 16, color: "#E32B1A" },
        ],
      },
    ],
    'T': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M80 0L90 20L70 20L80 0Z", color: "#0055FF" },
          { type: "fp", d: "M80 20L90 40H70L80 20Z", color: "#0055FF" },
          { type: "fp", d: "M80 40L90 60H70L80 40Z", color: "#0055FF" },
          { type: "fp", d: "M80 60L90 80H70L80 60Z", color: "#0055FF" },
          { type: "fp", d: "M80 80L90 100H70L80 80Z", color: "#0055FF" },
          { type: "fp", d: "M80 100L90 120H70L80 100Z", color: "#0055FF" },
          { type: "fp", d: "M80 120L90 140H70L80 120Z", color: "#0055FF" },
          { type: "fp", d: "M80 140L90 160H70L80 140Z", color: "#0055FF" },
          { type: "fp", d: "M100 0L110 20L90 20L100 0Z", color: "#0055FF" },
          { type: "fp", d: "M120 0L130 20L110 20L120 0Z", color: "#0055FF" },
          { type: "fp", d: "M140 0L150 20L130 20L140 0Z", color: "#0055FF" },
          { type: "fp", d: "M20 0L30 20L10 20L20 0Z", color: "#0055FF" },
          { type: "fp", d: "M60 0L70 20L50 20L60 0Z", color: "#0055FF" },
          { type: "fp", d: "M40 0L50 20L30 20L40 0Z", color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M80 0L82.5 5.66987L88.6603 5L85 10L88.6603 15L82.5 14.3301L80 20L77.5 14.3301L71.3397 15L75 10L71.3397 5L77.5 5.66987L80 0Z", color: "#E32B1A" },
          { type: "fp", d: "M80 60L82.5 65.6699L88.6603 65L85 70L88.6603 75L82.5 74.3301L80 80L77.5 74.3301L71.3397 75L75 70L71.3397 65L77.5 65.6699L80 60Z", color: "#E32B1A" },
          { type: "fp", d: "M80 80L82.5 85.6699L88.6603 85L85 90L88.6603 95L82.5 94.3301L80 100L77.5 94.3301L71.3397 95L75 90L71.3397 85L77.5 85.6699L80 80Z", color: "#E32B1A" },
          { type: "fp", d: "M80 100L82.5 105.67L88.6603 105L85 110L88.6603 115L82.5 114.33L80 120L77.5 114.33L71.3397 115L75 110L71.3397 105L77.5 105.67L80 100Z", color: "#E32B1A" },
          { type: "fp", d: "M80 120L82.5 125.67L88.6603 125L85 130L88.6603 135L82.5 134.33L80 140L77.5 134.33L71.3397 135L75 130L71.3397 125L77.5 125.67L80 120Z", color: "#E32B1A" },
          { type: "fp", d: "M80 140L82.5 145.67L88.6603 145L85 150L88.6603 155L82.5 154.33L80 160L77.5 154.33L71.3397 155L75 150L71.3397 145L77.5 145.67L80 140Z", color: "#E32B1A" },
          { type: "fp", d: "M120 0L122.5 5.66987L128.66 5L125 10L128.66 15L122.5 14.3301L120 20L117.5 14.3301L111.34 15L115 10L111.34 5L117.5 5.66987L120 0Z", color: "#E32B1A" },
          { type: "fp", d: "M140 0L142.5 5.66987L148.66 5L145 10L148.66 15L142.5 14.3301L140 20L137.5 14.3301L131.34 15L135 10L131.34 5L137.5 5.66987L140 0Z", color: "#E32B1A" },
          { type: "fp", d: "M20 0L22.5 5.66987L28.6603 5L25 10L28.6603 15L22.5 14.3301L20 20L17.5 14.3301L11.3397 15L15 10L11.3397 5L17.5 5.66987L20 0Z", color: "#E32B1A" },
          { type: "fp", d: "M40 0L42.5 5.66987L48.6603 5L45 10L48.6603 15L42.5 14.3301L40 20L37.5 14.3301L31.3397 15L35 10L31.3397 5L37.5 5.66987L40 0Z", color: "#E32B1A" },
          { type: "fp", d: "M100 0L102.5 5.66987L108.66 5L105 10L108.66 15L102.5 14.3301L100 20L97.5 14.3301L91.3397 15L95 10L91.3397 5L97.5 5.66987L100 0Z", color: "#E32B1A" },
          { type: "fp", d: "M60 0L62.5 5.66987L68.6603 5L65 10L68.6603 15L62.5 14.3301L60 20L57.5 14.3301L51.3397 15L55 10L51.3397 5L57.5 5.66987L60 0Z", color: "#E32B1A" },
          { type: "fp", d: "M80 40L82.5 45.6699L88.6603 45L85 50L88.6603 55L82.5 54.3301L80 60L77.5 54.3301L71.3397 55L75 50L71.3397 45L77.5 45.6699L80 40Z", color: "#E32B1A" },
          { type: "fp", d: "M80 20L82.5 25.6699L88.6603 25L85 30L88.6603 35L82.5 34.3301L80 40L77.5 34.3301L71.3397 35L75 30L71.3397 25L77.5 25.6699L80 20Z", color: "#E32B1A" },
        ],
      },
    ],
    'U': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M160 70L160 90L140 90L140 70Z", color: "#5F1CEF" },
          { type: "fp", d: "M160 0L160 20L140 20L140 0Z", color: "#5F1CEF" },
          { type: "fp", d: "M20 0L20.000000000000004 20L3.552713678800501e-15 20L0 0Z", color: "#5F1CEF" },
          { type: "fp", d: "M20 70L20 90L0 90L0 70Z", color: "#5F1CEF" },
          { type: "fp", d: "M20 35L20 55L0 55L0 35Z", color: "#5F1CEF" },
          { type: "fp", d: "M160 35L160 55L140 55L140 35Z", color: "#5F1CEF" },
          { type: "fp", d: "M89.99999999999999 160L69.99999999999999 160L70 140L90 140Z", color: "#5F1CEF" },
          { type: "fp", d: "M128.66000000000003 144.282L111.33949192431126 154.282L101.33949192431126 136.96149192431125L118.66000000000003 126.96149192431125Z", color: "#5F1CEF" },
          { type: "fp", d: "M154.28200000000004 111.34L144.28200000000004 128.66050807568877L126.9614919243113 118.66050807568877L136.96149192431128 101.34Z", color: "#5F1CEF" },
          { type: "fp", d: "M48.66020000000001 154.28199999999998L31.33969192431124 144.28199999999998L41.33969192431124 126.96149192431122L58.66020000000001 136.96149192431122Z", color: "#5F1CEF" },
          { type: "fp", d: "M15.717799999999997 128.65999999999997L5.717799999999997 111.3394919243112L23.03830807568876 101.3394919243112L33.03830807568876 118.65999999999997Z", color: "#5F1CEF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 150.000000437114, cy: 79.999999562886, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000437114, cy: 79.999999562886, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 45.00005, cy: 140.62175000000002, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 115.00025000000001, cy: 140.62175000000002, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000655671, cy: 10.000000655671, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 150.000000655671, cy: 10.000000655671, r: 10, color: "#E32B1A" },
          { type: "sp", d: "M150 10L150 80C150 118.66 118.66 150 80 150C41.3401 150 10 118.66 10 80L10 9.99999", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 19.37785, cy: 114.99974999999999, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 140.62175000000002, cy: 114.99974999999999, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 80.000000655671, cy: 150.000000655671, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 150.000000655671, cy: 45.000000655671, r: 10, color: "#E32B1A" },
          { type: "fc", cx: 10.000000655671, cy: 45.000000655671, r: 10, color: "#E32B1A" },
        ],
      },
    ],
    'V': [
      {
        vb: { w: 184, h: 160 },
        ops: [
          { type: "sc", cx: 91.99999999999999, cy: 140, r: 15, sw: 10, color: "#F0850B" },
          { type: "sc", cx: 116.00000000000001, cy: 99.99999999999999, r: 15, sw: 10, color: "#F0850B" },
          { type: "sc", cx: 140, cy: 60, r: 15, sw: 10, color: "#F0850B" },
          { type: "sc", cx: 164, cy: 20, r: 15, sw: 10, color: "#F0850B" },
          { type: "sc", cx: 68.000001748456, cy: 100.000001748456, r: 15, sw: 10, color: "#F0850B" },
          { type: "sc", cx: 44.000001748456, cy: 60.000001748456, r: 15, sw: 10, color: "#F0850B" },
          { type: "sc", cx: 20.000001748456, cy: 20.000001748456, r: 15, sw: 10, color: "#F0850B" },
        ],
      },
      {
        vb: { w: 184, h: 160 },
        ops: [
          { type: "fc", cx: 91.99999999999999, cy: 140, r: 20, color: "#48DC2D" },
          { type: "fc", cx: 116.00000000000001, cy: 99.99999999999999, r: 20, color: "#48DC2D" },
          { type: "fc", cx: 140, cy: 60, r: 20, color: "#48DC2D" },
          { type: "fc", cx: 164, cy: 20, r: 20, color: "#48DC2D" },
          { type: "fc", cx: 68.000001748456, cy: 100.000001748456, r: 20, color: "#48DC2D" },
          { type: "fc", cx: 44.000001748456, cy: 60.000001748456, r: 20, color: "#48DC2D" },
          { type: "fc", cx: 20.000001748456, cy: 20.000001748456, r: 20, color: "#48DC2D" },
        ],
      },
    ],
    'W': [
      {
        vb: { w: 180, h: 164 },
        ops: [
          { type: "fr", x: 6, y: 0, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 6, y: 48, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M16 20L30.14213562373095 34.14213562373095L16.000000000000004 48.2842712474619L1.8578643762690525 34.14213562373095Z", color: "#48DC2D" },
          { type: "fr", x: 6, y: 96, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M16 68L30.142135623730955 82.14213562373095L16.000000000000014 96.2842712474619L1.857864376269056 82.14213562373095Z", color: "#48DC2D" },
          { type: "fr", x: 6, y: 144, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M16 116L30.14213562373095 130.14213562373095L16 144.2842712474619L1.857864376269049 130.14213562373095Z", color: "#48DC2D" },
          { type: "fr", x: 154.143, y: 0, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 154.143, y: 48, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M164.143 19.999999999999986L178.28513562373092 34.142135623730965L164.14299999999997 48.284271247461916L150.00086437626905 34.14213562373094Z", color: "#48DC2D" },
          { type: "fr", x: 154.143, y: 96, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M164.143 68L178.28513562373095 82.14213562373098L164.143 96.28427124746193L150.00086437626908 82.14213562373095Z", color: "#48DC2D" },
          { type: "fr", x: 154.143, y: 144, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 130, y: 110, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 30, y: 110, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 110, y: 62, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 80, y: 24, w: 20, h: 20, color: "#0055FF" },
          { type: "fr", x: 50, y: 62, w: 20, h: 20, color: "#0055FF" },
          { type: "fp", d: "M130.143 82L144.28513562373095 96.14213562373095L130.14299999999997 110.2842712474619L116.00086437626904 96.14213562373095Z", color: "#48DC2D" },
          { type: "fp", d: "M50.1426 82L64.28473562373095 96.14213562373095L50.142599999999995 110.2842712474619L36.00046437626904 96.14213562373095Z", color: "#48DC2D" },
          { type: "fp", d: "M110.143 34L124.28513562373095 48.14213562373095L110.143 62.2842712474619L96.00086437626905 48.14213562373095Z", color: "#48DC2D" },
          { type: "fp", d: "M70.1426 34.00000000000001L84.28473562373095 48.14213562373096L70.14260000000002 62.28427124746191L56.00046437626906 48.14213562373096Z", color: "#48DC2D" },
          { type: "fp", d: "M164.143 116.00000000000001L178.28513562373092 130.14213562373095L164.14299999999997 144.2842712474619L150.00086437626905 130.14213562373095Z", color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 180, h: 160 },
        ops: [
          { type: "fp", d: "M16 128L16.6699 131.218L17.6725 128.088L18.0024 131.358L19.3266 128.35L19.3129 131.636L20.9443 128.783L20.5871 132.05L22.5078 129.383L21.8111 132.595L24 130.144L22.9714 133.265L25.4046 131.056L24.0553 134.053L26.7061 132.11L25.051 134.949L27.8903 133.294L25.9475 135.945L28.9443 134.595L26.735 137.029L29.8564 136L27.4049 138.189L30.6167 137.492L27.9498 139.413L31.2169 139.056L28.3638 140.687L31.6504 140.673L28.6424 141.998L31.9123 142.328L28.7825 143.33L32 144L28.7825 144.67L31.9123 145.672L28.6424 146.002L31.6504 147.327L28.3638 147.313L31.2169 148.944L27.9498 148.587L30.6167 150.508L27.4049 149.811L29.8564 152L26.735 150.971L28.9443 153.405L25.9475 152.055L27.8903 154.706L25.051 153.051L26.7061 155.89L24.0553 153.947L25.4046 156.944L22.9714 154.735L24 157.856L21.8111 155.405L22.5078 158.617L20.5871 155.95L20.9443 159.217L19.3129 156.364L19.3266 159.65L18.0024 156.642L17.6725 159.912L16.6699 156.782L16 160L15.3301 156.782L14.3275 159.912L13.9976 156.642L12.6734 159.65L12.6871 156.364L11.0557 159.217L11.4129 155.95L9.49221 158.617L10.1889 155.405L8 157.856L9.02862 154.735L6.59544 156.944L7.9447 153.947L5.29391 155.89L6.94903 153.051L4.10968 154.706L6.05253 152.055L3.05573 153.405L5.26502 150.971L2.14359 152L4.59512 149.811L1.38327 150.508L4.05017 148.587L0.783095 148.944L3.63615 147.313L0.349638 147.327L3.35759 146.002L0.0876493 145.672L3.21754 144.67L0 144L3.21754 143.33L0.0876493 142.328L3.35759 141.998L0.349638 140.673L3.63615 140.687L0.783095 139.056L4.05017 139.413L1.38327 137.492L4.59512 138.189L2.14359 136L5.26502 137.029L3.05573 134.595L6.05253 135.945L4.10968 133.294L6.94903 134.949L5.29391 132.11L7.9447 134.053L6.59544 131.056L9.02862 133.265L8 130.144L10.1889 132.595L9.49221 129.383L11.4129 132.05L11.0557 128.783L12.6871 131.636L12.6734 128.35L13.9976 131.358L14.3275 128.088L15.3301 131.218L16 128Z", color: "#5F1CEF" },
          { type: "fp", d: "M16 96L16.6699 99.2176L17.6725 96.0877L18.0024 99.3576L19.3266 96.3497L19.3129 99.6362L20.9443 96.7831L20.5871 100.05L22.5078 97.3833L21.8111 100.595L24 98.1436L22.9714 101.265L25.4046 99.0557L24.0553 102.053L26.7061 100.11L25.051 102.949L27.8903 101.294L25.9475 103.945L28.9443 102.595L26.735 105.029L29.8564 104L27.4049 106.189L30.6167 105.492L27.9498 107.413L31.2169 107.056L28.3638 108.687L31.6504 108.673L28.6424 109.998L31.9123 110.328L28.7825 111.33L32 112L28.7825 112.67L31.9123 113.672L28.6424 114.002L31.6504 115.327L28.3638 115.313L31.2169 116.944L27.9498 116.587L30.6167 118.508L27.4049 117.811L29.8564 120L26.735 118.971L28.9443 121.405L25.9475 120.055L27.8903 122.706L25.051 121.051L26.7061 123.89L24.0553 121.947L25.4046 124.944L22.9714 122.735L24 125.856L21.8111 123.405L22.5078 126.617L20.5871 123.95L20.9443 127.217L19.3129 124.364L19.3266 127.65L18.0024 124.642L17.6725 127.912L16.6699 124.782L16 128L15.3301 124.782L14.3275 127.912L13.9976 124.642L12.6734 127.65L12.6871 124.364L11.0557 127.217L11.4129 123.95L9.49221 126.617L10.1889 123.405L8 125.856L9.02862 122.735L6.59544 124.944L7.9447 121.947L5.29391 123.89L6.94903 121.051L4.10968 122.706L6.05253 120.055L3.05573 121.405L5.26502 118.971L2.14359 120L4.59512 117.811L1.38327 118.508L4.05017 116.587L0.783095 116.944L3.63615 115.313L0.349638 115.327L3.35759 114.002L0.0876493 113.672L3.21754 112.67L0 112L3.21754 111.33L0.0876493 110.328L3.35759 109.998L0.349638 108.673L3.63615 108.687L0.783095 107.056L4.05017 107.413L1.38327 105.492L4.59512 106.189L2.14359 104L5.26502 105.029L3.05573 102.595L6.05253 103.945L4.10968 101.294L6.94903 102.949L5.29391 100.11L7.9447 102.053L6.59544 99.0557L9.02862 101.265L8 98.1436L10.1889 100.595L9.49221 97.3833L11.4129 100.05L11.0557 96.7831L12.6871 99.6362L12.6734 96.3497L13.9976 99.3576L14.3275 96.0877L15.3301 99.2176L16 96Z", color: "#5F1CEF" },
          { type: "fp", d: "M16 64L16.6699 67.2176L17.6725 64.0877L18.0024 67.3576L19.3266 64.3497L19.3129 67.6362L20.9443 64.7831L20.5871 68.0502L22.5078 65.3833L21.8111 68.5951L24 66.1436L22.9714 69.265L25.4046 67.0557L24.0553 70.0525L26.7061 68.1097L25.051 70.949L27.8903 69.2939L25.9475 71.9447L28.9443 70.5955L26.735 73.0286L29.8564 72L27.4049 74.1889L30.6167 73.4922L27.9498 75.4129L31.2169 75.0557L28.3638 76.6871L31.6504 76.6734L28.6424 77.9977L31.9123 78.3276L28.7825 79.3301L32 80L28.7825 80.6699L31.9123 81.6725L28.6424 82.0024L31.6504 83.3266L28.3638 83.3129L31.2169 84.9443L27.9498 84.5871L30.6167 86.5078L27.4049 85.8111L29.8564 88L26.735 86.9714L28.9443 89.4046L25.9475 88.0553L27.8903 90.7061L25.051 89.051L26.7061 91.8903L24.0553 89.9475L25.4046 92.9443L22.9714 90.735L24 93.8564L21.8111 91.4049L22.5078 94.6167L20.5871 91.9498L20.9443 95.2169L19.3129 92.3639L19.3266 95.6504L18.0024 92.6424L17.6725 95.9124L16.6699 92.7825L16 96L15.3301 92.7825L14.3275 95.9124L13.9976 92.6424L12.6734 95.6504L12.6871 92.3639L11.0557 95.2169L11.4129 91.9498L9.49221 94.6167L10.1889 91.4049L8 93.8564L9.02862 90.735L6.59544 92.9443L7.9447 89.9475L5.29391 91.8903L6.94903 89.051L4.10968 90.7061L6.05253 88.0553L3.05573 89.4046L5.26502 86.9714L2.14359 88L4.59512 85.8111L1.38327 86.5078L4.05017 84.5871L0.783095 84.9443L3.63615 83.3129L0.349638 83.3266L3.35759 82.0024L0.0876493 81.6725L3.21754 80.6699L0 80L3.21754 79.3301L0.0876493 78.3276L3.35759 77.9977L0.349638 76.6734L3.63615 76.6871L0.783095 75.0557L4.05017 75.4129L1.38327 73.4922L4.59512 74.1889L2.14359 72L5.26502 73.0286L3.05573 70.5955L6.05253 71.9447L4.10968 69.2939L6.94903 70.949L5.29391 68.1097L7.9447 70.0525L6.59544 67.0557L9.02862 69.265L8 66.1436L10.1889 68.5951L9.49221 65.3833L11.4129 68.0502L11.0557 64.7831L12.6871 67.6362L12.6734 64.3497L13.9976 67.3576L14.3275 64.0877L15.3301 67.2176L16 64Z", color: "#5F1CEF" },
          { type: "fp", d: "M16 32L16.6699 35.2176L17.6725 32.0877L18.0024 35.3576L19.3266 32.3497L19.3129 35.6362L20.9443 32.7831L20.5871 36.0502L22.5078 33.3833L21.8111 36.5951L24 34.1436L22.9714 37.265L25.4046 35.0557L24.0553 38.0525L26.7061 36.1097L25.051 38.949L27.8903 37.2939L25.9475 39.9447L28.9443 38.5955L26.735 41.0286L29.8564 40L27.4049 42.1889L30.6167 41.4922L27.9498 43.4129L31.2169 43.0557L28.3638 44.6871L31.6504 44.6734L28.6424 45.9977L31.9123 46.3276L28.7825 47.3301L32 48L28.7825 48.6699L31.9123 49.6725L28.6424 50.0024L31.6504 51.3266L28.3638 51.3129L31.2169 52.9443L27.9498 52.5871L30.6167 54.5078L27.4049 53.8111L29.8564 56L26.735 54.9714L28.9443 57.4046L25.9475 56.0553L27.8903 58.7061L25.051 57.051L26.7061 59.8903L24.0553 57.9475L25.4046 60.9443L22.9714 58.735L24 61.8564L21.8111 59.4049L22.5078 62.6167L20.5871 59.9498L20.9443 63.2169L19.3129 60.3639L19.3266 63.6504L18.0024 60.6424L17.6725 63.9124L16.6699 60.7825L16 64L15.3301 60.7825L14.3275 63.9124L13.9976 60.6424L12.6734 63.6504L12.6871 60.3639L11.0557 63.2169L11.4129 59.9498L9.49221 62.6167L10.1889 59.4049L8 61.8564L9.02862 58.735L6.59544 60.9443L7.9447 57.9475L5.29391 59.8903L6.94903 57.051L4.10968 58.7061L6.05253 56.0553L3.05573 57.4046L5.26502 54.9714L2.14359 56L4.59512 53.8111L1.38327 54.5078L4.05017 52.5871L0.783095 52.9443L3.63615 51.3129L0.349638 51.3266L3.35759 50.0024L0.0876493 49.6725L3.21754 48.6699L0 48L3.21754 47.3301L0.0876493 46.3276L3.35759 45.9977L0.349638 44.6734L3.63615 44.6871L0.783095 43.0557L4.05017 43.4129L1.38327 41.4922L4.59512 42.1889L2.14359 40L5.26502 41.0286L3.05573 38.5955L6.05253 39.9447L4.10968 37.2939L6.94903 38.949L5.29391 36.1097L7.9447 38.0525L6.59544 35.0557L9.02862 37.265L8 34.1436L10.1889 36.5951L9.49221 33.3833L11.4129 36.0502L11.0557 32.7831L12.6871 35.6362L12.6734 32.3497L13.9976 35.3576L14.3275 32.0877L15.3301 35.2176L16 32Z", color: "#5F1CEF" },
          { type: "fp", d: "M16 1.57361e-05L16.6699 3.21756L17.6725 0.0876651L18.0024 3.3576L19.3266 0.349654L19.3129 3.63617L20.9443 0.783111L20.5871 4.05019L22.5078 1.38329L21.8111 4.59513L24 2.14361L22.9714 5.26503L25.4046 3.05574L24.0553 6.05255L26.7061 4.1097L25.051 6.94905L27.8903 5.29393L25.9475 7.94472L28.9443 6.59545L26.735 9.02864L29.8564 8.00002L27.4049 10.1889L30.6167 9.49223L27.9498 11.4129L31.2169 11.0557L28.3638 12.6871L31.6504 12.6734L28.6424 13.9977L31.9123 14.3276L28.7825 15.3301L32 16L28.7825 16.6699L31.9123 17.6725L28.6424 18.0024L31.6504 19.3266L28.3638 19.3129L31.2169 20.9443L27.9498 20.5871L30.6167 22.5078L27.4049 21.8111L29.8564 24L26.735 22.9714L28.9443 25.4046L25.9475 24.0553L27.8903 26.7061L25.051 25.051L26.7061 27.8903L24.0553 25.9475L25.4046 28.9443L22.9714 26.735L24 29.8564L21.8111 27.4049L22.5078 30.6167L20.5871 27.9498L20.9443 31.2169L19.3129 28.3639L19.3266 31.6504L18.0024 28.6424L17.6725 31.9124L16.6699 28.7825L16 32L15.3301 28.7825L14.3275 31.9124L13.9976 28.6424L12.6734 31.6504L12.6871 28.3639L11.0557 31.2169L11.4129 27.9498L9.49221 30.6167L10.1889 27.4049L8 29.8564L9.02862 26.735L6.59544 28.9443L7.9447 25.9475L5.29391 27.8903L6.94903 25.051L4.10968 26.7061L6.05253 24.0553L3.05573 25.4046L5.26502 22.9714L2.14359 24L4.59512 21.8111L1.38327 22.5078L4.05017 20.5871L0.783095 20.9443L3.63615 19.3129L0.349638 19.3266L3.35759 18.0024L0.0876493 17.6725L3.21754 16.6699L0 16L3.21754 15.3301L0.0876493 14.3276L3.35759 13.9977L0.349638 12.6734L3.63615 12.6871L0.783095 11.0557L4.05017 11.4129L1.38327 9.49223L4.59512 10.1889L2.14359 8.00002L5.26502 9.02864L3.05573 6.59545L6.05253 7.94472L4.10968 5.29393L6.94903 6.94905L5.29391 4.1097L7.9447 6.05255L6.59544 3.05574L9.02862 5.26503L8 2.14361L10.1889 4.59513L9.49221 1.38329L11.4129 4.05019L11.0557 0.783111L12.6871 3.63617L12.6734 0.349654L13.9976 3.3576L14.3275 0.0876651L15.3301 3.21756L16 1.57361e-05Z", color: "#5F1CEF" },
          { type: "fp", d: "M90 16L90.6699 19.2176L91.6725 16.0877L92.0024 19.3576L93.3266 16.3497L93.3129 19.6362L94.9443 16.7831L94.5871 20.0502L96.5078 17.3833L95.8111 20.5951L98 18.1436L96.9714 21.265L99.4046 19.0557L98.0553 22.0525L100.706 20.1097L99.051 22.949L101.89 21.2939L99.9475 23.9447L102.944 22.5955L100.735 25.0286L103.856 24L101.405 26.1889L104.617 25.4922L101.95 27.4129L105.217 27.0557L102.364 28.6871L105.65 28.6734L102.642 29.9977L105.912 30.3276L102.782 31.3301L106 32L102.782 32.6699L105.912 33.6725L102.642 34.0024L105.65 35.3266L102.364 35.3129L105.217 36.9443L101.95 36.5871L104.617 38.5078L101.405 37.8111L103.856 40L100.735 38.9714L102.944 41.4046L99.9475 40.0553L101.89 42.7061L99.051 41.051L100.706 43.8903L98.0553 41.9475L99.4046 44.9443L96.9714 42.735L98 45.8564L95.8111 43.4049L96.5078 46.6167L94.5871 43.9498L94.9443 47.2169L93.3129 44.3639L93.3266 47.6504L92.0024 44.6424L91.6725 47.9124L90.6699 44.7825L90 48L89.3301 44.7825L88.3275 47.9124L87.9976 44.6424L86.6734 47.6504L86.6871 44.3639L85.0557 47.2169L85.4129 43.9498L83.4922 46.6167L84.1889 43.4049L82 45.8564L83.0286 42.735L80.5954 44.9443L81.9447 41.9475L79.2939 43.8903L80.949 41.051L78.1097 42.7061L80.0525 40.0553L77.0557 41.4046L79.265 38.9714L76.1436 40L78.5951 37.8111L75.3833 38.5078L78.0502 36.5871L74.7831 36.9443L77.6361 35.3129L74.3496 35.3266L77.3576 34.0024L74.0876 33.6725L77.2175 32.6699L74 32L77.2175 31.3301L74.0876 30.3276L77.3576 29.9977L74.3496 28.6734L77.6361 28.6871L74.7831 27.0557L78.0502 27.4129L75.3833 25.4922L78.5951 26.1889L76.1436 24L79.265 25.0286L77.0557 22.5955L80.0525 23.9447L78.1097 21.2939L80.949 22.949L79.2939 20.1097L81.9447 22.0525L80.5954 19.0557L83.0286 21.265L82 18.1436L84.1889 20.5951L83.4922 17.3833L85.4129 20.0502L85.0557 16.7831L86.6871 19.6362L86.6734 16.3497L87.9976 19.3576L88.3275 16.0877L89.3301 19.2176L90 16Z", color: "#5F1CEF" },
          { type: "fp", d: "M70 48L70.6699 51.2176L71.6725 48.0877L72.0024 51.3576L73.3266 48.3497L73.3129 51.6362L74.9443 48.7831L74.5871 52.0502L76.5078 49.3833L75.8111 52.5951L78 50.1436L76.9714 53.265L79.4046 51.0557L78.0553 54.0525L80.7061 52.1097L79.051 54.949L81.8903 53.2939L79.9475 55.9447L82.9443 54.5955L80.735 57.0286L83.8564 56L81.4049 58.1889L84.6167 57.4922L81.9498 59.4129L85.2169 59.0557L82.3638 60.6871L85.6504 60.6734L82.6424 61.9977L85.9123 62.3276L82.7825 63.3301L86 64L82.7825 64.6699L85.9123 65.6725L82.6424 66.0024L85.6504 67.3266L82.3638 67.3129L85.2169 68.9443L81.9498 68.5871L84.6167 70.5078L81.4049 69.8111L83.8564 72L80.735 70.9714L82.9443 73.4046L79.9475 72.0553L81.8903 74.7061L79.051 73.051L80.7061 75.8903L78.0553 73.9475L79.4046 76.9443L76.9714 74.735L78 77.8564L75.8111 75.4049L76.5078 78.6167L74.5871 75.9498L74.9443 79.2169L73.3129 76.3639L73.3266 79.6504L72.0024 76.6424L71.6725 79.9124L70.6699 76.7825L70 80L69.3301 76.7825L68.3275 79.9124L67.9976 76.6424L66.6734 79.6504L66.6871 76.3639L65.0557 79.2169L65.4129 75.9498L63.4922 78.6167L64.1889 75.4049L62 77.8564L63.0286 74.735L60.5954 76.9443L61.9447 73.9475L59.2939 75.8903L60.949 73.051L58.1097 74.7061L60.0525 72.0553L57.0557 73.4046L59.265 70.9714L56.1436 72L58.5951 69.8111L55.3833 70.5078L58.0502 68.5871L54.7831 68.9443L57.6361 67.3129L54.3496 67.3266L57.3576 66.0024L54.0876 65.6725L57.2175 64.6699L54 64L57.2175 63.3301L54.0876 62.3276L57.3576 61.9977L54.3496 60.6734L57.6361 60.6871L54.7831 59.0557L58.0502 59.4129L55.3833 57.4922L58.5951 58.1889L56.1436 56L59.265 57.0286L57.0557 54.5955L60.0525 55.9447L58.1097 53.2939L60.949 54.949L59.2939 52.1097L61.9447 54.0525L60.5954 51.0557L63.0286 53.265L62 50.1436L64.1889 52.5951L63.4922 49.3833L65.4129 52.0502L65.0557 48.7831L66.6871 51.6362L66.6734 48.3497L67.9976 51.3576L68.3275 48.0877L69.3301 51.2176L70 48Z", color: "#5F1CEF" },
          { type: "fp", d: "M110 48L110.67 51.2176L111.672 48.0877L112.002 51.3576L113.327 48.3497L113.313 51.6362L114.944 48.7831L114.587 52.0502L116.508 49.3833L115.811 52.5951L118 50.1436L116.971 53.265L119.405 51.0557L118.055 54.0525L120.706 52.1097L119.051 54.949L121.89 53.2939L119.947 55.9447L122.944 54.5955L120.735 57.0286L123.856 56L121.405 58.1889L124.617 57.4922L121.95 59.4129L125.217 59.0557L122.364 60.6871L125.65 60.6734L122.642 61.9977L125.912 62.3276L122.782 63.3301L126 64L122.782 64.6699L125.912 65.6725L122.642 66.0024L125.65 67.3266L122.364 67.3129L125.217 68.9443L121.95 68.5871L124.617 70.5078L121.405 69.8111L123.856 72L120.735 70.9714L122.944 73.4046L119.947 72.0553L121.89 74.7061L119.051 73.051L120.706 75.8903L118.055 73.9475L119.405 76.9443L116.971 74.735L118 77.8564L115.811 75.4049L116.508 78.6167L114.587 75.9498L114.944 79.2169L113.313 76.3639L113.327 79.6504L112.002 76.6424L111.672 79.9124L110.67 76.7825L110 80L109.33 76.7825L108.328 79.9124L107.998 76.6424L106.673 79.6504L106.687 76.3639L105.056 79.2169L105.413 75.9498L103.492 78.6167L104.189 75.4049L102 77.8564L103.029 74.735L100.595 76.9443L101.945 73.9475L99.2939 75.8903L100.949 73.051L98.1097 74.7061L100.053 72.0553L97.0557 73.4046L99.265 70.9714L96.1436 72L98.5951 69.8111L95.3833 70.5078L98.0502 68.5871L94.7831 68.9443L97.6361 67.3129L94.3496 67.3266L97.3576 66.0024L94.0876 65.6725L97.2175 64.6699L94 64L97.2175 63.3301L94.0876 62.3276L97.3576 61.9977L94.3496 60.6734L97.6361 60.6871L94.7831 59.0557L98.0502 59.4129L95.3833 57.4922L98.5951 58.1889L96.1436 56L99.265 57.0286L97.0557 54.5955L100.053 55.9447L98.1097 53.2939L100.949 54.949L99.2939 52.1097L101.945 54.0525L100.595 51.0557L103.029 53.265L102 50.1436L104.189 52.5951L103.492 49.3833L105.413 52.0502L105.056 48.7831L106.687 51.6362L106.673 48.3497L107.998 51.3576L108.328 48.0877L109.33 51.2176L110 48Z", color: "#5F1CEF" },
          { type: "fp", d: "M49 80L49.6699 83.2176L50.6725 80.0877L51.0024 83.3576L52.3266 80.3497L52.3129 83.6362L53.9443 80.7831L53.5871 84.0502L55.5078 81.3833L54.8111 84.5951L57 82.1436L55.9714 85.265L58.4046 83.0557L57.0553 86.0525L59.7061 84.1097L58.051 86.949L60.8903 85.2939L58.9475 87.9447L61.9443 86.5955L59.735 89.0286L62.8564 88L60.4049 90.1889L63.6167 89.4922L60.9498 91.4129L64.2169 91.0557L61.3638 92.6871L64.6504 92.6734L61.6424 93.9977L64.9123 94.3276L61.7825 95.3301L65 96L61.7825 96.6699L64.9123 97.6725L61.6424 98.0024L64.6504 99.3266L61.3638 99.3129L64.2169 100.944L60.9498 100.587L63.6167 102.508L60.4049 101.811L62.8564 104L59.735 102.971L61.9443 105.405L58.9475 104.055L60.8903 106.706L58.051 105.051L59.7061 107.89L57.0553 105.947L58.4046 108.944L55.9714 106.735L57 109.856L54.8111 107.405L55.5078 110.617L53.5871 107.95L53.9443 111.217L52.3129 108.364L52.3266 111.65L51.0024 108.642L50.6725 111.912L49.6699 108.782L49 112L48.3301 108.782L47.3275 111.912L46.9976 108.642L45.6734 111.65L45.6871 108.364L44.0557 111.217L44.4129 107.95L42.4922 110.617L43.1889 107.405L41 109.856L42.0286 106.735L39.5954 108.944L40.9447 105.947L38.2939 107.89L39.949 105.051L37.1097 106.706L39.0525 104.055L36.0557 105.405L38.265 102.971L35.1436 104L37.5951 101.811L34.3833 102.508L37.0502 100.587L33.7831 100.944L36.6361 99.3129L33.3496 99.3266L36.3576 98.0024L33.0876 97.6725L36.2175 96.6699L33 96L36.2175 95.3301L33.0876 94.3276L36.3576 93.9977L33.3496 92.6734L36.6361 92.6871L33.7831 91.0557L37.0502 91.4129L34.3833 89.4922L37.5951 90.1889L35.1436 88L38.265 89.0286L36.0557 86.5955L39.0525 87.9447L37.1097 85.2939L39.949 86.949L38.2939 84.1097L40.9447 86.0525L39.5954 83.0557L42.0286 85.265L41 82.1436L43.1889 84.5951L42.4922 81.3833L44.4129 84.0502L44.0557 80.7831L45.6871 83.6362L45.6734 80.3497L46.9976 83.3576L47.3275 80.0877L48.3301 83.2176L49 80Z", color: "#5F1CEF" },
          { type: "fp", d: "M131 80L131.67 83.2176L132.672 80.0877L133.002 83.3576L134.327 80.3497L134.313 83.6362L135.944 80.7831L135.587 84.0502L137.508 81.3833L136.811 84.5951L139 82.1436L137.971 85.265L140.405 83.0557L139.055 86.0525L141.706 84.1097L140.051 86.949L142.89 85.2939L140.947 87.9447L143.944 86.5955L141.735 89.0286L144.856 88L142.405 90.1889L145.617 89.4922L142.95 91.4129L146.217 91.0557L143.364 92.6871L146.65 92.6734L143.642 93.9977L146.912 94.3276L143.782 95.3301L147 96L143.782 96.6699L146.912 97.6725L143.642 98.0024L146.65 99.3266L143.364 99.3129L146.217 100.944L142.95 100.587L145.617 102.508L142.405 101.811L144.856 104L141.735 102.971L143.944 105.405L140.947 104.055L142.89 106.706L140.051 105.051L141.706 107.89L139.055 105.947L140.405 108.944L137.971 106.735L139 109.856L136.811 107.405L137.508 110.617L135.587 107.95L135.944 111.217L134.313 108.364L134.327 111.65L133.002 108.642L132.672 111.912L131.67 108.782L131 112L130.33 108.782L129.328 111.912L128.998 108.642L127.673 111.65L127.687 108.364L126.056 111.217L126.413 107.95L124.492 110.617L125.189 107.405L123 109.856L124.029 106.735L121.595 108.944L122.945 105.947L120.294 107.89L121.949 105.051L119.11 106.706L121.053 104.055L118.056 105.405L120.265 102.971L117.144 104L119.595 101.811L116.383 102.508L119.05 100.587L115.783 100.944L118.636 99.3129L115.35 99.3266L118.358 98.0024L115.088 97.6725L118.218 96.6699L115 96L118.218 95.3301L115.088 94.3276L118.358 93.9977L115.35 92.6734L118.636 92.6871L115.783 91.0557L119.05 91.4129L116.383 89.4922L119.595 90.1889L117.144 88L120.265 89.0286L118.056 86.5955L121.053 87.9447L119.11 85.2939L121.949 86.949L120.294 84.1097L122.945 86.0525L121.595 83.0557L124.029 85.265L123 82.1436L125.189 84.5951L124.492 81.3833L126.413 84.0502L126.056 80.7831L127.687 83.6362L127.673 80.3497L128.998 83.3576L129.328 80.0877L130.33 83.2176L131 80Z", color: "#5F1CEF" },
          { type: "fp", d: "M164 128L164.67 131.218L165.672 128.088L166.002 131.358L167.327 128.35L167.313 131.636L168.944 128.783L168.587 132.05L170.508 129.383L169.811 132.595L172 130.144L170.971 133.265L173.405 131.056L172.055 134.053L174.706 132.11L173.051 134.949L175.89 133.294L173.947 135.945L176.944 134.595L174.735 137.029L177.856 136L175.405 138.189L178.617 137.492L175.95 139.413L179.217 139.056L176.364 140.687L179.65 140.673L176.642 141.998L179.912 142.328L176.782 143.33L180 144L176.782 144.67L179.912 145.672L176.642 146.002L179.65 147.327L176.364 147.313L179.217 148.944L175.95 148.587L178.617 150.508L175.405 149.811L177.856 152L174.735 150.971L176.944 153.405L173.947 152.055L175.89 154.706L173.051 153.051L174.706 155.89L172.055 153.947L173.405 156.944L170.971 154.735L172 157.856L169.811 155.405L170.508 158.617L168.587 155.95L168.944 159.217L167.313 156.364L167.327 159.65L166.002 156.642L165.672 159.912L164.67 156.782L164 160L163.33 156.782L162.328 159.912L161.998 156.642L160.673 159.65L160.687 156.364L159.056 159.217L159.413 155.95L157.492 158.617L158.189 155.405L156 157.856L157.029 154.735L154.595 156.944L155.945 153.947L153.294 155.89L154.949 153.051L152.11 154.706L154.053 152.055L151.056 153.405L153.265 150.971L150.144 152L152.595 149.811L149.383 150.508L152.05 148.587L148.783 148.944L151.636 147.313L148.35 147.327L151.358 146.002L148.088 145.672L151.218 144.67L148 144L151.218 143.33L148.088 142.328L151.358 141.998L148.35 140.673L151.636 140.687L148.783 139.056L152.05 139.413L149.383 137.492L152.595 138.189L150.144 136L153.265 137.029L151.056 134.595L154.053 135.945L152.11 133.294L154.949 134.949L153.294 132.11L155.945 134.053L154.595 131.056L157.029 133.265L156 130.144L158.189 132.595L157.492 129.383L159.413 132.05L159.056 128.783L160.687 131.636L160.673 128.35L161.998 131.358L162.328 128.088L163.33 131.218L164 128Z", color: "#5F1CEF" },
          { type: "fp", d: "M164 96L164.67 99.2176L165.672 96.0877L166.002 99.3576L167.327 96.3497L167.313 99.6362L168.944 96.7831L168.587 100.05L170.508 97.3833L169.811 100.595L172 98.1436L170.971 101.265L173.405 99.0557L172.055 102.053L174.706 100.11L173.051 102.949L175.89 101.294L173.947 103.945L176.944 102.595L174.735 105.029L177.856 104L175.405 106.189L178.617 105.492L175.95 107.413L179.217 107.056L176.364 108.687L179.65 108.673L176.642 109.998L179.912 110.328L176.782 111.33L180 112L176.782 112.67L179.912 113.672L176.642 114.002L179.65 115.327L176.364 115.313L179.217 116.944L175.95 116.587L178.617 118.508L175.405 117.811L177.856 120L174.735 118.971L176.944 121.405L173.947 120.055L175.89 122.706L173.051 121.051L174.706 123.89L172.055 121.947L173.405 124.944L170.971 122.735L172 125.856L169.811 123.405L170.508 126.617L168.587 123.95L168.944 127.217L167.313 124.364L167.327 127.65L166.002 124.642L165.672 127.912L164.67 124.782L164 128L163.33 124.782L162.328 127.912L161.998 124.642L160.673 127.65L160.687 124.364L159.056 127.217L159.413 123.95L157.492 126.617L158.189 123.405L156 125.856L157.029 122.735L154.595 124.944L155.945 121.947L153.294 123.89L154.949 121.051L152.11 122.706L154.053 120.055L151.056 121.405L153.265 118.971L150.144 120L152.595 117.811L149.383 118.508L152.05 116.587L148.783 116.944L151.636 115.313L148.35 115.327L151.358 114.002L148.088 113.672L151.218 112.67L148 112L151.218 111.33L148.088 110.328L151.358 109.998L148.35 108.673L151.636 108.687L148.783 107.056L152.05 107.413L149.383 105.492L152.595 106.189L150.144 104L153.265 105.029L151.056 102.595L154.053 103.945L152.11 101.294L154.949 102.949L153.294 100.11L155.945 102.053L154.595 99.0557L157.029 101.265L156 98.1436L158.189 100.595L157.492 97.3833L159.413 100.05L159.056 96.7831L160.687 99.6362L160.673 96.3497L161.998 99.3576L162.328 96.0877L163.33 99.2176L164 96Z", color: "#5F1CEF" },
          { type: "fp", d: "M164 64L164.67 67.2176L165.672 64.0877L166.002 67.3576L167.327 64.3497L167.313 67.6362L168.944 64.7831L168.587 68.0502L170.508 65.3833L169.811 68.5951L172 66.1436L170.971 69.265L173.405 67.0557L172.055 70.0525L174.706 68.1097L173.051 70.949L175.89 69.2939L173.947 71.9447L176.944 70.5955L174.735 73.0286L177.856 72L175.405 74.1889L178.617 73.4922L175.95 75.4129L179.217 75.0557L176.364 76.6871L179.65 76.6734L176.642 77.9977L179.912 78.3276L176.782 79.3301L180 80L176.782 80.6699L179.912 81.6725L176.642 82.0024L179.65 83.3266L176.364 83.3129L179.217 84.9443L175.95 84.5871L178.617 86.5078L175.405 85.8111L177.856 88L174.735 86.9714L176.944 89.4046L173.947 88.0553L175.89 90.7061L173.051 89.051L174.706 91.8903L172.055 89.9475L173.405 92.9443L170.971 90.735L172 93.8564L169.811 91.4049L170.508 94.6167L168.587 91.9498L168.944 95.2169L167.313 92.3639L167.327 95.6504L166.002 92.6424L165.672 95.9124L164.67 92.7825L164 96L163.33 92.7825L162.328 95.9124L161.998 92.6424L160.673 95.6504L160.687 92.3639L159.056 95.2169L159.413 91.9498L157.492 94.6167L158.189 91.4049L156 93.8564L157.029 90.735L154.595 92.9443L155.945 89.9475L153.294 91.8903L154.949 89.051L152.11 90.7061L154.053 88.0553L151.056 89.4046L153.265 86.9714L150.144 88L152.595 85.8111L149.383 86.5078L152.05 84.5871L148.783 84.9443L151.636 83.3129L148.35 83.3266L151.358 82.0024L148.088 81.6725L151.218 80.6699L148 80L151.218 79.3301L148.088 78.3276L151.358 77.9977L148.35 76.6734L151.636 76.6871L148.783 75.0557L152.05 75.4129L149.383 73.4922L152.595 74.1889L150.144 72L153.265 73.0286L151.056 70.5955L154.053 71.9447L152.11 69.2939L154.949 70.949L153.294 68.1097L155.945 70.0525L154.595 67.0557L157.029 69.265L156 66.1436L158.189 68.5951L157.492 65.3833L159.413 68.0502L159.056 64.7831L160.687 67.6362L160.673 64.3497L161.998 67.3576L162.328 64.0877L163.33 67.2176L164 64Z", color: "#5F1CEF" },
          { type: "fp", d: "M164 32L164.67 35.2176L165.672 32.0877L166.002 35.3576L167.327 32.3497L167.313 35.6362L168.944 32.7831L168.587 36.0502L170.508 33.3833L169.811 36.5951L172 34.1436L170.971 37.265L173.405 35.0557L172.055 38.0525L174.706 36.1097L173.051 38.949L175.89 37.2939L173.947 39.9447L176.944 38.5955L174.735 41.0286L177.856 40L175.405 42.1889L178.617 41.4922L175.95 43.4129L179.217 43.0557L176.364 44.6871L179.65 44.6734L176.642 45.9977L179.912 46.3276L176.782 47.3301L180 48L176.782 48.6699L179.912 49.6725L176.642 50.0024L179.65 51.3266L176.364 51.3129L179.217 52.9443L175.95 52.5871L178.617 54.5078L175.405 53.8111L177.856 56L174.735 54.9714L176.944 57.4046L173.947 56.0553L175.89 58.7061L173.051 57.051L174.706 59.8903L172.055 57.9475L173.405 60.9443L170.971 58.735L172 61.8564L169.811 59.4049L170.508 62.6167L168.587 59.9498L168.944 63.2169L167.313 60.3639L167.327 63.6504L166.002 60.6424L165.672 63.9124L164.67 60.7825L164 64L163.33 60.7825L162.328 63.9124L161.998 60.6424L160.673 63.6504L160.687 60.3639L159.056 63.2169L159.413 59.9498L157.492 62.6167L158.189 59.4049L156 61.8564L157.029 58.735L154.595 60.9443L155.945 57.9475L153.294 59.8903L154.949 57.051L152.11 58.7061L154.053 56.0553L151.056 57.4046L153.265 54.9714L150.144 56L152.595 53.8111L149.383 54.5078L152.05 52.5871L148.783 52.9443L151.636 51.3129L148.35 51.3266L151.358 50.0024L148.088 49.6725L151.218 48.6699L148 48L151.218 47.3301L148.088 46.3276L151.358 45.9977L148.35 44.6734L151.636 44.6871L148.783 43.0557L152.05 43.4129L149.383 41.4922L152.595 42.1889L150.144 40L153.265 41.0286L151.056 38.5955L154.053 39.9447L152.11 37.2939L154.949 38.949L153.294 36.1097L155.945 38.0525L154.595 35.0557L157.029 37.265L156 34.1436L158.189 36.5951L157.492 33.3833L159.413 36.0502L159.056 32.7831L160.687 35.6362L160.673 32.3497L161.998 35.3576L162.328 32.0877L163.33 35.2176L164 32Z", color: "#5F1CEF" },
          { type: "fp", d: "M164 1.57361e-05L164.67 3.21756L165.672 0.0876651L166.002 3.3576L167.327 0.349654L167.313 3.63617L168.944 0.783111L168.587 4.05019L170.508 1.38329L169.811 4.59513L172 2.14361L170.971 5.26503L173.405 3.05574L172.055 6.05255L174.706 4.1097L173.051 6.94905L175.89 5.29393L173.947 7.94472L176.944 6.59545L174.735 9.02864L177.856 8.00002L175.405 10.1889L178.617 9.49223L175.95 11.4129L179.217 11.0557L176.364 12.6871L179.65 12.6734L176.642 13.9977L179.912 14.3276L176.782 15.3301L180 16L176.782 16.6699L179.912 17.6725L176.642 18.0024L179.65 19.3266L176.364 19.3129L179.217 20.9443L175.95 20.5871L178.617 22.5078L175.405 21.8111L177.856 24L174.735 22.9714L176.944 25.4046L173.947 24.0553L175.89 26.7061L173.051 25.051L174.706 27.8903L172.055 25.9475L173.405 28.9443L170.971 26.735L172 29.8564L169.811 27.4049L170.508 30.6167L168.587 27.9498L168.944 31.2169L167.313 28.3639L167.327 31.6504L166.002 28.6424L165.672 31.9124L164.67 28.7825L164 32L163.33 28.7825L162.328 31.9124L161.998 28.6424L160.673 31.6504L160.687 28.3639L159.056 31.2169L159.413 27.9498L157.492 30.6167L158.189 27.4049L156 29.8564L157.029 26.735L154.595 28.9443L155.945 25.9475L153.294 27.8903L154.949 25.051L152.11 26.7061L154.053 24.0553L151.056 25.4046L153.265 22.9714L150.144 24L152.595 21.8111L149.383 22.5078L152.05 20.5871L148.783 20.9443L151.636 19.3129L148.35 19.3266L151.358 18.0024L148.088 17.6725L151.218 16.6699L148 16L151.218 15.3301L148.088 14.3276L151.358 13.9977L148.35 12.6734L151.636 12.6871L148.783 11.0557L152.05 11.4129L149.383 9.49223L152.595 10.1889L150.144 8.00002L153.265 9.02864L151.056 6.59545L154.053 7.94472L152.11 5.29393L154.949 6.94905L153.294 4.1097L155.945 6.05255L154.595 3.05574L157.029 5.26503L156 2.14361L158.189 4.59513L157.492 1.38329L159.413 4.05019L159.056 0.783111L160.687 3.63617L160.673 0.349654L161.998 3.3576L162.328 0.0876651L163.33 3.21756L164 1.57361e-05Z", color: "#5F1CEF" },
        ],
      },
    ],
    'X': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "sc", cx: 80.00000000000001, cy: 79.99999999999999, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 140, cy: 19.999999999999996, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 110, cy: 50, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 20.000000000000004, cy: 140, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 50, cy: 110, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 20, cy: 20, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 50, cy: 50, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 140, cy: 140, r: 12.5, sw: 15, color: "#E32B1A" },
          { type: "sc", cx: 110, cy: 110, r: 12.5, sw: 15, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M80 80L10 10L150 10L80 80Z", color: "#0055FF" },
          { type: "fp", d: "M80 80L150 150H10L80 80Z", color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M80 60L86.1229 65.2179L94.1421 65.8579L94.7821 73.8771L100 80L94.7821 86.1229L94.1421 94.1421L86.1229 94.7821L80 100L73.8771 94.7821L65.8579 94.1421L65.2179 86.1229L60 80L65.2179 73.8771L65.8579 65.8579L73.8771 65.2179L80 60Z", color: "#1CBAEF" },
          { type: "fp", d: "M140 0L146.123 5.21793L154.142 5.85786L154.782 13.8771L160 20L154.782 26.1229L154.142 34.1421L146.123 34.7821L140 40L133.877 34.7821L125.858 34.1421L125.218 26.1229L120 20L125.218 13.8771L125.858 5.85786L133.877 5.21793L140 0Z", color: "#1CBAEF" },
          { type: "fp", d: "M20 120L26.1229 125.218L34.1421 125.858L34.7821 133.877L40 140L34.7821 146.123L34.1421 154.142L26.1229 154.782L20 160L13.8771 154.782L5.85786 154.142L5.21793 146.123L0 140L5.21793 133.877L5.85786 125.858L13.8771 125.218L20 120Z", color: "#1CBAEF" },
          { type: "fp", d: "M20 0L26.1229 5.21793L34.1421 5.85786L34.7821 13.8771L40 20L34.7821 26.1229L34.1421 34.1421L26.1229 34.7821L20 40L13.8771 34.7821L5.85786 34.1421L5.21793 26.1229L0 20L5.21793 13.8771L5.85786 5.85786L13.8771 5.21793L20 0Z", color: "#1CBAEF" },
          { type: "fp", d: "M140 120L146.123 125.218L154.142 125.858L154.782 133.877L160 140L154.782 146.123L154.142 154.142L146.123 154.782L140 160L133.877 154.782L125.858 154.142L125.218 146.123L120 140L125.218 133.877L125.858 125.858L133.877 125.218L140 120Z", color: "#1CBAEF" },
          { type: "fp", d: "M110 30L116.123 35.2179L124.142 35.8579L124.782 43.8771L130 50L124.782 56.1229L124.142 64.1421L116.123 64.7821L110 70L103.877 64.7821L95.8579 64.1421L95.2179 56.1229L90 50L95.2179 43.8771L95.8579 35.8579L103.877 35.2179L110 30Z", color: "#1CBAEF" },
          { type: "fp", d: "M110 90L116.123 95.2179L124.142 95.8579L124.782 103.877L130 110L124.782 116.123L124.142 124.142L116.123 124.782L110 130L103.877 124.782L95.8579 124.142L95.2179 116.123L90 110L95.2179 103.877L95.8579 95.8579L103.877 95.2179L110 90Z", color: "#1CBAEF" },
          { type: "fp", d: "M50 90L56.1229 95.2179L64.1421 95.8579L64.7821 103.877L70 110L64.7821 116.123L64.1421 124.142L56.1229 124.782L50 130L43.8771 124.782L35.8579 124.142L35.2179 116.123L30 110L35.2179 103.877L35.8579 95.8579L43.8771 95.2179L50 90Z", color: "#1CBAEF" },
          { type: "fp", d: "M50 30L56.1229 35.2179L64.1421 35.8579L64.7821 43.8771L70 50L64.7821 56.1229L64.1421 64.1421L56.1229 64.7821L50 70L43.8771 64.7821L35.8579 64.1421L35.2179 56.1229L30 50L35.2179 43.8771L35.8579 35.8579L43.8771 35.2179L50 30Z", color: "#1CBAEF" },
        ],
      },
    ],
    'Y': [
      {
        vb: { w: 162, h: 161 },
        ops: [
          { type: "fc", cx: 94.84086, cy: 66.5688, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 108.98286, cy: 52.4268, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 123.12586, cy: 38.2847, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 137.26685999999998, cy: 24.1426, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 151.40985999999998, cy: 10, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 66.5679, cy: 66.5691, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 52.4263, cy: 52.42700000000001, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 38.283699999999996, cy: 38.2847, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 24.142099999999996, cy: 24.142600000000005, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 9.99956, cy: 10.000200000000001, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 80.708, cy: 90.8582, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 80.708, cy: 130.858, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 80.708, cy: 150.858, r: 10, color: "#48DC2D" },
          { type: "fc", cx: 80.708, cy: 110.858, r: 10, color: "#48DC2D" },
        ],
      },
      {
        vb: { w: 162, h: 161 },
        ops: [
          { type: "fc", cx: 94.84086, cy: 66.5691, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 123.12586, cy: 38.2847, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 151.40985999999998, cy: 10, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 66.5679, cy: 66.5691, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 38.2837, cy: 38.28489999999999, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 9.99956, cy: 10.000200000000001, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 80.708, cy: 150.858, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 80.708, cy: 110.858, r: 10, color: "#F8D01F" },
          { type: "sp", d: "M10.708 10.8582L80.708 80.8582", sw: 8, cap: "round", color: "black" },
          { type: "sp", d: "M150.708 10.8582L80.708 80.8582L80.708 150.858", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 108.98286, cy: 52.4268, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 137.26685999999998, cy: 24.1423, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 52.4263, cy: 52.42700000000001, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 24.142099999999996, cy: 24.142600000000005, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 80.708, cy: 90.8582, r: 10, color: "#F8D01F" },
          { type: "fc", cx: 80.708, cy: 130.858, r: 10, color: "#F8D01F" },
        ],
      },
    ],
    'Z': [
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fp", d: "M145 134L160 160L130 160L145 134Z", color: "#0055FF" },
          { type: "fp", d: "M112.5 134L127.5 160L97.5 160L112.5 134Z", color: "#0055FF" },
          { type: "fp", d: "M80 134L95 160L65 160L80 134Z", color: "#0055FF" },
          { type: "fp", d: "M47.5 134L62.5 160L32.5 160L47.5 134Z", color: "#0055FF" },
          { type: "fp", d: "M15 134L30 160L-4.54598e-06 160L15 134Z", color: "#0055FF" },
          { type: "fp", d: "M145 2.62268e-06L160 26L130 26L145 2.62268e-06Z", color: "#0055FF" },
          { type: "fp", d: "M112.5 2.62268e-06L127.5 26L97.5 26L112.5 2.62268e-06Z", color: "#0055FF" },
          { type: "fp", d: "M126 27L141 53L111 53L126 27Z", color: "#0055FF" },
          { type: "fp", d: "M34 107L49 133L19 133L34 107Z", color: "#0055FF" },
          { type: "fp", d: "M57 87L72 113L42 113L57 87Z", color: "#0055FF" },
          { type: "fp", d: "M80 67L95 93L65 93L80 67Z", color: "#0055FF" },
          { type: "fp", d: "M103 47L118 73L88 73L103 47Z", color: "#0055FF" },
          { type: "fp", d: "M80 2.62268e-06L95 26L65 26L80 2.62268e-06Z", color: "#0055FF" },
          { type: "fp", d: "M47.5 2.62268e-06L62.5 26L32.5 26L47.5 2.62268e-06Z", color: "#0055FF" },
          { type: "fp", d: "M15 2.62268e-06L30 26L-4.54598e-06 26L15 2.62268e-06Z", color: "#0055FF" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fc", cx: 49.999999344329, cy: 16.000000655671002, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 109.999999344329, cy: 16.000000655671002, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 49.999999344329, cy: 144.000000655671, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 109.999999344329, cy: 144.000000655671, r: 15, color: "#E32B1A" },
          { type: "sp", d: "M16 16H144L16 144H144", sw: 8, cap: "round", color: "black" },
          { type: "fc", cx: 19.999999344328998, cy: 16.000000655671002, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 79.999999344329, cy: 16.000000655671002, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 139.999999344329, cy: 16.000000655671002, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 19.999999344328998, cy: 144.000000655671, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 79.999999344329, cy: 144.000000655671, r: 15, color: "#E32B1A" },
          { type: "fc", cx: 139.999999344329, cy: 144.000000655671, r: 15, color: "#E32B1A" },
        ],
      },
      {
        vb: { w: 160, h: 160 },
        ops: [
          { type: "fr", x: 5, y: 1, w: 30, h: 30, color: "#48DC2D" },
          { type: "fr", x: 5, y: 130, w: 30, h: 30, color: "#0055FF" },
          { type: "fr", x: 35, y: 1, w: 30, h: 30, color: "#0055FF" },
          { type: "fr", x: 35, y: 130, w: 30, h: 30, color: "#48DC2D" },
          { type: "fr", x: 65, y: 1, w: 30, h: 30, color: "#48DC2D" },
          { type: "fr", x: 65, y: 130, w: 30, h: 30, color: "#0055FF" },
          { type: "fr", x: 95, y: 1, w: 30, h: 30, color: "#0055FF" },
          { type: "fr", x: 95, y: 130, w: 30, h: 30, color: "#48DC2D" },
          { type: "fr", x: 125, y: 1, w: 30, h: 30, color: "#48DC2D" },
          { type: "fr", x: 125, y: 130, w: 30, h: 30, color: "#0055FF" },
          { type: "fc", cx: 49.999999344329, cy: 16.000000655671002, r: 15, color: "#48DC2D" },
          { type: "fc", cx: 109.999999344329, cy: 16.000000655671002, r: 15, color: "#48DC2D" },
          { type: "fc", cx: 49.999999344329, cy: 145.000000655671, r: 15, color: "#0055FF" },
          { type: "fc", cx: 109.999999344329, cy: 145.000000655671, r: 15, color: "#0055FF" },
          { type: "fc", cx: 19.999999344328998, cy: 16.000000655671002, r: 15, color: "#0055FF" },
          { type: "fc", cx: 79.999999344329, cy: 16.000000655671002, r: 15, color: "#0055FF" },
          { type: "fc", cx: 139.999999344329, cy: 16.000000655671002, r: 15, color: "#0055FF" },
          { type: "fc", cx: 19.999999344328998, cy: 145.000000655671, r: 15, color: "#48DC2D" },
          { type: "fc", cx: 79.999999344329, cy: 145.000000655671, r: 15, color: "#48DC2D" },
          { type: "fc", cx: 139.999999344329, cy: 145.000000655671, r: 15, color: "#48DC2D" },
          { type: "fr", x: 110, y: 31, w: 30, h: 30, color: "#0055FF" },
          { type: "fr", x: 20, y: 100, w: 30, h: 30, color: "#48DC2D" },
          { type: "fr", x: 50, y: 77, w: 30, h: 30, color: "#0055FF" },
          { type: "fr", x: 80, y: 54, w: 30, h: 30, color: "#48DC2D" },
          { type: "fc", cx: 34.999999344329, cy: 115.000000655671, r: 15, color: "#0055FF" },
          { type: "fc", cx: 64.999999344329, cy: 92.000000655671, r: 15, color: "#48DC2D" },
          { type: "fc", cx: 94.999999344329, cy: 69.000000655671, r: 15, color: "#0055FF" },
          { type: "fc", cx: 124.999999344329, cy: 46.000000655671, r: 15, color: "#48DC2D" },
        ],
      },
    ],
  };

  // Curated palette for one-color recoloring. Sourced directly from
  // the per-letter SVG files (every unique non-white fill/stroke that
  // appears across the set). When the user hits Randomize, any variant
  // whose ops all share a single authored color gets remapped to a
  // palette entry chosen by (cellIndex + randomizeNonce + charCode).
  const RANDOM_PALETTE = [
    '#0055FF',   // blue
    '#1CBAEF',   // cyan
    '#48DC2D',   // green
    '#5F1CEF',   // purple
    '#ACACAC',   // gray
    '#DE36E0',   // magenta
    '#E32B1A',   // red
    '#F0850B',   // orange
    '#F8D01F',   // yellow
  ];

  // Heuristic for "is this op a spline/spine?" — splines are authored
  // in black across the SVG set (the structural strokes the colored
  // decorations sit on). Compared against the canonical black hex;
  // SVG also allows 'black' as a keyword.
  function isSplineOp(op) {
    if (!op.color) return false;
    const c = op.color.toLowerCase();
    return c === '#000000' || c === '#000' || c === 'black';
  }

  // Returns the single shared color of all NON-spline ops in this
  // variant — i.e. the "decoration color" we'd want to recolor on
  // Randomize. If the non-spline ops disagree (a multi-color
  // composition like M-1's red+blue+yellow stars), returns null —
  // the variant's design is intentionally polychrome and shouldn't
  // be flattened to one palette pick. Cached on the variant.
  function dominantDecorColor(variant) {
    if (variant._dominantDecor !== undefined) return variant._dominantDecor;
    let first = null;
    let same = true;
    for (const op of variant.ops) {
      if (!op.color || isSplineOp(op)) continue;
      if (first === null) first = op.color;
      else if (op.color !== first) { same = false; break; }
    }
    variant._dominantDecor = same ? first : null;
    return variant._dominantDecor;
  }

  function drawCustomGlyph(ctx, glyph, swap, shouldHideOp, shuffleMap, ch) {
    // Scale by HEIGHT ONLY so every letter shares cap-height regardless
    // of its source viewBox. Width comes from each glyph's authored
    // viewBox aspect ratio (wide M, narrow I) — like real typography.
    //
    // Comma exception: the comma SVG is intentionally authored with a
    // viewBox taller than its cap-area (192 vs 160), so its tail hangs
    // 32 units below the baseline as a proper descender. We scale by
    // its cap-height (160) instead of its full viewBox height (192), so
    // the comma's body matches other glyphs' cap-height and the tail
    // extends below the cell. This is the ONLY glyph with this
    // exception — every other character uses plain `CHAR_H / vb.h`.
    let designH = glyph.vb.h;
    if (ch === ',') designH = 160;
    const s = CHAR_H / designH;
    ctx.save();
    ctx.scale(s, s);
    ctx.lineJoin = 'round';

    for (let opIndex = 0; opIndex < glyph.ops.length; opIndex++) {
      const op = glyph.ops[opIndex];
      // Flicker: skip this op for the current frame if the flicker
      // function says so. shouldHideOp may be null (flicker disabled);
      // when present it's called with (op, opIndex, totalOps) and
      // returns true to skip drawing.
      if (shouldHideOp && shouldHideOp(op, opIndex, glyph.ops.length)) continue;

      // Color choice priority:
      //   1. shuffleMap (digit-decoration-1 multi-color shuffle)
      //   2. swap (single-decoration-color remap)
      //   3. authored color (default)
      // Splines never hit shuffleMap (they're filtered out when the
      // map is built) and don't match the swap.from (their color is
      // black), so they always render as authored.
      let c = op.color || '#000000';
      if (shuffleMap && c in shuffleMap) c = shuffleMap[c];
      else if (swap && c === swap.from) c = swap.to;
      // lineCap is set per-op — some splines use 'square' caps (N).
      ctx.lineCap = op.cap || 'round';
      if (op.type === 'sc') {
        ctx.strokeStyle = c;
        ctx.lineWidth = op.sw;
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (op.type === 'fc') {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (op.type === 'sp') {
        ctx.strokeStyle = c;
        ctx.lineWidth = op.sw;
        // Canvas Path2D accepts SVG `d` syntax directly.
        ctx.stroke(new Path2D(op.d));
      } else if (op.type === 'fp') {
        ctx.fillStyle = c;
        ctx.fill(new Path2D(op.d));
      } else if (op.type === 'se') {
        ctx.strokeStyle = c;
        ctx.lineWidth = op.sw;
        ctx.beginPath();
        ctx.ellipse(op.cx, op.cy, op.rx, op.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (op.type === 'fe') {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(op.cx, op.cy, op.rx, op.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (op.type === 'fr') {
        // Filled rectangle — used by compositions like O variant 5
        // (a colored square with a circle cut out of it). Author's
        // white-bg rect is dropped at parse time; surviving rects
        // are intentional design elements.
        ctx.fillStyle = c;
        ctx.fillRect(op.x, op.y, op.w, op.h);
      } else if (op.type === 'sr') {
        ctx.strokeStyle = c;
        ctx.lineWidth = op.sw;
        ctx.strokeRect(op.x, op.y, op.w, op.h);
      }
    }
    ctx.restore();
  }

  // Map char → its dedicated pool, or null for STD_STYLES fallback.
  const SPECIAL_POOLS = {
    'O': O_STYLES,
    '0': O_STYLES,
    'A': A_STYLES,
    'E': E_STYLES,
    'I': I_STYLES,
    'U': U_STYLES,
  };

  // ---- Effect registration ----
  registerEffect({
    id: 'alphabet',
    mode: 'text',
    name: 'Alphabet',
    description: 'Each letter is rendered in a different geometric style — dots, rings, crosses, hatches — like a poster typeset in many alphabets at once. Type any text; every letter has its own look.',
    colorSlots: 1,    // background only — letter color picker is in Effect group

    controls: [
      {
        group: 'Text',
        open: true,
        items: [
          { type: 'text', key: 'text', label: '', default: 'ALPHABET',
            placeholder: 'Type here. Use | for line breaks.', maxlength: 60 },
        ],
      },
      {
        group: 'Effect',
        open: true,
        items: [
          { type: 'slider', key: 'size', label: 'Size', min: 6, max: 24, step: 1, default: 13 },
          // Flicker: each op (circle, square, path) has a tiny independent
          // chance of being hidden at any moment. The result is subtle
          // life — like a faulty neon sign — without distorting any
          // letterform. Splines/spines never flicker so the letter
          // structure stays readable.
          { type: 'checkbox', key: 'flicker', label: 'Flicker', default: true },
          // Randomize cycles which variant each letter draws AND, for
          // one-color variants (where every op shares a single color),
          // rotates that color through a curated palette derived from
          // the source SVGs. Multi-color variants stay as designed.
          { type: 'button', key: 'randomize', label: 'Randomize' },
        ],
      },
    ],

    mount(host, initialCtx) {
      const current = {
        ctx: initialCtx,
        bg: initialCtx.colors[0] || '#F2F2F2',
      };

      function refreshColors() {
        const c = current.ctx;
        current.bg = c.colors[0] || '#F2F2F2';
      }
      refreshColors();

      const cv = document.createElement('canvas');
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.style.display = 'block';
      host.appendChild(cv);
      const dctx = cv.getContext('2d');

      let randomizeNonce = 0;

      function seededRandom(seed) {
        let h = 2166136261;
        for (let i = 0; i < seed.length; i++) {
          h ^= seed.charCodeAt(i);
          h = (h * 16777619) >>> 0;
        }
        return () => {
          h += 0x6D2B79F5;
          let t = h;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      function drawCharacter(ctx, ch, cellIndex, nonce, flickerCtx) {
        // Whitelist: only render characters that have a CUSTOM_GLYPHS
        // entry. Anything else (lowercase, symbols, accented chars, …)
        // is dropped silently — no algorithmic fallback. This matches
        // the design intent that ONLY the explicitly-authored glyphs
        // (A-Z, 0-9, comma, period) ever appear on screen.
        const variants = CUSTOM_GLYPHS[ch];
        if (!variants || !variants.length) return;

        const variantIdx = pickStyleIndex(ch, cellIndex, nonce, variants.length);
        const variant = variants[variantIdx];

        // Randomize handling — two modes:
        //
        // 1) Digit decoration 1 (variantIdx === 0 for chars '0'..'9'):
        //    these are multi-color compositions where each op was
        //    authored with a specific palette color (red square plus a
        //    palette dot inside). On Randomize, we SHUFFLE the existing
        //    authored colors among the ops — so the palette stays the
        //    designer's choice but the dots land in different spots.
        //
        // 2) Single-decoration-color variants: when every non-spline op
        //    shares one authored color, Randomize remaps that color to
        //    a palette pick. Splines stay authored-black.
        //
        // Multi-color non-digit variants (M-1's tri-color stars, etc.)
        // pass through unchanged — those are intentional polychromes.
        let swap = null;
        let shuffleMap = null;
        const isDigitFirstVariant = (variantIdx === 0 && ch >= '0' && ch <= '9');
        if (nonce > 0) {
          if (isDigitFirstVariant) {
            shuffleMap = makeShuffleMap(variant, cellIndex, ch, nonce);
          } else {
            const decor = dominantDecorColor(variant);
            if (decor) {
              const pIdx = ((ch.charCodeAt(0) * 13 + cellIndex * 7 + nonce * 31) >>> 0) % RANDOM_PALETTE.length;
              swap = { from: decor, to: RANDOM_PALETTE[pIdx] };
            }
          }
        }

        // Build the per-op flicker decision function. Each op has a
        // stable seed from (cellIndex, opIndex) and a period/phase
        // from that seed; at the current time we check whether the
        // op falls into its flicker window. Splines and one-op
        // variants never flicker.
        let shouldHideOp = null;
        if (flickerCtx && flickerCtx.enabled) {
          shouldHideOp = makeFlickerFn(cellIndex, variant, flickerCtx.t);
        }

        drawCustomGlyph(ctx, variant, swap, shouldHideOp, shuffleMap, ch);
      }

      // Build a per-op color shuffle map for a digit-decoration-1
      // composition. Strategy:
      //   - Collect the distinct non-spline colors authored in the variant.
      //   - Derive a permutation index from (cellIndex, char, nonce).
      //   - Rotate the color list by that index → a per-color mapping.
      //   - Return { from1: to1, from2: to2, ... }
      // drawCustomGlyph applies the map: any op whose color is a key
      // gets rendered with the corresponding value. Splines and any
      // unmapped colors pass through.
      function makeShuffleMap(variant, cellIndex, ch, nonce) {
        const colors = [];
        const seen = new Set();
        for (const op of variant.ops) {
          if (isSplineOp(op)) continue;
          if (!op.color || seen.has(op.color)) continue;
          seen.add(op.color);
          colors.push(op.color);
        }
        if (colors.length < 2) return null;
        // Rotate by a stable amount derived from the cell + nonce.
        const rot = ((ch.charCodeAt(0) * 17 + cellIndex * 11 + nonce * 41) >>> 0) % colors.length;
        const map = {};
        for (let i = 0; i < colors.length; i++) {
          map[colors[i]] = colors[(i + rot) % colors.length];
        }
        return map;
      }

      // Flicker helper: returns a function `(op, opIndex, total) → bool`
      // that decides if a given op is currently in its flicker window
      // (i.e. should be hidden for this frame).
      //
      // Mechanics:
      //   - Each op gets a deterministic seed from (cellIndex, opIndex)
      //   - Seed → flicker period (4–9s) and phase offset
      //   - At time t, op is hidden when ((t + offset) mod period) is
      //     within a small window (~110ms)
      //   - Splines (authored black or near-black) never flicker
      //   - If the variant has only ONE drawable (non-spline) op, that
      //     op never flickers — otherwise the letter could vanish.
      function makeFlickerFn(cellIndex, variant, t) {
        // Pre-count drawable (non-spline) ops in this variant, so we
        // know if hiding any one would leave the letter empty.
        let drawableCount = 0;
        for (const op of variant.ops) {
          if (!isSplineOp(op)) drawableCount++;
        }
        return function shouldHide(op, opIndex, total) {
          // Splines never flicker — the structural "ink" stays.
          if (isSplineOp(op)) return false;
          // Single drawable op: never flicker (would erase the letter).
          if (drawableCount <= 1) return false;
          // Stable per-op seed. xorshift-ish mix.
          const seed = ((cellIndex + 1) * 2654435761 ^ (opIndex + 1) * 1597334677) >>> 0;
          // Period: 2000–5000ms. Phase offset: 0–period. Faster than
          // the original 4-9s range so the composition feels more alive.
          const period = 2000 + (seed % 3000);
          const offset = (seed >>> 8) % period;
          // Flicker window: 110ms hidden per period.
          const phase = (t + offset) % period;
          return phase < 110;
        };
      }


      function render() {
        const c = current.ctx;
        const params = c.params || {};

        // DPR multiplier of 2 (in addition to the system DPR). Alphabet
        // renders complex SVG-derived shapes — star bursts, sun rays,
        // tight spirals — whose smallest features can be 1-2 pixels
        // wide at typical render sizes. At plain system DPR, antialiasing
        // softens those fine details into a fuzzy look. Doubling gives
        // 4× the pixel budget so spike tips and curve edges stay crisp.
        // Memory cost is acceptable for static rendering.
        const dpr = 2 * ((typeof window !== 'undefined' && window.devicePixelRatio) || 1);
        const wantW = Math.round(c.width * dpr);
        const wantH = Math.round(c.height * dpr);
        if (cv.width !== wantW || cv.height !== wantH) {
          cv.width = wantW;
          cv.height = wantH;
          cv.style.width = c.width + 'px';
          cv.style.height = c.height + 'px';
        }
        dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Paint the background color from the global Colors swatch.
        // Default is the page color (#F2F2F2), so out-of-the-box this
        // looks like a transparent bg against the page. The user can
        // change the swatch to any color to give the letters a custom
        // backdrop.
        dctx.fillStyle = current.bg;
        dctx.fillRect(0, 0, c.width, c.height);

        const phrase = (params.text || '').toUpperCase().trim() || 'ALPHABET';
        const rows = phrase.split('|').map(r => r.trim()).filter(Boolean);
        if (!rows.length) return;

        // Flicker context: enabled flag + current time. The flicker
        // function reads `t` to decide which ops fall into their hide
        // window. When the user toggles Flicker off, we render once
        // with `enabled: false` so everything shows.
        const flickerCtx = {
          enabled: params.flicker !== false,
          t: performance.now(),
        };

        // Each letter shares the same cap-height (cellH). Per-letter
        // width comes from the variant's viewBox aspect ratio, so
        // narrow letters (I) take less horizontal room than wide ones
        // (M, W). This packs the row tightly like real typography.
        const sizePct = Math.max(6, Math.min(24, params.size || 13));
        const minAxis = Math.min(c.width, c.height);
        const cellH = minAxis * (sizePct / 100);
        const colGap = cellH * 0.20;
        const rowGap = cellH * 0.30;

        // Helper: width of the cell that will be drawn for a character
        // Helper: width of the cell that will be drawn for a character
        // at the current cap-height. Uses the first variant's viewBox
        // aspect — variants of the same letter share similar aspects
        // in practice, so layout stays stable across Randomize clicks.
        //
        // Returns 0 for chars without a CUSTOM_GLYPHS entry — they're
        // dropped from the layout entirely so they don't leave gaps.
        // (Space ' ' is the one exception: it's an authored separator
        // so it gets a half-cell of width.)
        function cellWidthFor(ch) {
          if (ch === ' ') return cellH * 0.5;
          const variants = CUSTOM_GLYPHS[ch];
          if (variants && variants[0]) {
            // Comma exception (see drawCustomGlyph): the comma's
            // viewBox includes a 32-unit descender below the cap-area.
            // Cell width should use cap-height (160), not viewBox-
            // height (192), so the cell isn't squeezed.
            const vb = variants[0].vb;
            const designH = (ch === ',') ? 160 : vb.h;
            return cellH * (vb.w / designH);
          }
          return 0;
        }

        // Lay out each row as a list of {ch, w} items and a total
        // width including gaps. Chars with width 0 (unsupported) get
        // dropped entirely — they neither render nor reserve space.
        const rowsLaidOut = rows.map(row => {
          const items = [];
          let rowWidth = 0;
          for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            const w = cellWidthFor(ch);
            if (w <= 0) continue;
            items.push({ ch, w });
            rowWidth += w + colGap;
          }
          rowWidth -= colGap;
          return { items, rowWidth };
        });

        const widestRow = Math.max(...rowsLaidOut.map(r => r.rowWidth));
        const blockH = rows.length * cellH + (rows.length - 1) * rowGap;

        // Auto-shrink if the block exceeds 90% of canvas in either axis.
        let scale = 1;
        if (widestRow > c.width * 0.9) scale = (c.width * 0.9) / widestRow;
        if (blockH * scale > c.height * 0.9) scale = (c.height * 0.9) / blockH;

        const effCellH = cellH * scale;
        const effColG = colGap * scale;
        const effRowG = rowGap * scale;
        const effH = rows.length * effCellH + (rows.length - 1) * effRowG;
        const blockTop = (c.height - effH) / 2;

        // Draw row by row, packing letters left to right. cellIndex
        // counts every drawable cell across the whole phrase (not just
        // the current row) so consecutive same letters end up on
        // different variants/colors via pickStyleIndex.
        let cellIndex = 0;
        for (let rIdx = 0; rIdx < rowsLaidOut.length; rIdx++) {
          const layout = rowsLaidOut[rIdx];
          const rowWidth = layout.rowWidth * scale;
          const rowLeft = (c.width - rowWidth) / 2;
          const y = blockTop + rIdx * (effCellH + effRowG);
          let x = rowLeft;
          for (const item of layout.items) {
            if (item.ch === ' ') {
              x += item.w * scale + effColG;
              continue;
            }
            const sy = effCellH / CHAR_H;
            dctx.save();
            dctx.translate(x, y);
            dctx.scale(sy, sy);
            drawCharacter(dctx, item.ch, cellIndex, randomizeNonce, flickerCtx);
            dctx.restore();
            x += item.w * scale + effColG;
            cellIndex++;
          }
        }
      }

      // Continuous animation loop. We call render() every frame so the
      // flicker reads a fresh `performance.now()` and ops blink in/out
      // accordingly. When flicker is disabled the work per frame is the
      // same minus the per-op hide check — negligible. If this proves
      // expensive on slow devices we could short-circuit and re-render
      // only on changes when flicker is off, but the cost is small.
      let rafId = 0;
      function loop() {
        render();
        rafId = requestAnimationFrame(loop);
      }
      loop();

      // -----------------------------------------------------------
      // SVG counterpart to drawCustomGlyph — emits SVG element
      // strings for each op instead of issuing canvas calls. Each
      // op type maps directly to one SVG primitive. Flicker is
      // skipped on export (a still vector doesn't blink).
      // Caller wraps the returned string in <g transform> to place
      // the glyph in the page.
      // -----------------------------------------------------------
      function glyphToSVGOps(glyph, swap, shuffleMap, ch) {
        let designH = glyph.vb.h;
        if (ch === ',') designH = 160;
        const s = CHAR_H / designH;
        const out = [];
        out.push(`<g transform="scale(${s})">`);
        for (let opIndex = 0; opIndex < glyph.ops.length; opIndex++) {
          const op = glyph.ops[opIndex];
          let c = op.color || '#000000';
          if (shuffleMap && c in shuffleMap) c = shuffleMap[c];
          else if (swap && c === swap.from) c = swap.to;
          const cap = op.cap || 'round';
          if (op.type === 'sc') {
            out.push(`<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="none" stroke="${c}" stroke-width="${op.sw}" stroke-linecap="${cap}"/>`);
          } else if (op.type === 'fc') {
            out.push(`<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="${c}"/>`);
          } else if (op.type === 'sp') {
            out.push(`<path d="${SaiyanSVG.escape(op.d)}" fill="none" stroke="${c}" stroke-width="${op.sw}" stroke-linecap="${cap}" stroke-linejoin="round"/>`);
          } else if (op.type === 'fp') {
            out.push(`<path d="${SaiyanSVG.escape(op.d)}" fill="${c}"/>`);
          } else if (op.type === 'se') {
            out.push(`<ellipse cx="${op.cx}" cy="${op.cy}" rx="${op.rx}" ry="${op.ry}" fill="none" stroke="${c}" stroke-width="${op.sw}"/>`);
          } else if (op.type === 'fe') {
            out.push(`<ellipse cx="${op.cx}" cy="${op.cy}" rx="${op.rx}" ry="${op.ry}" fill="${c}"/>`);
          } else if (op.type === 'fr') {
            out.push(`<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${c}"/>`);
          } else if (op.type === 'sr') {
            out.push(`<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="none" stroke="${c}" stroke-width="${op.sw}"/>`);
          }
        }
        out.push('</g>');
        return out.join('');
      }

      host.__alphabet = {
        update(newCtx) {
          current.ctx = newCtx;
          refreshColors();
          // No need to re-render here — the rAF loop will paint the
          // next frame with the updated ctx. Calling render() would
          // just cause an extra paint this tick.
        },
        button(key) {
          if (key === 'randomize') {
            randomizeNonce++;
            // Same as above: next rAF tick picks up the new nonce.
          }
        },
        // True-vector SVG export. Replicates the live layout pass
        // (rowsLaidOut, scale, blockTop) then emits each character
        // as a transformed group of its op-derived SVG primitives.
        // The result opens in any SVG viewer as editable shapes —
        // each circle, path, rect is a real element you can pick
        // apart in Illustrator or Figma.
        exportSVG(ctx) {
          const c = current.ctx;
          const params = c.params || {};
          const W = c.width, H = c.height;
          const phrase = (params.text || '').toUpperCase().trim() || 'ALPHABET';
          const rows = phrase.split('|').map(r => r.trim()).filter(Boolean);
          if (!rows.length) {
            return SaiyanSVG.doc({
              width: W, height: H,
              body: `<rect width="${W}" height="${H}" fill="${current.bg}"/>`,
            });
          }
          const sizePct = Math.max(6, Math.min(24, params.size || 13));
          const minAxis = Math.min(W, H);
          const cellH = minAxis * (sizePct / 100);
          const colGap = cellH * 0.20;
          const rowGap = cellH * 0.30;
          function cellWidthFor(ch) {
            if (ch === ' ') return cellH * 0.5;
            const variants = CUSTOM_GLYPHS[ch];
            if (variants && variants[0]) {
              const vb = variants[0].vb;
              const designH = (ch === ',') ? 160 : vb.h;
              return cellH * (vb.w / designH);
            }
            return 0;
          }
          const rowsLaidOut = rows.map(row => {
            const items = [];
            let rowWidth = 0;
            for (let i = 0; i < row.length; i++) {
              const ch = row[i];
              const w = cellWidthFor(ch);
              if (w <= 0) continue;
              items.push({ ch, w });
              rowWidth += w + colGap;
            }
            rowWidth -= colGap;
            return { items, rowWidth };
          });
          const widestRow = Math.max(...rowsLaidOut.map(r => r.rowWidth));
          const blockH = rows.length * cellH + (rows.length - 1) * rowGap;
          let scale = 1;
          if (widestRow > W * 0.9) scale = (W * 0.9) / widestRow;
          if (blockH * scale > H * 0.9) scale = (H * 0.9) / blockH;
          const effCellH = cellH * scale;
          const effColG = colGap * scale;
          const effRowG = rowGap * scale;
          const effH = rows.length * effCellH + (rows.length - 1) * effRowG;
          const blockTop = (H - effH) / 2;

          const body = [];
          body.push(`<rect width="${W}" height="${H}" fill="${current.bg}"/>`);

          let cellIndex = 0;
          for (let rIdx = 0; rIdx < rowsLaidOut.length; rIdx++) {
            const layout = rowsLaidOut[rIdx];
            const rowWidth = layout.rowWidth * scale;
            const rowLeft = (W - rowWidth) / 2;
            const y = blockTop + rIdx * (effCellH + effRowG);
            let x = rowLeft;
            for (const item of layout.items) {
              if (item.ch === ' ') {
                x += item.w * scale + effColG;
                continue;
              }
              const sy = effCellH / CHAR_H;
              // Replicate drawCharacter's variant pick + color logic.
              const variants = CUSTOM_GLYPHS[item.ch];
              if (variants && variants.length) {
                const variantIdx = pickStyleIndex(item.ch, cellIndex, randomizeNonce, variants.length);
                const variant = variants[variantIdx];
                let swap = null;
                let shuffleMap = null;
                const isDigitFirstVariant = (variantIdx === 0 && item.ch >= '0' && item.ch <= '9');
                if (randomizeNonce > 0) {
                  if (isDigitFirstVariant) {
                    shuffleMap = makeShuffleMap(variant, cellIndex, item.ch, randomizeNonce);
                  } else {
                    const decor = dominantDecorColor(variant);
                    if (decor) {
                      const pIdx = ((item.ch.charCodeAt(0) * 13 + cellIndex * 7 + randomizeNonce * 31) >>> 0) % RANDOM_PALETTE.length;
                      swap = { from: decor, to: RANDOM_PALETTE[pIdx] };
                    }
                  }
                }
                body.push(`<g transform="translate(${x},${y}) scale(${sy})">${glyphToSVGOps(variant, swap, shuffleMap, item.ch)}</g>`);
              }
              x += item.w * scale + effColG;
              cellIndex++;
            }
          }
          return SaiyanSVG.doc({ width: W, height: H, body: body.join('') });
        },
      };

      return function teardown() {
        cancelAnimationFrame(rafId);
        host.__alphabet = null;
        try { host.removeChild(cv); } catch (e) { /* already gone */ }
      };
    },

    onUpdate(ctx) {
      const api = ctx.host && ctx.host.__alphabet;
      if (api && typeof api.update === 'function') api.update(ctx);
    },

    onButton(ctx, key) {
      const api = ctx.host && ctx.host.__alphabet;
      if (api && typeof api.button === 'function') api.button(key);
    },
  });
})();
