// 選んだやり取り1つの記録を、会話の流れの行の並びに変える。
// 並べる鍵は記録の位置で、時刻では並べ直さない。時刻は行の脇に出すためだけに添える。

import { recordTimeAt, type SessionRecord } from "../../../shared/session/session-record.ts"
import type { Turn } from "../../../shared/session/turn.ts"

type RecordOf<K extends SessionRecord["kind"]> = Extract<SessionRecord, { readonly kind: K }>

/**
 * 会話の流れの1行。
 *
 * - `post`: 右寄せの投稿（依頼・補足）
 * - `say`: 左寄せの行（セリフ・反応）
 * - `step`: 段の札（ワークプランの記録・中間の本文）
 * - `question`: 答え終わった質問の記録
 * - `report`: 最終レポートの紙
 * - `failure`: ターンの末尾の失敗・中断の表示
 *
 * `at` は行の脇に出す時刻（エポックミリ秒）。時刻を持たない記録と、時刻が分からない記録（`restored`）は付けない。
 */
export type ConversationStreamRow =
  | {
      readonly kind: "post"
      readonly origin: "request" | "aside"
      readonly record: RecordOf<"request"> | RecordOf<"aside">
      readonly at?: number
    }
  | {
      readonly kind: "say"
      readonly origin: "speech" | "reaction"
      readonly record: RecordOf<"speech"> | RecordOf<"reaction">
      readonly at?: number
    }
  | {
      readonly kind: "step"
      readonly record: RecordOf<"work-plan"> | RecordOf<"detail">
      readonly at?: number
    }
  | { readonly kind: "question"; readonly record: RecordOf<"question"> }
  | { readonly kind: "report"; readonly record: RecordOf<"report">; readonly at?: number }
  | {
      readonly kind: "failure"
      readonly record: RecordOf<"turn-failure"> | RecordOf<"turn-interrupted">
    }

/**
 * やり取り1つ（{@link Turn}）の記録を、記録の位置の順のまま流れの行にする。
 * 依頼で始まるやり取りは、依頼が先頭の投稿の行になる。
 * `tool` と圧縮の区切りは流れに出さない（ツールは進行の帯が持つ）。
 */
export function conversationStreamRows(
  turn: Turn<SessionRecord>,
): readonly ConversationStreamRow[] {
  const records: readonly SessionRecord[] =
    turn.kind === "request" ? [turn.request, ...turn.records] : turn.records
  return records.flatMap(rowOf)
}

function rowOf(record: SessionRecord): readonly ConversationStreamRow[] {
  switch (record.kind) {
    case "request":
      return [{ kind: "post", origin: "request", record, ...timeOf(record.time) }]
    case "aside":
      return [{ kind: "post", origin: "aside", record, ...timeOf(record.time) }]
    case "speech":
    case "reaction":
      return [{ kind: "say", origin: record.kind, record, ...timeOf(record.time) }]
    case "work-plan":
      return [{ kind: "step", record, ...timeOf(record.time) }]
    case "detail":
      return [{ kind: "step", record }]
    case "question":
      return [{ kind: "question", record }]
    case "report":
      return [{ kind: "report", record, ...timeOf(record.time) }]
    case "turn-failure":
    case "turn-interrupted":
      return [{ kind: "failure", record }]
    case "tool":
    case "compact-boundary":
      return []
  }
}

function timeOf(time: Parameters<typeof recordTimeAt>[0]): { readonly at?: number } {
  const at = recordTimeAt(time)
  return at === undefined ? {} : { at }
}
