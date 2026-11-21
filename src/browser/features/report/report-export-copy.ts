// 最終レポートの根の要素から、HTML の書き出しに使う写しを作る。
// 根を複製してから書き換えるので、画面の DOM には触れない。
// 落とす・止める・字にする・開く要素は、部品が描くときに付けた `reportExportMark` の印だけで見分け、ここは部品の形を知らない。

import { reportExportCss } from "./report-export-css.ts"

const MARK = "data-report-export"
const MARK_VALUE = "data-report-export-value"

/** 部品が写しでの扱いを宣言する印。要素の props に広げて付ける。 */
export const reportExportMark = {
  /** 画面の操作だけの要素。写しから落とす。 */
  drop: { [MARK]: "drop" },
  /** 押せるパス。写しでは押せない等幅の字にする。 */
  plain: { [MARK]: "plain" },
  /** 操作で形が変わる部品。写しでは保存したときの値の1行（`text`）に替える。 */
  value: (text: string) => ({ [MARK]: "value", [MARK_VALUE]: text }),
  /** 用語の語の入れ物。写しでは語のあとに「注n」を足し、注（`note`）を末尾の用語の一覧へ開く。 */
  term: (note: string) => ({ [MARK]: "term", [MARK_VALUE]: note }),
  /** 末尾の用語の一覧の雛形。写しでは開いた語があれば表にして出し、無ければ外す。 */
  termList: { [MARK]: "term-list" },
} as const

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
  return copy
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
      return
    default:
      element.removeAttribute(MARK)
  }
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
