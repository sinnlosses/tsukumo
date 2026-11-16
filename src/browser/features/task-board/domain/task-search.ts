// サイドバーの探す欄。段ごとの絞り込み・題の当たり範囲・↑↓ の位置。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import type { CodeSpanPart } from "../../../domain/code-span.ts"
import { matchesQuery } from "./task-board-filter.ts"
import { stageTasks, type TaskStageGroup } from "./task-stage.ts"

export type MatchedPart = {
  readonly kind: "text" | "code"
  readonly text: string
  readonly matched: boolean
}

/** 語に当たるタスクだけを残した段の並び。当たりの無い段は含めず、空の語は stageTasks と同じ。 */
export function searchStages(
  items: readonly TaskSummaryItem[],
  query: string,
): readonly TaskStageGroup[] {
  return stageTasks(items).flatMap((group) => {
    const tasks = group.tasks.filter((task) => matchesQuery(task, query))
    return tasks.length === 0 ? [] : [{ stage: group.stage, tasks }]
  })
}

/** 絞っているか。matchesQuery の空判定と同じく前後の空白は無視する。 */
export function isSearching(query: string): boolean {
  return query.trim() !== ""
}

/** 題の片を語に当たる範囲で割る。コードの片の境界をまたぐ当たりは、片ごとに割れる。 */
export function titleMatchParts(
  parts: readonly CodeSpanPart[],
  query: string,
): readonly MatchedPart[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") {
    return parts.map((part) => ({ ...part, matched: false }))
  }
  const whole = parts.map((part) => part.text).join("")
  const hit = matchedFlags(whole.toLowerCase(), needle)
  let offset = 0
  return parts.flatMap((part) => {
    const start = offset
    offset += part.text.length
    return runsOf(part, hit.slice(start, offset))
  })
}

/** 当たりの並びの中の位置を動かす。端で止まり、当たりが0件なら -1。範囲外からの ↓ は先頭へ。 */
export function moveActiveIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) {
    return -1
  }
  if (current < 0 || current >= count) {
    return delta === 1 ? 0 : count - 1
  }
  return Math.min(count - 1, Math.max(0, current + delta))
}

function matchedFlags(haystack: string, needle: string): readonly boolean[] {
  const flags = Array.from({ length: haystack.length }, () => false)
  let from = haystack.indexOf(needle)
  while (from !== -1) {
    flags.fill(true, from, from + needle.length)
    from = haystack.indexOf(needle, from + needle.length)
  }
  return flags
}

function runsOf(part: CodeSpanPart, flags: readonly boolean[]): readonly MatchedPart[] {
  const runs: MatchedPart[] = []
  let begin = 0
  for (let index = 1; index <= part.text.length; index += 1) {
    if (index === part.text.length || flags[index] !== flags[begin]) {
      runs.push({
        kind: part.kind,
        text: part.text.slice(begin, index),
        matched: flags[begin] === true,
      })
      begin = index
    }
  }
  return runs
}
