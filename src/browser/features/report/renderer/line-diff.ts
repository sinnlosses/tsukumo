// 前後の2つのソースを行に切り、LCS で揃えて1つの `diff` の本文にする。

import { commonIndexPairs } from "./word-diff.ts"

/** 左右で揃えた1行。`removed` は前の側だけ、`added` は後の側だけにある。 */
type AlignedLine =
  | { readonly change: "same" | "changed"; readonly before: number; readonly after: number }
  | { readonly change: "removed"; readonly before: number }
  | { readonly change: "added"; readonly after: number }

/** どちらかの側の行がこの数を超えたら比べない。 */
const LINE_DIFF_MAX_LINES = 200

/**
 * 前後を1つの `diff` の本文にする。変わった行の連なりは、前の行（`-`）を先に、後の行（`+`）をあとに並べる。
 * 行が上限を超えたら `undefined`。
 */
export function unifiedDiffSource(before: string, after: string): string | undefined {
  const aligned = diffLines(before, after)
  if (aligned === undefined) {
    return undefined
  }
  const left = splitLines(before)
  const right = splitLines(after)
  const runs = aligned.reduce<readonly (readonly AlignedLine[])[]>((done, line) => {
    const last = done.at(-1)
    return line.change !== "same" && last?.[0]?.change !== undefined && last[0].change !== "same"
      ? [...done.slice(0, -1), [...last, line]]
      : [...done, [line]]
  }, [])
  return runs
    .flatMap((run) => [
      ...run.flatMap((line) =>
        line.change === "same"
          ? [` ${left[line.before] ?? ""}`]
          : "before" in line
            ? [`-${left[line.before] ?? ""}`]
            : [],
      ),
      ...run.flatMap((line) =>
        line.change !== "same" && "after" in line ? [`+${right[line.after] ?? ""}`] : [],
      ),
    ])
    .join("\n")
}

/**
 * 共通の行の間の隙間では、前の n 行と後の m 行を頭から min(n, m) 行ずつ変えた行の対にし、
 * 余りを消した行か足した行にする。行が上限を超えたら `undefined`。
 */
function diffLines(before: string, after: string): readonly AlignedLine[] | undefined {
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
