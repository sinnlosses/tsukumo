// 確定したレポートの塊（節）を、上から順に間隔を空けてポンと出す本体。
// DOM は完成品のまま置き、出す前の塊は場所を取ったまま `opacity` で隠す（本文の高さは最初から変わらない）。
// 筆先は「次に出す塊」の頭の行を配り、ミニ立ち絵はその右で書く仕草をする。出し切ったら筆先を休ませる。

import { playClassOnce } from "../../utils/play-class-once.ts"
import { BRUSH_ORIGIN_ATTRIBUTE, publishBrushTip, restBrushTip } from "./brush-tip.ts"
import { isShortReport, popBlocksOf, type PopBlock } from "./plan.ts"

/** まだ出していない塊に付ける印（やり取りの列が、出た節だけを並べるために読む）。 */
export const REVEAL_PENDING_ATTRIBUTE = "data-reveal"

/** 塊を出しているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/** 演出の全体の上限（ms）。塊が多いレポートは間隔を詰めて、この長さに収める。 */
const TOTAL_LIMIT_MS = 3000

/** 演出を飛ばす合図。本文に触りに来た操作だけを並べる（ホイール・指で先を読むのは「見ていたい」の側なので入れない）。 */
const SKIP_EVENT_NAMES = ["pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

type PopOptions = {
  /** 塊を1つ出してから次を出すまでの間隔（ms）。 */
  readonly intervalMs: number
  /** 出した塊に1回だけ付ける、ポンの animation を持つ class。 */
  readonly popClassName: string
}

/**
 * 根の下の塊を隠し、先頭の塊をその場で出してから、残りを間隔ごとに1つずつ出す。
 * 戻り値を呼ぶとその場で残りを全部出す（スキップと、部品が外れたときの後始末を兼ねる）。
 */
export function startPop(root: HTMLElement, turnId: number, options: PopOptions): () => void {
  const blocks = isShortReport(root) ? [] : popBlocksOf(root)
  if (blocks.length === 0) {
    return () => undefined
  }

  for (const block of blocks) {
    hide(block)
  }
  root.setAttribute(REVEALING_ATTRIBUTE, "yes")

  // 筆先の座標の原点。印が見つからなければ筆先を配らない（ミニ立ち絵は出ないが、塊は出す）。
  const origin = root.closest(`[${BRUSH_ORIGIN_ATTRIBUTE}]`)
  const intervalMs = Math.min(options.intervalMs, TOTAL_LIMIT_MS / blocks.length)
  let shown = 0
  let timer: ReturnType<typeof setTimeout> | undefined = undefined
  let finished = false

  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    clearTimeout(timer)
    for (const block of blocks.slice(shown)) {
      pop(block, options.popClassName)
    }
    shown = blocks.length
    root.removeAttribute(REVEALING_ATTRIBUTE)
    if (origin !== null) {
      restBrushTip()
    }
    for (const name of SKIP_EVENT_NAMES) {
      window.removeEventListener(name, finish, SKIP_LISTENER_OPTIONS)
    }
  }

  const next = (): void => {
    const block = blocks.at(shown)
    if (block === undefined) {
      finish()
      return
    }
    pop(block, options.popClassName)
    shown += 1
    const waiting = blocks.at(shown)
    if (waiting === undefined) {
      finish()
      return
    }
    if (origin !== null) {
      publishBrushTip({
        ...placeOf(waiting, origin),
        turnId,
        phase: "drafting",
        arrivedCount: shown,
      })
    }
    timer = setTimeout(next, intervalMs)
  }

  // 塊が1つなら `next` の中で出し切って外すので、聞き始めるのは先にする。
  for (const name of SKIP_EVENT_NAMES) {
    window.addEventListener(name, finish, SKIP_LISTENER_OPTIONS)
  }
  next()

  return finish
}

function hide(block: PopBlock): void {
  for (const element of block) {
    element.setAttribute(REVEAL_PENDING_ATTRIBUTE, "pending")
    element.style.opacity = "0"
  }
}

function pop(block: PopBlock, popClassName: string): void {
  for (const element of block) {
    element.removeAttribute(REVEAL_PENDING_ATTRIBUTE)
    element.style.removeProperty("opacity")
    playClassOnce(element, popClassName)
  }
}

/** 次に出す塊の頭の行（先頭の子。無ければ塊そのもの）の右端と上下端を、原点の左上から測る。 */
function placeOf(
  block: PopBlock,
  origin: Element,
): { readonly x: number; readonly top: number; readonly bottom: number } {
  const head = block[0].firstElementChild ?? block[0]
  const box = head.getBoundingClientRect()
  const base = origin.getBoundingClientRect()
  return { x: box.right - base.left, top: box.top - base.top, bottom: box.bottom - base.top }
}
