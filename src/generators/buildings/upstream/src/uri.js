/**
 * Embedding helper.
 *
 * Percent-encoding rather than base64: it needs neither `btoa` (missing in
 * Node) nor `Buffer` (missing in browsers), so one implementation works
 * everywhere, and the result stays legible in devtools. It is also smaller than
 * base64 for markup, which is mostly ASCII already.
 *
 * An SVG referenced by `<img src>` still runs its CSS animation — declarative
 * animation is allowed in that mode, only scripting is blocked — so the motion
 * layer survives this path.
 */

export function svgToDataURI(svg) {
  const encoded = encodeURIComponent(svg)
    // None of these need escaping inside a data URI, and all are common in
    // markup, so leaving them literal keeps the result readable and shorter.
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')
    // Apostrophes must go before the swap below, not after: a seed like
    // `o'brien` reaches the <title>, and once double quotes have become
    // apostrophes there is no way to tell the two apart. Escaping first means
    // the only apostrophes left are the ones we put there.
    .replace(/'/g, '%27')
    // The URI is usually pasted straight into an attribute, and now contains
    // neither kind of quote, so either kind can surround it.
    .replace(/%22/g, "'");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
