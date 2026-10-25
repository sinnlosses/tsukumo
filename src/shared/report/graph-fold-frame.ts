// 折り返し配置の群の囲み。群が行をまたぐと行ごとに分け、群の外の箱に掛かる囲みは箱ごとに分ける。

import {
  emptyBox,
  FRAME_PAD,
  FRAME_TITLE,
  type FoldBox,
  type FoldFrame,
  type FoldSlot,
} from "./graph-fold-figure.ts"
import type { GraphSourceReading } from "./graph-source.ts"
import { groupGrounds } from "./report-graph-markdown.ts"

/**
 * 群を行ごとの囲みに分ける。同じ行で隣り合う列の箱がみな群のものなら1つに囲み、
 * 囲みが群の外の箱に掛かるときは箱ごとに囲む。題は読む順で最初の囲みにだけ付ける。
 */
export function framesOf(
  { groups }: GraphSourceReading,
  boxes: readonly FoldBox[],
  slots: ReadonlyMap<number, FoldSlot>,
): readonly FoldFrame[] {
  const grounds = groupGrounds(groups)
  return groups.flatMap((group, groupIndex) => {
    const ground = grounds[groupIndex] ?? 0
    const members = new Set(group.nodes)
    const rows = [...new Set(group.nodes.map((at) => slots.get(at)?.row ?? 0))].toSorted(
      (a, b) => a - b,
    )
    const pieces = rows.flatMap((row) => {
      const inRow = group.nodes
        .filter((at) => slots.get(at)?.row === row)
        .toSorted((a, b) => (boxes[a]?.x ?? 0) - (boxes[b]?.x ?? 0))
      const runs: number[][] = []
      for (const at of inRow) {
        const last = runs.at(-1)
        const lastColumn = slots.get(last?.at(-1) ?? -1)?.column
        const column = slots.get(at)?.column
        if (
          last !== undefined &&
          lastColumn !== undefined &&
          column !== undefined &&
          column - lastColumn <= 1
        ) {
          last.push(at)
        } else {
          runs.push([at])
        }
      }
      const reversed = row % 2 === 1
      const ordered = reversed ? runs.toReversed() : runs
      return ordered.flatMap((run) => {
        const whole = boundsOf(run.map((at) => boxes[at] ?? emptyBox))
        const intruded = boxes.some(
          (box) => box.node >= 0 && !members.has(box.node) && overlaps(whole, box),
        )
        return intruded ? run.map((at) => boundsOf([boxes[at] ?? emptyBox])) : [whole]
      })
    })
    return pieces.map((bounds, index): FoldFrame => ({
      x: bounds.x - FRAME_PAD,
      y: bounds.y - FRAME_PAD - (index === 0 ? FRAME_TITLE : 0),
      width: bounds.width + FRAME_PAD * 2,
      height: bounds.height + FRAME_PAD * 2 + (index === 0 ? FRAME_TITLE : 0),
      title: index === 0 ? group.name : "",
      tone: group.tone,
      ground,
    }))
  })
}

type Bounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function boundsOf(list: readonly Bounds[]): Bounds {
  const x = Math.min(...list.map((b) => b.x))
  const y = Math.min(...list.map((b) => b.y))
  const right = Math.max(...list.map((b) => b.x + b.width))
  const bottom = Math.max(...list.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}
