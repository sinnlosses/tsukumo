// 前後の2つのソースを行に切り、LCS で揃えた行の並びを返す。

import { commonIndexPairs } from "./word-diff.ts"

export type LineChange = "same" | "changed" | "removed" | "added"

/** 左右で揃えた1行。`removed` は前の側だけ、`added` は後の側だけにある。 */
export type AlignedLine =
  | { readonly change: "same" | "changed"; readonly before: number; readonly after: number }
  | { readonly change: "removed"; readonly before: number }
  | { readonly change: "added"; readonly after: number }

/** 片側の1行。`gap` は向かいの側にだけある行の高さを揃える空の行。 */
export type SideLine =
  | { readonly kind: "line"; readonly index: number; readonly change: LineChange }
  | { readonly kind: "gap" }

export type LineDiffSide = "before" | "after"

/** 前後の片側に描く行の並び。 */
export type SideLineDiff = { readonly side: LineDiffSide; readonly lines: readonly SideLine[] }

/** どちらかの側の行がこの数を超えたら比べない。 */
const LINE_DIFF_MAX_LINES = 200

/**
 * 共通の行の間の隙間では、前の n 行と後の m 行を頭から min(n, m) 行ずつ変えた行の対にし、
 * 余りを消した行か足した行にする。行が上限を超えたら `undefined`。
 */
export function diffLines(before: string, after: string): readonly AlignedLine[] | undefined {
  const left = splitLines(before)
  const right = splitLines(after)
  if (left.length > LINE_DIFF_MAX_LINES || right.length > LINE_DIFF_MAX_LINES) {
    return undefined
  }
  const common = commonIndexPairs(left, right)
  const starts: readonly (readonly [number, number])[] = [
    [0, 0],
    ...common.map(([i, j]): readonly [number, number] => [i + 1, j + 1]),
  ]
  const ends: readonly (readonly [number, number])[] = [...common, [left.length, right.length]]
  return ends.flatMap(([i, j], index): readonly AlignedLine[] => {
    const [startBefore, startAfter] = starts[index] ?? [0, 0]
    const gap = alignGap(startBefore, i, startAfter, j)
    return index < common.length ? [...gap, { change: "same", before: i, after: j }] : gap
  })
}

/** 揃えた並びを片側から見た行の並びにする。 */
export function sideLines(
  aligned: readonly AlignedLine[],
  side: LineDiffSide,
): readonly SideLine[] {
  return aligned.map((line) => {
    if (side === "before") {
      return "before" in line
        ? { kind: "line", index: line.before, change: line.change }
        : { kind: "gap" }
    }
    return "after" in line
      ? { kind: "line", index: line.after, change: line.change }
      : { kind: "gap" }
  })
}

function splitLines(source: string): readonly string[] {
  return source.replace(/\n$/, "").split("\n")
}

function alignGap(
  startBefore: number,
  endBefore: number,
  startAfter: number,
  endAfter: number,
): readonly AlignedLine[] {
  const beforeCount = endBefore - startBefore
  const afterCount = endAfter - startAfter
  const paired = Math.min(beforeCount, afterCount)
  return [
    ...Array.from({ length: paired }, (_, k): AlignedLine => ({
      change: "changed",
      before: startBefore + k,
      after: startAfter + k,
    })),
    ...Array.from({ length: beforeCount - paired }, (_, k): AlignedLine => ({
      change: "removed",
      before: startBefore + paired + k,
    })),
    ...Array.from({ length: afterCount - paired }, (_, k): AlignedLine => ({
      change: "added",
      after: startAfter + paired + k,
    })),
  ]
}
