// A drawn SVG graph as a file that stands alone (feedback #1010, from the data model
// diagram's export): the whole drawing whatever the zoom, the theme's colours and fonts
// written onto each element, a background, and a PNG made from it.

const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight']

/**
 * `svg`: the live <svg>; its pan/zoom group carries `data-viewport`. `bounds`: the drawing's
 * { x, y, width, height } in its own units. `background`: a CSS colour.
 */
export function standaloneSvg(svg, bounds, background = '#ffffff', pad = 12) {
  const clone = svg.cloneNode(true)
  const a = [svg, ...svg.querySelectorAll('*')], c = [clone, ...clone.querySelectorAll('*')]
  a.forEach((el, i) => {
    const cs = getComputedStyle(el)
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p)
      if (v) c[i].setAttribute(p, v)
    }
    c[i].removeAttribute('style')
    c[i].removeAttribute('class')
  })
  clone.querySelector('g[data-viewport]')?.setAttribute('transform', '')
  const b = { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + 2 * pad, height: bounds.height + 2 * pad }
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`)
  clone.setAttribute('width', String(Math.round(b.width)))
  clone.setAttribute('height', String(Math.round(b.height)))
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  Object.entries({ x: b.x, y: b.y, width: b.width, height: b.height, fill: background }).forEach(([k, v]) => bg.setAttribute(k, v))
  clone.insertBefore(bg, clone.firstChild)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

/** A PNG of SVG text, at twice its size (less for very large drawings). */
export async function pngBlob(text) {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  await img.decode()
  const scale = Math.min(2, 16000 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the image is too large'))), 'image/png'))
}
