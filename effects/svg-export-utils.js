/* ============================================================
   SVG EXPORT UTILITIES — shared across effects

   The global SVG exporter (in index.html) prefers effect-supplied
   true-vector SVG over raster-in-SVG fallback. Each effect that can
   produce real vector output attaches an exportSVG(ctx) method to
   its host handle. These helpers factor out the common pieces:

     SaiyanSVG.doc({ width, height, defs, body })
       Wraps a complete SVG document with the canvas dimensions.

     SaiyanSVG.escape(s)
       XML-escape a string for safe inclusion in attributes/content.

     SaiyanSVG.text({ x, y, text, fontFamily, fontSize, fontWeight,
                      fill, textAnchor, dominantBaseline, transform })
       Build a <text> element. textAnchor default 'start',
       dominantBaseline default 'alphabetic' (matches canvas
       default of fillText). For canvas's textBaseline='middle',
       pass dominantBaseline='central'. For textAlign='center',
       pass textAnchor='middle'.

     SaiyanSVG.stop(offset, colorValue)
       Spec-compliant gradient stop, handling rgba()→opacity split.

   These helpers stay deliberately minimal — no styling opinions,
   just structural emit.
============================================================ */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function doc({ width, height, defs, body }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs ? `<defs>${defs}</defs>` : ''}
  ${body || ''}
</svg>`;
  }

  function text(opts) {
    const {
      x = 0, y = 0, text: content = '',
      fontFamily = 'sans-serif',
      fontSize = 16,
      fontWeight = null,
      fill = '#000',
      textAnchor = null,
      dominantBaseline = null,
      transform = null,
      opacity = null,
    } = opts;
    const attrs = [
      `x="${x}"`,
      `y="${y}"`,
      `font-family="${escape(fontFamily)}"`,
      `font-size="${fontSize}"`,
      fontWeight != null ? `font-weight="${fontWeight}"` : '',
      `fill="${fill}"`,
      textAnchor ? `text-anchor="${textAnchor}"` : '',
      dominantBaseline ? `dominant-baseline="${dominantBaseline}"` : '',
      transform ? `transform="${escape(transform)}"` : '',
      opacity != null ? `opacity="${opacity}"` : '',
    ].filter(Boolean).join(' ');
    return `<text ${attrs}>${escape(content)}</text>`;
  }

  // Spec-compliant gradient stop. Splits rgba() into stop-color +
  // stop-opacity for maximum SVG-viewer compatibility.
  function stop(offset, colorValue) {
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

  window.SaiyanSVG = { doc, escape, text, stop };
})();
