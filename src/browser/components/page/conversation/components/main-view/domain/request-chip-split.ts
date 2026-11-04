// 依頼の文面を、札（slash コマンド・タスク）と地の文に分ける。
// 札に起こした字は地の文から抜く。全文には元の文面が残る（こちらは `turnRequestLines`）。
//
// タスクの札は、依頼の中の語のうち、読めているタスクの一覧にある ID と大文字小文字を無視して一致したものだけ。
// 一覧が読めていないときと、一覧に無い ID らしい語は札にしない。

import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../../../../shared/repository/task-summary.ts"
import { turnRequestLines } from "./turn-title.ts"

export type RequestChipTask = {
  readonly id: string
  readonly summary: string
}

export type RequestChips = {
  /** 先頭の slash コマンド（`/next-task`）。名前空間（`plugin:`）は落とす。無ければ undefined。 */
  readonly command: string | undefined
  readonly tasks: readonly RequestChipTask[]
  /** 札に起こした字を抜いた残り。空のときは空文字列。 */
  readonly prose: string
}

const LEADING_COMMAND = /^\s*\/(\S+)/
const WORD = /[A-Za-z0-9_]+(?:[-.][A-Za-z0-9_]+)*/g

export function requestChips(text: string, tasks: TaskSummaryResult | undefined): RequestChips {
  let lines = turnRequestLines({ text, images: [] })

  let command: string | undefined
  const first = lines[0]
  const commandMatch = first === undefined ? undefined : (LEADING_COMMAND.exec(first) ?? undefined)
  if (first !== undefined && commandMatch !== undefined) {
    const name = (commandMatch[1] ?? "").replace(/^[^:]*:/, "")
    command = `/${name}`
    lines = [first.slice(commandMatch[0].length), ...lines.slice(1)]
  }

  const known = new Map<string, TaskSummaryItem>()
  if (tasks?.kind === "known") {
    for (const item of tasks.items) {
      known.set(item.id.toLowerCase(), item)
    }
  }

  const found: RequestChipTask[] = []
  lines = lines.map((line) => {
    const rewritten = line.replace(WORD, (word) => {
      const item = known.get(word.toLowerCase())
      if (item === undefined) {
        return word
      }
      if (!found.some((chip) => chip.id === item.id)) {
        found.push({ id: item.id, summary: item.summary })
      }
      return ""
    })
    return rewritten === line ? line : rewritten.replace(/[ \t]{2,}/g, " ").trim()
  })

  return { command, tasks: found, prose: proseOf(lines) }
}

/** 前後の空行を落とし、字下げは残す。 */
function proseOf(lines: readonly string[]): string {
  const cleaned = lines.map((line, index) => (index === 0 ? line.trimStart() : line))
  const first = cleaned.findIndex((line) => line.trim() !== "")
  const last = cleaned.findLastIndex((line) => line.trim() !== "")
  return first === -1 ? "" : cleaned.slice(first, last + 1).join("\n")
}
