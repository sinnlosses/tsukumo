// レポート（発話の詳細）の中に書かれた HTML を、表示してよい形へ削ぎ落とす。「決める」層で、
// ファイルI/Oも DOM も持たない。
//
// **なぜ通すのか**: レポートを書くのはモデル自身で、Markdown の語彙（見出し・表・コード・箇条書き）
// だけでは段組みやカードのような見せ方ができない（`docs/requirements.md` 4.2）。HTML を直接
// 書けるようにすると、レポートごとに最適な形を組めるようになる。
//
// **なぜ削ぎ落とすのか**: このページは会話の内容を持っている（`docs/coding-standards.md`
// 「会話内容の扱い」）。レポートには利用者の言葉や外部の出力が引用されることがあり、それが
// そのまま HTML として解釈されると、意図しないスクリプトや外部への通信が生まれる。
// **許可リスト方式**（載っているものだけを通す）にしてあるので、知らない要素・属性は自動的に
// 落ちる。既存のリンクのスキーム制限（{@link isAllowedLinkUrl}）と同じ考え方の拡張。

/** 通してよい要素。ここに無い要素は、**中身のテキストだけを残して**タグが落ちる。 */
const ALLOWED_TAGS: readonly string[] = [
  "div",
  "span",
  "p",
  "br",
  "hr",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "pre",
  "code",
  "kbd",
  "samp",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "mark",
  "del",
  "ins",
  "blockquote",
  "section",
  "article",
  "aside",
  "figure",
  "figcaption",
  "details",
  "summary",
  "a",
  // 図を手で組むための SVG。座標や描画の属性は ALLOWED_ATTRIBUTES 側で通す。
  "svg",
  "g",
  "defs",
  "marker",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
]

/**
 * **中身ごと捨てる要素。** タグを落として中身のテキストを残すと、スクリプト本体が
 * 地の文として画面に出てしまうため、閉じタグまでまとめて捨てる。
 */
const DROPPED_WITH_CONTENT_TAGS: readonly string[] = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
]

/** 閉じタグを持たない要素。 */
const VOID_TAGS: readonly string[] = ["br", "hr"]

/**
 * 要素を問わず通してよい属性。**`on*`（イベントハンドラ）はここに無いので自動的に落ちる。**
 * `id` を通すのは SVG の `marker` / `defs` を参照するため。
 */
const ALLOWED_ATTRIBUTES: readonly string[] = [
  "class",
  "id",
  "title",
  "colspan",
  "rowspan",
  "open",
  "datetime",
  "aria-label",
  "aria-hidden",
  "role",
  // SVG の描画に要るもの。
  "viewbox",
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
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "transform",
  "text-anchor",
  "dominant-baseline",
  "font-size",
  "font-family",
  "font-weight",
  "opacity",
  "marker-end",
  "marker-start",
  "orient",
  "refx",
  "refy",
  "markerwidth",
  "markerheight",
  "preserveaspectratio",
  "xmlns",
]

/**
 * `href` に入れてよいスキームの allowlist。**それ以外（`javascript:` / `data:` / 不明なスキーム）は
 * リンクにしない**（`docs/coding-standards.md`「会話内容の扱い」と同じ思想: このビューは
 * localhost とはいえ会話の内容を持っているので、クリックで JavaScript が実行される経路を
 * 作らない）。`/` や `#` で始まる相対リンクは許可する。
 */
const ALLOWED_LINK_SCHEMES: readonly string[] = ["http:", "https:", "mailto:"]

/**
 * レポートに書かれた HTML を、許可リストに載っているものだけへ削ぎ落とす。
 *
 * - 許可されていない要素は**タグだけを落とし、中身のテキストは残す**（情報を失わないため）。
 *   ただし {@link DROPPED_WITH_CONTENT_TAGS} は中身ごと捨てる
 * - 許可されていない属性（`on*` を含む）は落とす。`href` はスキームを検査し、通らなければ
 *   リンクごと（属性だけ）落とす
 * - `style` は値を検査して通す。**外部を読みに行く記法（`url(` / `@import` / `expression(`）を
 *   含むものは落とす**。段組みや色を書くための最低限の自由度をここで確保している
 * - 閉じられていない要素は末尾で閉じ、対応しない閉じタグは捨てる（本文の構造が壊れないため）
 */
export function sanitizeReportHtml(html: string): string {
  const parts: string[] = []
  const openTags: string[] = []
  let index = 0

  while (index < html.length) {
    const nextTagStart = html.indexOf("<", index)
    if (nextTagStart === -1) {
      parts.push(escapeHtml(html.slice(index)))
      break
    }

    parts.push(escapeHtml(html.slice(index, nextTagStart)))

    const comment = skipComment(html, nextTagStart)
    if (comment !== undefined) {
      index = comment
      continue
    }

    const tag = parseTag(html, nextTagStart)
    if (tag === undefined) {
      // `<` で始まるがタグとして読めないものは、そのままの文字として出す。
      parts.push(escapeHtml("<"))
      index = nextTagStart + 1
      continue
    }

    index = tag.next
    if (tag.isClosing) {
      parts.push(closingHtml(tag.name, openTags))
      continue
    }

    if (DROPPED_WITH_CONTENT_TAGS.includes(tag.name)) {
      index = skipToClosingTag(html, tag.name, tag.next)
      continue
    }

    if (!ALLOWED_TAGS.includes(tag.name)) {
      continue
    }

    parts.push(openingHtml(tag))
    if (!tag.selfClosing && !VOID_TAGS.includes(tag.name)) {
      openTags.push(tag.name)
    }
  }

  return [...parts, ...[...openTags].reverse().map((name) => `</${name}>`)].join("")
}

/** リンクの `href` に使ってよい URL か。判定は前後の空白を落とし、大文字小文字を無視して行う。 */
export function isAllowedLinkUrl(url: string): boolean {
  const trimmed = url.trim()
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return true
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)
  if (schemeMatch === null) {
    return false
  }

  return ALLOWED_LINK_SCHEMES.includes(`${(schemeMatch[1] ?? "").toLowerCase()}:`)
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

type ParsedTag = {
  readonly name: string
  readonly isClosing: boolean
  readonly selfClosing: boolean
  readonly attributes: readonly { readonly name: string; readonly value: string }[]
  /** タグの直後の位置。 */
  readonly next: number
}

/** `<` の位置から1つのタグを読む。タグとして読めなければ undefined を返す。 */
function parseTag(html: string, start: number): ParsedTag | undefined {
  const isClosing = html.startsWith("</", start)
  const nameStart = start + (isClosing ? 2 : 1)
  const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(nameStart))
  if (nameMatch === null) {
    return undefined
  }

  const name = nameMatch[0].toLowerCase()
  let index = nameStart + nameMatch[0].length
  const attributes: { name: string; value: string }[] = []
  let selfClosing = false

  while (index < html.length) {
    const rest = html.slice(index)
    const spaceMatch = /^\s+/.exec(rest)
    if (spaceMatch !== null) {
      index += spaceMatch[0].length
      continue
    }
    if (html.startsWith("/>", index)) {
      selfClosing = true
      index += 2
      break
    }
    if (html[index] === ">") {
      index += 1
      break
    }

    const attribute = parseAttribute(html, index)
    if (attribute === undefined) {
      index += 1
      continue
    }
    attributes.push({ name: attribute.name, value: attribute.value })
    index = attribute.next
  }

  return { name, isClosing, selfClosing, attributes, next: index }
}

function parseAttribute(
  html: string,
  start: number,
): { readonly name: string; readonly value: string; readonly next: number } | undefined {
  const nameMatch = /^[^\s=/>]+/.exec(html.slice(start))
  if (nameMatch === null) {
    return undefined
  }

  const name = nameMatch[0].toLowerCase()
  let index = start + nameMatch[0].length
  const afterName = /^\s*=\s*/.exec(html.slice(index))
  if (afterName === null) {
    return { name, value: "", next: index }
  }

  index += afterName[0].length
  const quote = html[index]
  if (quote === '"' || quote === "'") {
    const end = html.indexOf(quote, index + 1)
    if (end === -1) {
      return { name, value: html.slice(index + 1), next: html.length }
    }
    return { name, value: html.slice(index + 1, end), next: end + 1 }
  }

  const valueMatch = /^[^\s>]*/.exec(html.slice(index))
  const value = valueMatch === null ? "" : valueMatch[0]
  return { name, value, next: index + value.length }
}

function openingHtml(tag: ParsedTag): string {
  const attributes = tag.attributes
    .flatMap((attribute) => attributeHtml(tag.name, attribute))
    .join("")
  const closing = tag.selfClosing || VOID_TAGS.includes(tag.name) ? " />" : ">"

  return `<${tag.name}${attributes}${closing}`
}

function attributeHtml(
  tagName: string,
  attribute: { readonly name: string; readonly value: string },
): readonly string[] {
  if (attribute.name === "href") {
    return tagName === "a" && isAllowedLinkUrl(attribute.value)
      ? [` href="${escapeHtml(attribute.value.trim())}" rel="noopener noreferrer"`]
      : []
  }

  // marker はページ内の定義（`url(#id)`）だけを許す。外部を指す形は落とす。
  if (attribute.name === "marker-end" || attribute.name === "marker-start") {
    return /^url\(#[A-Za-z0-9_-]+\)$/.test(attribute.value.trim())
      ? [` ${attribute.name}="${escapeHtml(attribute.value.trim())}"`]
      : []
  }

  if (attribute.name === "style") {
    return isAllowedStyle(attribute.value) ? [` style="${escapeHtml(attribute.value)}"`] : []
  }

  if (!ALLOWED_ATTRIBUTES.includes(attribute.name)) {
    return []
  }

  return [` ${attribute.name}="${escapeHtml(attribute.value)}"`]
}

/** 外部を読みに行く記法・スクリプトを含む `style` を弾く（見た目を書く自由だけを残す）。 */
function isAllowedStyle(value: string): boolean {
  const lowered = value.toLowerCase()
  return !["url(", "@import", "expression(", "javascript:", "<"].some((forbidden) =>
    lowered.includes(forbidden),
  )
}

/** 対応する開きタグがあるときだけ閉じる。間に開いたままの要素があれば、それも閉じてから閉じる。 */
function closingHtml(name: string, openTags: string[]): string {
  const at = openTags.lastIndexOf(name)
  if (at === -1) {
    return ""
  }

  const closed = openTags.splice(at).reverse()
  return closed.map((tagName) => `</${tagName}>`).join("")
}

/** `<!-- -->` を読み飛ばす。コメントでなければ undefined。 */
function skipComment(html: string, start: number): number | undefined {
  if (!html.startsWith("<!--", start)) {
    return html.startsWith("<!", start) ? nextAfter(html, ">", start) : undefined
  }

  return nextAfter(html, "-->", start)
}

/** 中身ごと捨てる要素の閉じタグの直後まで進む。閉じられていなければ末尾まで捨てる。 */
function skipToClosingTag(html: string, name: string, start: number): number {
  const closing = new RegExp(`</\\s*${name}\\s*>`, "i").exec(html.slice(start))
  return closing === null ? html.length : start + closing.index + closing[0].length
}

function nextAfter(html: string, needle: string, start: number): number {
  const at = html.indexOf(needle, start)
  return at === -1 ? html.length : at + needle.length
}
