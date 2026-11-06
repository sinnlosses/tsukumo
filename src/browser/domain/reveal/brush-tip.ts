// 筆先（いまレポートを書いている場所。次の部品・次の節が出る欄）を配る。ミニ立ち絵はここに立つ。
//
// `SessionState` には入れない。サーバから来るものではなく、ブラウザの描画のあいだだけ存在する値だから。
//
// 書き上げたあとも筆先は消えない。
// 書き終わった位置に `resting` として残り、次に書き始めたときだけそちらへ移る。
// undefined に戻るのは、まだ一度も書いていないときだけ。
//
// ただし筆先はやり取り1つに属する（`turnId`）。
// 座標は本文の入れ物の原点基準なので、次の依頼で本文が入れ替わると、同じ座標の先には違う本文があり、残った筆先が新しい本文の上へ浮く（画面で出た）。
// 捨てずに持たせておくのは、過去のターンを見て戻ったときに元の場所へそのまま戻れるようにするため。
//
// 演出は同時に1つしか走らないので、1つだけ持つ。

import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

/**
 * 筆先の座標の原点になる入れ物の印（メインビューが `.main-turns` に付ける）。
 * 原点が動くと座標の意味が変わるので、印の名前と {@link BrushPlace} の説明を離さない。
 */
export const BRUSH_ORIGIN_ATTRIBUTE = "data-brush-origin"

/**
 * 筆先の位置。本文の入れ物（{@link BRUSH_ORIGIN_ATTRIBUTE} を付けた要素）の左上が原点で、ビューポート座標ではない。
 * 追従する側はその入れ物の中に `position: absolute` で置く。
 *
 * 原点を本文側に取るのは、書き終わった筆先がそこに残るから。
 * ビューポート基準のまま残すと、本文を転がしたときに関係ない場所へ浮いたまま居座る。
 */
type BrushPlace = {
  readonly x: number
  readonly top: number
  readonly bottom: number
}

/**
 * 筆先。書いている最中と、書き終わってそこに残っているのを1つの印で見分ける。
 *
 * - `drafting`: 次の部品・次の節が出るのを待っている。位置はその欄（`top` / `bottom` はその上端と下端、`x` はその右端）。`arrivedCount` はそれまでに出た部品・節の数で、増えたら追従する側が跳ねる
 * - `resting`: 書き終わってその場に残っている。次に書き始めるまで消えない
 */
export type BrushTip = BrushPlace & {
  /**
   * この筆先を出したやり取り（`MainViewTurn.id`）。筆先はそのやり取りの本文の上にしか意味を持たない。
   * 別のやり取りが出ているあいだ、座標の先には違う本文があるので、追従する側はここを見て引っ込む。
   */
  readonly turnId: number
} & ({ readonly phase: "resting" } | { readonly phase: "drafting"; readonly arrivedCount: number })

export function publishBrushTip(next?: BrushTip): void {
  useBrushTipStore.setState({ tip: next })
}

/**
 * 書いていた筆先を最後に配ったところに残す。演出が終わるときの落とし先。
 * 書いていなければ何もしない（前に残した筆先を消さないようにする）。
 */
export function restBrushTip(): void {
  const tip = useBrushTipStore.getState().tip
  if (tip === undefined || tip.phase === "resting") {
    return
  }
  publishBrushTip({
    phase: "resting",
    turnId: tip.turnId,
    x: tip.x,
    top: tip.top,
    bottom: tip.bottom,
  })
}

/** 追従の間合いを決める種別。書いているあいだは `drafting`、書き終わって残っているあいだは `resting`。 */
export type BrushMotion = BrushTip["phase"]

/** 筆先のうち、位置を除いたもの。値が変わるのは書き始めと書き終わりだけ。 */
export type BrushStance = {
  readonly turnId: number
  readonly motion: BrushMotion
}

/**
 * いまの筆先の、どのやり取りのどの種別か（まだ一度も書かれていなければ undefined）。
 * 位置は読まない。位置まで購読すると、筆先が動くたびに描き直しになる（位置は {@link subscribeBrushTip}）。
 */
export function useBrushStance(): BrushStance | undefined {
  return useBrushTipStore(
    useShallow((state) => (state.tip === undefined ? undefined : stanceOf(state.tip))),
  )
}

/**
 * 筆先を、React の描画を通さずに受け取る。呼んだその場でいまの筆先を1回渡し、以後は変わるたびに渡す。
 * 戻り値を呼ぶと受け取りをやめる。
 */
export function subscribeBrushTip(listener: (tip?: BrushTip) => void): () => void {
  listener(useBrushTipStore.getState().tip)
  return useBrushTipStore.subscribe((state) => {
    listener(state.tip)
  })
}

type BrushTipState = {
  readonly tip?: BrushTip
}

const useBrushTipStore = create<BrushTipState>()(() => ({ tip: undefined }))

function stanceOf(tip: BrushTip): BrushStance {
  return { turnId: tip.turnId, motion: tip.phase }
}
