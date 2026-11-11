// 「聞く・頼む」を出す先として指せる単位（表の行・案・主張・部品の題の行か部品全体）。
// 単位の要素は `data-reply-unit`（`leaf` か `row`）と、行なら `data-reply-row`（書いた並びの添字）・`data-reply-label`（1列目の字）を持つ。
// 頼むの欄に定型の書き始めがある単位（案・主張）は `data-reply-request` に字を持つ。
// 単位を持つ部品の外枠は `data-reply-frame` に部品の鍵を持つ。

export type ReplyUnit = {
  /** 部品の鍵（`askLeafKey`）。 */
  readonly leafKey: string
  /** 行・案・主張を指したときだけ。無ければ部品全体。`requestText` は頼むの欄の書き始めの字（無ければ空）。 */
  readonly row?: {
    readonly index: number
    readonly firstCell: string
    readonly requestText: string
  }
}

export const UNIT_SELECTOR = "[data-reply-unit]"

/** 欄を開く近道 ⌘⌥M。 */
export function isOpenShortcut(event: Pick<KeyboardEvent, "metaKey" | "altKey" | "code">): boolean {
  return event.metaKey && event.altKey && event.code === "KeyM"
}

/** 単位の要素から、指す単位を読む。行の印が無ければ部品全体。 */
export function replyUnitOf(element: Element, leafKey: string): ReplyUnit {
  const index = element.getAttribute("data-reply-row")
  if (index === null) {
    return { leafKey }
  }
  return {
    leafKey,
    row: {
      index: Number(index),
      firstCell: element.getAttribute("data-reply-label") ?? "",
      requestText: element.getAttribute("data-reply-request") ?? "",
    },
  }
}
