// 「依頼の手順」（帯の「いまの作業」の札を押すと開く一覧）を、確定した記録（`SessionRecord`）から導く。

import { isPlainObject } from "remeda"

import type { MeasuredTime } from "../utils/elapsed-time.ts"
import type { RecordTime, SessionRecord } from "./session-state.ts"
import { splitIntoTurns } from "./turn.ts"

/**
 * 依頼の手順1件の進み具合。`failed` の `output` は失敗の中身（`<details>` で開いて読む）。
 * `done` / `failed` が持つ `finishedAt` は所要時間の計算に使う（{@link toolDuration}）。
 */
export type TurnStepStatus =
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly finishedAt: RecordTime }
  | { readonly kind: "failed"; readonly output: string; readonly finishedAt: RecordTime }

/**
 * いちばん新しい依頼（ターン）の中で claude が呼んだツール1回ぶん。
 * 引数はここまで持ち込み、要約は表示側が作る（要約に会話の断片が入りうることは、呼び出し側が承知した上で使う）。
 */
export type TurnStep = {
  readonly toolUseId: string
  readonly name: string
  readonly input: unknown
  /** サブエージェントの中で動いたか（`tool-started` の `parentToolUseId` があるか）。 */
  readonly nested: boolean
  readonly startedAt: RecordTime
  readonly status: TurnStepStatus
}

/** ツール1件の所要時間（{@link toolDuration}）。復元した手順は `unknown`（`RecordTime` を参照）。 */
export type ToolDuration = MeasuredTime

/** {@link TurnStep} 1件の所要時間。実行中、または開始・終了のどちらかが `restored`（前のセッションから読み戻した手順）なら `unknown`。 */
export function toolDuration(step: TurnStep): ToolDuration {
  if (step.status.kind === "running") {
    return { kind: "unknown" }
  }
  const { startedAt } = step
  const { finishedAt } = step.status
  return startedAt.kind === "stamped" && finishedAt.kind === "stamped"
    ? { kind: "known", milliseconds: finishedAt.at - startedAt.at }
    : { kind: "unknown" }
}

/**
 * `tool` の記録の中で、`command` をそのまま打った最後の Bash の所要時間（{@link toolDuration}）。
 * 突き合わせは文字列の完全一致だけで、無ければ `unknown`。
 */
export function bashCommandDuration(
  records: readonly SessionRecord[],
  command: string,
): ToolDuration {
  const matched = records
    .filter(isToolRecord)
    .findLast((record) => record.name === "Bash" && bashCommandOf(record.input) === command)
  return matched === undefined ? { kind: "unknown" } : toolDuration(toTurnStep(matched))
}

/**
 * {@link currentTurnSteps} の戻り値。「依頼が一度も無い」と「依頼はあるが手順が0件」を
 * 分ける（帯の一覧では出す文面が違う）。
 */
export type TurnStepList =
  | { readonly kind: "no-request" }
  | { readonly kind: "turn"; readonly steps: readonly TurnStep[] }

/**
 * 記録から、最後の `request` より後の `tool` の記録を拾って、依頼の手順を古い→新しいの順で返す。
 * 範囲は依頼1つで、「直近の何件」ではない。
 *
 * - 依頼が一度も無ければ `{ kind: "no-request" }`。0件の配列（依頼はあったがまだツールを使っていない）とは型で区別する
 * - 結果の届いていない手順は running のまま返す（ターンが終わっても、依頼が終わっても。背景で走り続けるものがあるため）。
 *   ただし `sessionEnded` が true のときは running の手順を落とす（セッションが終わったあとは実行中の印を出さない）
 */
export function currentTurnSteps(
  records: readonly SessionRecord[],
  sessionEnded: boolean,
): TurnStepList {
  // 依頼より前のまとまりは先頭にしか来ないので、最後のまとまりがそれなら依頼は一度も無い。
  const currentTurn = splitIntoTurns(records).at(-1)
  if (currentTurn === undefined || currentTurn.kind === "pre-request") {
    return { kind: "no-request" }
  }

  const steps = currentTurn.records
    .filter(isToolRecord)
    .map(toTurnStep)
    .filter((step) => !(sessionEnded && step.status.kind === "running"))
  return { kind: "turn", steps }
}

/** Bash の入力（外来の値）から、打ったコマンドの文字列を取り出す。読めなければ空文字。 */
function bashCommandOf(input: unknown): string {
  return isPlainObject(input) && typeof input["command"] === "string" ? input["command"] : ""
}

function isToolRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "tool" }> {
  return record.kind === "tool"
}

function toTurnStep(record: Extract<SessionRecord, { readonly kind: "tool" }>): TurnStep {
  return {
    toolUseId: record.toolUseId,
    name: record.name,
    input: record.input,
    nested: record.nested,
    startedAt: record.startedAt,
    status:
      record.status.kind === "running"
        ? { kind: "running" }
        : record.status.result.isError
          ? {
              kind: "failed",
              output: record.status.result.content,
              finishedAt: record.status.finishedAt,
            }
          : { kind: "done", finishedAt: record.status.finishedAt },
  }
}
