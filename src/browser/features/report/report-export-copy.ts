// 最終レポートの根の要素から、HTML の書き出しに使う写しを作る。
// 根を複製してから書き換えるので、画面の DOM には触れない。
// 落とす・止める・字にする要素は、部品が描くときに付けた `reportExportMark` の印だけで見分け、ここは部品の形を知らない。

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
  return copy
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
