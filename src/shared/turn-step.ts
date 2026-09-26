// 「依頼の手順」（帯の「いまの作業」の札を押すと開く一覧。docs/glossary.md「依頼の手順」）を、
// 確定した記録（`SessionRecord`）から導く純粋関数だけを置く（姿から導くだけのものなので
// `session-state.ts` には置かない。`shared/turn-speech.ts` と同じ置き方。docs/screen-design.md 13.9）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type SessionRecord } from "./session-state.ts"
import { splitIntoTurns } from "./turn.ts"

/**
 * 依頼の手順1件の進み具合。`failed` の `output` は失敗の中身
 * （`<details>` で開いて読む。docs/screen-design.md 13.9）。
 */
export type TurnStepStatus =
  | { readonly kind: "running" }
  | { readonly kind: "done" }
  | { readonly kind: "failed"; readonly output: string }

/**
 * いちばん新しい依頼（ターン）の中で claude が呼んだツール1回ぶん（docs/glossary.md
 * 「依頼の手順」）。引数はここまで持ち込む（要約は表示側 `src/browser/lib/tool-summary.ts` の
 * 仕事。`docs/coding-standards.md`「会話内容の扱い」のとおり、要約に断片が入りうることは
 * 呼び出し側が承知した上で使う）。
 */
export type TurnStep = {
  readonly toolUseId: string
  readonly name: string
  readonly input: unknown
  /** サブエージェントの中で動いたか（`tool-started` の `parentToolUseId` があるか）。 */
  readonly nested: boolean
  readonly status: TurnStepStatus
}

/**
 * {@link currentTurnSteps} の戻り値。「依頼が一度も無い」と「依頼はあるが手順が0件」を
 * 分ける（帯の一覧では出す文面が違う）。
 */
export type TurnStepList =
  | { readonly kind: "no-request" }
  | { readonly kind: "turn"; readonly steps: readonly TurnStep[] }

/**
 * 記録から、最後の `request` より後の `tool` の記録を拾って、依頼の手順を古い→新しいの順で
 * 返す（docs/screen-design.md 13.9「いまの作業」）。範囲は依頼1つ——「直近の何件」ではない。
 *
 * - 依頼が一度も無ければ `{ kind: "no-request" }`。0件の配列（依頼はあったが
 *   まだツールを使っていない）とは型で区別する
 * - 結果の届いていない手順は running のまま返す（ターンが終わっても、依頼が終わっても。
 *   背景で走り続けるものがあるため）。ただし `sessionEnded` が true のときは running の手順を
 *   落とす（セッションが終わったあとは実行中の印を出さない。以前の `runningTools` が
 *   `session-ended` で空になっていたのと同じ）
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
    status:
      record.status.kind === "running"
        ? { kind: "running" }
        : record.status.result.isError
          ? { kind: "failed", output: record.status.result.content }
          : { kind: "done" },
  }
}
