// SVG の文字列を、許可リストに載った要素・属性だけに削ぎ落とす。
// 許可リストに無い要素は中身ごと捨てる（`script` の本文や `foreignObject` の中の HTML を地の文として残さない）。
// 読むのも書き戻すのも XML なので、書き戻した文字列を HTML として読み直しても要素の切れ目はずれない。

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/"

/**
 * 削ぎ落とした SVG の文字列を返す。
 * XML として読めない・根が SVG の `<svg>` でないときは `undefined`。
 */
export function sanitizeSvg(markup: string): string | undefined {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml")
  const root = parsed.documentElement
  if (
    parsed.getElementsByTagName("parsererror").length > 0 ||
    root.namespaceURI !== SVG_NAMESPACE ||
    root.localName !== "svg"
  ) {
    return undefined
  }

  scrub(root)
  return new XMLSerializer().serializeToString(root)
}

const ALLOWED_ELEMENT_NAMES: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "switch",
  "title",
  "desc",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "image",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "feTurbulence",
  "animate",
  "animateTransform",
])

const ALLOWED_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "id",
  "class",
  "style",
  "role",
  "aria-label",
  "aria-hidden",
  "version",
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "fr",
  "d",
  "points",
  "pathLength",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "color",
  "display",
  "visibility",
  "overflow",
  "paint-order",
  "vector-effect",
  "shape-rendering",
  "image-rendering",
  "mix-blend-mode",
  "isolation",
  "clip-path",
  "clip-rule",
  "mask",
  "filter",
  "marker-start",
  "marker-mid",
  "marker-end",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "filterUnits",
  "primitiveUnits",
  "systemLanguage",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "letter-spacing",
  "word-spacing",
  "text-decoration",
  "dx",
  "dy",
  "rotate",
  "textLength",
  "lengthAdjust",
  "in",
  "in2",
  "result",
  "stdDeviation",
  "flood-color",
  "flood-opacity",
  "color-interpolation-filters",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "mode",
  "type",
  "values",
  "radius",
  "tableValues",
  "slope",
  "intercept",
  "amplitude",
  "exponent",
  "baseFrequency",
  "numOctaves",
  "seed",
  "stitchTiles",
  "attributeName",
  "attributeType",
  "from",
  "to",
  "by",
  "begin",
  "dur",
  "end",
  "repeatCount",
  "repeatDur",
  "calcMode",
  "keyTimes",
  "keySplines",
  "additive",
  "accumulate",
  "restart",
])

const DATA_ATTRIBUTE_PATTERN = /^data-[a-z0-9._-]+$/

/** `url(` が文書の中（`#`）以外を指すもの・スクリプトを指すもの・CSS で外を読みに行く記法。 */
const FORBIDDEN_VALUE_PATTERN = /url\(\s*(?:['"]\s*)?(?![\s'"#])|image-set\(|javascript:/i

const FORBIDDEN_STYLE_PATTERN = /@import|expression\(|</i

/** `image` だけは文書の中の参照に加えて、ラスタの data URL を指してよい。 */
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|gif|jpeg|webp)[;,]/i

/** アニメーションで書き換えると、リンクやイベントハンドラになる属性。これを書き換える要素は中身ごと落とす。 */
const FORBIDDEN_ANIMATION_TARGET_PATTERN = /^on|href/i

function scrub(element: Element): void {
  for (const attribute of [...element.attributes]) {
    if (!isAllowedAttribute(element, attribute)) {
      element.removeAttributeNode(attribute)
    }
  }
  for (const child of [...element.childNodes]) {
    if (child instanceof Element && isAllowedElement(child)) {
      scrub(child)
    } else if (child.nodeType !== Node.TEXT_NODE) {
      child.remove()
    }
  }
}

function isAllowedElement(element: Element): boolean {
  return (
    element.namespaceURI === SVG_NAMESPACE &&
    ALLOWED_ELEMENT_NAMES.has(element.localName) &&
    !FORBIDDEN_ANIMATION_TARGET_PATTERN.test(element.getAttribute("attributeName")?.trim() ?? "")
  )
}

function isAllowedAttribute(element: Element, attribute: Attr): boolean {
  if (attribute.namespaceURI === XMLNS_NAMESPACE) {
    return true
  }
  const isReference =
    attribute.localName === "href" &&
    (attribute.namespaceURI === null || attribute.namespaceURI === XLINK_NAMESPACE)
  if (isReference) {
    return isAllowedReference(element, attribute.value)
  }
  if (attribute.namespaceURI !== null) {
    return false
  }
  if (
    !ALLOWED_ATTRIBUTE_NAMES.has(attribute.name) &&
    !DATA_ATTRIBUTE_PATTERN.test(attribute.name)
  ) {
    return false
  }
  if (FORBIDDEN_VALUE_PATTERN.test(attribute.value)) {
    return false
  }
  return attribute.name !== "style" || !FORBIDDEN_STYLE_PATTERN.test(attribute.value)
}

function isAllowedReference(element: Element, value: string): boolean {
  const reference = value.trim()
  return (
    reference.startsWith("#") ||
    (element.localName === "image" && IMAGE_DATA_URL_PATTERN.test(reference))
  )
}
