// 最終レポートの根の要素から、HTML の書き出しに使う写しを作る。
// 根を複製してから書き換えるので、画面の DOM には触れない。
// 落とす・止める・字にする・開く要素は、部品が描くときに付けた `reportExportMark` の印だけで見分け、ここは部品の形を知らない。

import { reportExportCss } from "./report-export-css.ts"

const MARK = "data-report-export"
const MARK_VALUE = "data-report-export-value"
const ZOOM_MARK = "data-report-export-zoom"

/** 部品が写しでの扱いを宣言する印。要素の props に広げて付ける。 */
export const reportExportMark = {
  /** 画面の操作だけの要素。写しから落とす。 */
  drop: { [MARK]: "drop" },
  /** 外の部品（Astryx）が中に操作の口を描く入れ物。写しでは中の `button` と札（`role="tooltip"`）を落とす。 */
  controls: { [MARK]: "controls" },
  /** 押せるパス。写しでは押せない等幅の字にする。 */
  plain: { [MARK]: "plain" },
  /** 操作で形が変わる部品。写しでは保存したときの値の1行（`text`）に替える。 */
  value: (text: string) => ({ [MARK]: "value", [MARK_VALUE]: text }),
  /** 用語の語の入れ物。写しでは語のあとに「注n」を足し、注（`note`）を末尾の用語の一覧へ開く。 */
  term: (note: string) => ({ [MARK]: "term", [MARK_VALUE]: note }),
  /** 末尾の用語の一覧の雛形。写しでは開いた語があれば表にして出し、無ければ外す。 */
  termList: { [MARK]: "term-list" },
  /** 描くときに色のトークンから hex へ解いた SVG の入れ物。`map` は小文字の hex からトークン名への JSON。写しでは焼いた hex を `var(--トークン, #hex)` に戻す。 */
  themedSvg: (map: string) => ({ [MARK]: "themed-svg", [MARK_VALUE]: map }),
  /** 中に Astryx の Collapsible（`aria-controls` を持つ見出しのボタンと開く側）を1つ持つ入れ物。写しでは JS なしで開閉できる `<details>` にする。 */
  fold: { [MARK]: "fold" },
  /**
   * 押すと拡大する図・画像。写しでは JS なしで開閉できる拡大（隠したチェックボックスと `<label>`）にする。
   * mermaid の図は同じ要素に `themedSvg` の印も付くので、ほかの印と別の属性で持つ。
   */
  zoom: { [ZOOM_MARK]: "" },
} as const

/** 写しの拡大の口の class。開いたときの見た目は書き出した文書の基礎の CSS（`REPORT_EXPORT_STYLE`）が持つ。 */
const ZOOM_TOGGLE_CLASS = "report-export-zoom-toggle"
const ZOOM_CLASS = "report-export-zoom"
const ZOOM_LABEL = "拡大して見る（もう一度押すと閉じる）"

const COLOR = /#[0-9a-f]{6}\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi
const COLOR_ATTRIBUTES = ["fill", "stroke", "style"] as const

/** 根の要素の写し（画面の操作を落とし動く部品を止めた形の HTML）と、写しに当たる CSS。 */
export function reportExport(root: Element): { readonly html: string; readonly css: string } {
  const copy = reportExportCopy(root)
  return { html: copy.outerHTML, css: reportExportCss(copy, root.ownerDocument) }
}

/** 根の要素の写し。印を読み替えたあとの要素で、文書には繋がっていない。 */
function reportExportCopy(root: Element): Element {
  const copy = root.cloneNode(true)
  if (!(copy instanceof Element)) {
    throw new Error("レポートの根の複製が要素にならなかった")
  }
  freezeCanvases(root, copy)
  for (const marked of copy.querySelectorAll(`[${MARK}]`)) {
    applyMark(marked)
  }
  dropDanglingDescribedBy(copy)
  openTermNotes(copy)
  for (const marked of copy.querySelectorAll(`[${MARK}="fold"]`)) {
    toDetails(marked)
  }
  copy.querySelectorAll(`[${ZOOM_MARK}]`).forEach(toZoom)
  return copy
}

/** 入れ物の中の Collapsible を、保存したときの開き方の `<details>` に替える。見出しと開く側の中身はそのまま移す。 */
function toDetails(marked: Element): void {
  marked.removeAttribute(MARK)
  const trigger = marked.querySelector("button[aria-controls]")
  const contentId = trigger?.getAttribute("aria-controls") ?? ""
  const content = [...marked.querySelectorAll("[id]")].find((element) => element.id === contentId)
  const root = trigger?.parentElement
  if (trigger === null || content === undefined || root === null || root === undefined) {
    return
  }
  const document = marked.ownerDocument
  const details = document.createElement("details")
  details.className = root.className
  if (trigger.getAttribute("aria-expanded") === "true") {
    details.setAttribute("open", "")
  }
  const summary = document.createElement("summary")
  summary.className = trigger.className
  summary.append(...trigger.childNodes)
  const body = document.createElement("div")
  body.append(...content.childNodes)
  details.append(summary, body)
  root.replaceWith(details)
}

/**
 * 図・画像を、押すと画面いっぱいに開き、もう一度押すと閉じる形にする。
 * 開閉の状態は直前に置く隠したチェックボックスが持ち、押す面は中に敷く `<label>`。
 * 押す口の要素は形（タグ・class）を保ったまま残し、集めた CSS の選択子が当たり続けるようにする。
 * ただし `button` は中の `<label>` の押下を奪うので、同じ class の字の入れ物に替える。
 */
function toZoom(marked: Element, index: number): void {
  const document = marked.ownerDocument
  const id = `report-export-zoom-${String(index + 1)}`
  marked.removeAttribute(ZOOM_MARK)
  const host = marked.closest("button")
  const trigger = host === null ? marked : spanOf(host)
  for (const attribute of ["role", "tabindex", "aria-label"]) {
    trigger.removeAttribute(attribute)
  }
  for (const button of trigger.querySelectorAll("button")) {
    spanOf(button)
  }
  const toggle = document.createElement("input")
  toggle.type = "checkbox"
  toggle.id = id
  toggle.className = ZOOM_TOGGLE_CLASS
  toggle.setAttribute("aria-label", ZOOM_LABEL)
  const label = document.createElement("label")
  label.htmlFor = id
  label.className = ZOOM_CLASS
  label.title = ZOOM_LABEL
  trigger.before(toggle)
  trigger.append(label)
}

/** `button` を、同じ class と中身の `span` に替えて返す。 */
function spanOf(button: Element): Element {
  const span = button.ownerDocument.createElement("span")
  span.className = button.className
  span.append(...button.childNodes)
  button.replaceWith(span)
  return span
}

/** 落とした札を指していた `aria-describedby` を外す。 */
function dropDanglingDescribedBy(copy: Element): void {
  const present = new Set([...copy.querySelectorAll("[id]")].map((element) => element.id))
  for (const element of copy.querySelectorAll("[aria-describedby]")) {
    const ids = (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((id) => id !== "")
    if (ids.some((id) => !present.has(id))) {
      element.removeAttribute("aria-describedby")
    }
  }
}

/** 用語の注を、本文の出る順に「注n」と振り、末尾の用語の一覧に開く。 */
function openTermNotes(copy: Element): void {
  const document = copy.ownerDocument
  const notes: { readonly label: string; readonly term: string; readonly note: string }[] = []
  for (const element of copy.querySelectorAll(`[${MARK}="term"]`)) {
    const label = `注${String(notes.length + 1)}`
    notes.push({
      label,
      term: element.textContent,
      note: element.getAttribute(MARK_VALUE) ?? "",
    })
    const sup = document.createElement("sup")
    sup.textContent = label
    element.append(sup)
    element.removeAttribute(MARK)
    element.removeAttribute(MARK_VALUE)
  }
  for (const list of copy.querySelectorAll(`[${MARK}="term-list"]`)) {
    if (notes.length === 0) {
      list.remove()
      continue
    }
    list.removeAttribute("hidden")
    list.removeAttribute(MARK)
    const dl = document.createElement("dl")
    for (const { label, term, note } of notes) {
      const dt = document.createElement("dt")
      dt.textContent = `${label} ${term}`
      const dd = document.createElement("dd")
      dd.textContent = note
      dl.append(dt, dd)
    }
    list.append(dl)
  }
}

/** 複製は canvas の描いた画素を持たないので、元の canvas の画を `img` にして差し替える。 */
function freezeCanvases(root: Element, copy: Element): void {
  const originals = [...root.querySelectorAll("canvas")]
  const copies = [...copy.querySelectorAll("canvas")]
  copies.forEach((canvas, index) => {
    const original = originals[index]
    if (original !== undefined) {
      freezeCanvas(original, canvas)
    }
  })
}

function freezeCanvas(original: HTMLCanvasElement, canvas: HTMLCanvasElement): void {
  try {
    const source = original.toDataURL("image/png")
    if (!source.startsWith("data:image/")) {
      return
    }
    const image = canvas.ownerDocument.createElement("img")
    image.src = source
    image.alt = canvas.getAttribute("aria-label") ?? ""
    image.className = canvas.className
    image.width = canvas.width
    image.height = canvas.height
    canvas.replaceWith(image)
  } catch {
    // 外から読んだ画を描いた canvas は書き出せないので、複製の canvas を残す
  }
}

function applyMark(element: Element): void {
  const document = element.ownerDocument
  switch (element.getAttribute(MARK)) {
    case "drop":
      element.remove()
      return
    case "controls":
      for (const control of element.querySelectorAll('button, [role="tooltip"]')) {
        control.remove()
      }
      element.removeAttribute(MARK)
      return
    case "plain":
      element.replaceWith(plainCode(element))
      return
    case "value": {
      const line = document.createElement("p")
      line.textContent = element.getAttribute(MARK_VALUE) ?? ""
      element.replaceWith(line)
      return
    }
    case "term":
    case "term-list":
    case "fold":
      return
    case "themed-svg":
      restoreTokens(element)
      return
    default:
      element.removeAttribute(MARK)
  }
}

/** 入れ物の中の `<style>` の文と色の属性にある、対応のある hex を `var(--トークン, #hex)` にして、印を外す。 */
function restoreTokens(element: Element): void {
  const tokens = parseTokenMap(element.getAttribute(MARK_VALUE) ?? "")
  const restore = (text: string): string =>
    text.replace(COLOR, (color) => {
      const token = tokens.get(hexOf(color))
      return token === undefined ? color : `var(${token}, ${color})`
    })
  for (const style of element.querySelectorAll("style")) {
    style.textContent = restore(style.textContent)
  }
  for (const attribute of COLOR_ATTRIBUTES) {
    for (const target of element.querySelectorAll(`[${attribute}]`)) {
      target.setAttribute(attribute, restore(target.getAttribute(attribute) ?? ""))
    }
  }
  element.removeAttribute(MARK)
  element.removeAttribute(MARK_VALUE)
}

/** 色の表記を小文字の `#rrggbb` にする。`<style>` の文は mermaid の通ったあと `rgb(r, g, b)` で並ぶことがある。 */
function hexOf(color: string): string {
  if (color.startsWith("#")) {
    return color.toLowerCase()
  }
  const channels = color.match(/\d+/g) ?? []
  return `#${channels.map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`
}

function parseTokenMap(json: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(json)
  return new Map(
    typeof parsed === "object" && parsed !== null
      ? Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
      : [],
  )
}

/** 押せるパスの中身を押せない `code` にする。中身がすでに `code` 1つなら、それだけを残す。 */
function plainCode(element: Element): Element {
  const [only] = element.children
  if (element.children.length === 1 && only?.tagName === "CODE") {
    return only
  }
  const code = element.ownerDocument.createElement("code")
  code.append(...element.childNodes)
  return code
}
