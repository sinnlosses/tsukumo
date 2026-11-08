// 作業でした手を1行ずつ、状態・補足・開いて見る出力つきで並べる `trace` の塊の形。

import { z } from "zod"

import { partCardNote } from "./part-card-note.ts"
import { aside, fold, inlineText, omittable } from "./report-block-field.ts"

/** 行の状態。`ok` は済み、`ng` は落ちた、`notStarted` は未着手。 */
const TRACE_STATUSES = ["ok", "ng", "notStarted"] as const

const traceItemSchema = z.object({
  title: partCardNote(inlineText, "した手を1行で"),
  status: z.enum(TRACE_STATUSES),
  supplement: partCardNote(omittable(z.string(), ""), "右に添える所要・差分の行数・場所"),
  output: partCardNote(
    omittable(z.string(), ""),
    "開いて見るコマンドの出力やコードの字（記法なし）",
  ),
})

export const traceBlockSchema = z.object({
  kind: z.literal("trace"),
  items: partCardNote(
    z.array(traceItemSchema).min(1),
    "調べた順・試した順の手と成否。段ごとに文が要る一本道は list の flow、時刻の区間は timeline、検証の結果は checks",
  ),
  fold,
  aside,
})
