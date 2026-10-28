// 録った断片のファイルを読み、`components` の部品が 1 つ閉じる時刻を測る。
// 出すのは部品の数・時刻・字数・全文との一致だけで、部品の中身は出さない。
//
// 使い方:
//   node scripts/runtime/a2ui-streaming-trial.ts [<断片のファイル>]   # 既定は /tmp/a2ui-streaming/fragments.jsonl

import { readFileSync } from "node:fs"
import process from "node:process"

import { z } from "zod"

import {
  INITIAL_SPLIT_STATE,
  mismatchCount,
  splitComponents,
  type SplitState,
} from "../../src/server/session-driver/core/a2ui-component-splitter.ts"

const DEFAULT_INPUT = "/tmp/a2ui-streaming/fragments.jsonl"

const lineSchema = z.object({
  atMs: z.number(),
  eventType: z.string(),
  deltaType: z.string(),
  text: z.string(),
})
type Line = z.infer<typeof lineSchema>

type Closed = { readonly atMs: number; readonly chars: number }

function main(): void {
  const lines = readFileSync(process.argv[2] ?? DEFAULT_INPUT, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => lineSchema.parse(JSON.parse(line)))
  const fragments = lines.filter((line) => line.deltaType === "input_json_delta")
  if (fragments.length === 0) {
    process.stdout.write("input_json_delta の断片が無い\n")
    return
  }

  const closed = closedComponents(fragments)
  const wholeText = fragments.map((line) => line.text).join("")
  const mismatch = mismatchCount(closed.components, wholeText)
  const firstMs = closed.times[0]?.atMs ?? 0
  const lastMs = closed.times.at(-1)?.atMs ?? 0
  const lastFragmentMs = fragments.at(-1)?.atMs ?? 0
  const assistantMs = lines.find(
    (line) => line.eventType === "assistant" && line.atMs >= lastFragmentMs,
  )?.atMs

  const rows: readonly (readonly [string, string])[] = [
    ["切り出せた部品の数", String(closed.times.length)],
    ["全文を読んだ部品の数との不一致", mismatch === 0 ? "一致" : `不一致 ${mismatch} 件`],
    ["最初の断片(ms)", String(fragments[0]?.atMs ?? 0)],
    ["最初の部品が閉じた(ms)", String(firstMs)],
    ["全部の部品が閉じた(ms)", String(lastMs)],
    ["最初と全部の差(ms)", String(lastMs - firstMs)],
    ["最後の断片(ms)", String(lastFragmentMs)],
    ["呼び出し全体の assistant(ms)", assistantMs === undefined ? "なし" : String(assistantMs)],
    [
      "最初の部品から全体までの差(ms)",
      assistantMs === undefined ? "なし" : String(assistantMs - firstMs),
    ],
    ["引数の字数", String(wholeText.length)],
    ["部品の字数(最小/最大)", charRange(closed.times)],
  ]
  process.stdout.write(rows.map(([name, value]) => `${name.padEnd(36)} ${value}`).join("\n") + "\n")
}

function closedComponents(fragments: readonly Line[]): {
  readonly components: readonly unknown[]
  readonly times: readonly Closed[]
} {
  const result = fragments.reduce<{
    state: SplitState
    components: readonly unknown[]
    times: readonly Closed[]
  }>(
    (acc, line) => {
      const step = splitComponents(acc.state, line.text)
      return {
        state: step.state,
        components: [...acc.components, ...step.components],
        times: [
          ...acc.times,
          ...step.components.map((component) => ({
            atMs: line.atMs,
            chars: JSON.stringify(component).length,
          })),
        ],
      }
    },
    { state: INITIAL_SPLIT_STATE, components: [], times: [] },
  )
  return { components: result.components, times: result.times }
}

function charRange(times: readonly Closed[]): string {
  const chars = times.map((closed) => closed.chars)
  return chars.length === 0 ? "なし" : `${Math.min(...chars)}/${Math.max(...chars)}`
}

main()
