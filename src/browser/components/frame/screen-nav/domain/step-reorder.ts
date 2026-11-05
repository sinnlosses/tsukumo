// ワークフローの設定の並びを、つかんで並べ替える計算。
// 添字の `to` は、動かしたあとの並びでつかんだ行が占める位置。
// 置き場所の線の `slot` は行の間の番号で、0 が先頭の行の上、並びの長さが末尾の行の下。

/** 行の縦の範囲。`DOMRect` をそのまま渡せる。 */
export type StepRowBounds = { readonly top: number; readonly bottom: number }

export type StepGrab =
  | { readonly kind: "idle" }
  | { readonly kind: "grabbed"; readonly from: number; readonly to: number }

/** キーボードの Space が `toggle`、↑↓ が `up`・`down`、Esc が `cancel`。 */
export type StepGrabAction = "toggle" | "up" | "down" | "cancel"

export type StepGrabOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "moved"; readonly from: number; readonly to: number }
  /** つかんだ位置のまま置いた。 */
  | { readonly kind: "placed"; readonly index: number }
  /** Esc でつかむ前の位置へ戻した。 */
  | { readonly kind: "cancelled"; readonly index: number }

type StepGrabTransition = {
  readonly grab: StepGrab
  readonly outcome: StepGrabOutcome
}

export function reorderSteps<T>(steps: readonly T[], from: number, to: number): readonly T[] {
  const moving = steps[from]
  if (moving === undefined || to < 0 || to >= steps.length || from === to) {
    return steps
  }
  const rest = steps.filter((_step, position) => position !== from)
  return [...rest.slice(0, to), moving, ...rest.slice(to)]
}

/**
 * ポインタの y から置き場所を決める。
 * `rows` はつかむ前の並びの矩形で、中点がポインタより上にある行の数が、線を引く行の間になる。
 */
export function dropIndexAt(
  rows: readonly StepRowBounds[],
  from: number,
  pointerY: number,
): number {
  const slot = rows.filter((row) => (row.top + row.bottom) / 2 < pointerY).length
  return slot > from ? slot - 1 : slot
}

export function dropLineSlot(from: number, to: number): number {
  return to > from ? to + 1 : to
}

/** `index` はキーを受けた行の添字で、つかむ前だけ読む。 */
export function nextStepGrab(
  grab: StepGrab,
  index: number,
  action: StepGrabAction,
  length: number,
): StepGrabTransition {
  if (grab.kind === "idle") {
    return action === "toggle" && length > 1
      ? { grab: { kind: "grabbed", from: index, to: index }, outcome: { kind: "none" } }
      : { grab, outcome: { kind: "none" } }
  }
  switch (action) {
    case "up":
      return { grab: { ...grab, to: Math.max(grab.to - 1, 0) }, outcome: { kind: "none" } }
    case "down":
      return {
        grab: { ...grab, to: Math.min(grab.to + 1, length - 1) },
        outcome: { kind: "none" },
      }
    case "toggle":
      return {
        grab: { kind: "idle" },
        outcome:
          grab.from === grab.to
            ? { kind: "placed", index: grab.from }
            : { kind: "moved", from: grab.from, to: grab.to },
      }
    case "cancel":
      return { grab: { kind: "idle" }, outcome: { kind: "cancelled", index: grab.from } }
  }
}
