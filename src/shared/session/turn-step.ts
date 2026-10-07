// 「依頼の手順」（帯の「いまの作業」の札を押すと開く一覧）を、確定した記録（`SessionRecord`）から導く。

import { isPlainObject } from "remeda"

import type { ClippedText } from "../utils/clip-text.ts"
import type { MeasuredTime } from "../utils/elapsed-time.ts"
import {
  type BackgroundEnd,
  type RecordTime,
  recordTimeAt,
  type SessionRecord,
} from "./session-state.ts"
import {
  currentPhaseOf,
  isWorkPlanRecord,
  workPlanOf,
  type LatestWorkPlan,
  type WorkPhase,
} from "./work-plan.ts"

/**
 * 依頼の手順1件の進み具合。`failed` の `output` は失敗の中身（`<details>` で開いて読む）。
 * `done` / `failed` が持つ `finishedAt` は所要時間の計算に使う（{@link toolDuration}）。
 */
export type TurnStepStatus =
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly finishedAt: RecordTime }
  | { readonly kind: "failed"; readonly output: ClippedText; readonly finishedAt: RecordTime }

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
  readonly backgroundEnd: BackgroundEnd
  /** 始まったときの段取りの段（{@link WorkPhase}）。 */
  readonly phase: WorkPhase
}

/** ツール1件の所要時間（{@link toolDuration}）。復元した手順は `unknown`（`RecordTime` を参照）。 */
export type ToolDuration = MeasuredTime

/**
 * {@link TurnStep} 1件の所要時間。実行中、または開始・終了のどちらかが `restored`（前のセッションから読み戻した手順）なら `unknown`。
 * 背景で走らせた Bash の終了は完了の知らせの時刻で（{@link BackgroundEnd}）、知らせが届いていなければ `unknown`。
 */
export function toolDuration(step: TurnStep): ToolDuration {
  if (step.status.kind === "running" || step.backgroundEnd.kind === "awaiting") {
    return { kind: "unknown" }
  }
  const { startedAt } = step
  const finishedAt =
    step.backgroundEnd.kind === "notified" ? step.backgroundEnd.at : step.status.finishedAt
  const startAt = recordTimeAt(startedAt)
  const finishAt = recordTimeAt(finishedAt)
  return startAt === undefined || finishAt === undefined
    ? { kind: "unknown" }
    : { kind: "known", milliseconds: finishAt - startAt }
}

/** `tool` の記録1件の所要時間（{@link toolDuration}）。 */
export function toolRecordDuration(
  record: Extract<SessionRecord, { readonly kind: "tool" }>,
): ToolDuration {
  return toolDuration(toTurnStep(record, { kind: "none" }))
}

/**
 * {@link currentTurnSteps} の戻り値。「依頼が一度も無い」と「依頼はあるが手順が0件」を
 * 分ける（帯の一覧では出す文面が違う）。`plan` はその依頼で最後に渡された段取り。
 */
export type TurnStepList =
  | { readonly kind: "no-request" }
  | {
      readonly kind: "turn"
      readonly steps: readonly TurnStep[]
      readonly plan: LatestWorkPlan
    }

/**
 * 記録から、最後の `request` より後の `tool` の記録を拾って、依頼の手順を古い→新しいの順で返す。
 * 範囲は依頼1つで、「直近の何件」ではない。
 *
 * - 依頼が一度も無ければ `{ kind: "no-request" }`。0件の配列（依頼はあったがまだツールを使っていない）とは型で区別する
 * - 結果の届いていない手順は running のまま返す（ターンが終わっても、依頼が終わっても。背景で走り続けるものがあるため）。
 *   ただし `sessionEnded` が true のときは running の手順を落とす（セッションが終わったあとは実行中の印を出さない）
 * - 手順の段は、その手順より前で最後の `work-plan` の記録の今の段
 */
export function currentTurnSteps(
  records: readonly SessionRecord[],
  sessionEnded: boolean,
): TurnStepList {
  const requestIndex = records.findLastIndex((record) => record.kind === "request")
  if (requestIndex < 0) {
    return { kind: "no-request" }
  }

  const steps: TurnStep[] = []
  let plan: LatestWorkPlan = { kind: "none" }
  for (const record of records.slice(requestIndex + 1)) {
    if (isWorkPlanRecord(record)) {
      plan = workPlanOf(record)
    } else if (isToolRecord(record) && !(sessionEnded && record.status.kind === "running")) {
      steps.push(toTurnStep(record, currentPhaseOf(plan)))
    }
  }
  return { kind: "turn", steps, plan }
}

/** Bash の入力（外来の値）から、打ったコマンドの文字列を取り出す。読めなければ空文字。 */
export function bashCommandOf(input: unknown): string {
  return isPlainObject(input) && typeof input["command"] === "string" ? input["command"] : ""
}

export function isToolRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "tool" }> {
  return record.kind === "tool"
}

function toTurnStep(
  record: Extract<SessionRecord, { readonly kind: "tool" }>,
  phase: WorkPhase,
): TurnStep {
  return {
    phase,
    toolUseId: record.toolUseId,
    name: record.name,
    input: record.input,
    nested: record.nested,
    startedAt: record.startedAt,
    backgroundEnd: record.backgroundEnd,
    status:
      record.status.kind === "running"
        ? { kind: "running" }
        : record.status.result.kind === "failed"
          ? {
              kind: "failed",
              output: record.status.result.output,
              finishedAt: record.status.finishedAt,
            }
          : { kind: "done", finishedAt: record.status.finishedAt },
  }
}
