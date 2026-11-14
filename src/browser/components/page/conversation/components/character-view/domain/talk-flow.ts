// 舞台に流すやり取りの並び。利用者の依頼・補足と、キャラクターのセリフを1本にし、段を終えたセリフに紙の段を対にする。
// 材料は画面がもう持っている記録（`SessionRecord`）だけで、別に溜めない。
//
// 段を終えたセリフは、段が移った `work-plan` の記録に隣り合う `speech` の記録。
// `work_plan` と、その契機の `speak` は同じ応答に並べて呼ぶ決まりなので、どちらが先に届いても隣り合う。
// 間に別の `speech`・`report`・`work-plan` が挟まれば隣り合いではない（`tool`・`reaction`・`aizuchi-chip` などは挟まってよい）。
// `work-plan` で切るのは、計画を出したときの `speak` を、あとの段を終えた `work-plan` と取り違えないため。
// 前後の両方に候補があれば前を取る（前のセリフがもう別の段と対なら後ろ）。

import type { RecordedPromptImage } from "../../../../../../../shared/session-driver/prompt-image.ts"
import { mainViewEntries } from "../../../../../../../shared/session/main-view-entry.ts"
import type { SessionRecord } from "../../../../../../../shared/session/session-record.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../shared/session/session-state.ts"
import {
  splitIntoTurns,
  turnIdOf,
  type TurnRest,
} from "../../../../../../../shared/session/turn.ts"
import { workPlanOf } from "../../../../../../../shared/session/work-plan-fold.ts"
import { shiftedPhaseOf } from "../../../../../../../shared/session/work-plan-shift.ts"
import type { LatestWorkPlan } from "../../../../../../../shared/session/work-plan.ts"
import { recordClockStamp, type ClockStamp } from "../../../domain/clock-stamp.ts"
import { groupIntoTurns } from "../../../domain/main-view/main-view-step.ts"
import type { SpeechTarget } from "./pinned-speech.ts"

/**
 * セリフが終えた段。`stepId` は紙の中間レポートのステップ（`MainViewStep.id`）で、`turnId` はそのステップのあるターン。
 * 段のまとめが空で中間レポートが出ない段では `none`。
 */
export type FinishedStep =
  | { readonly kind: "none" }
  | { readonly kind: "finished"; readonly turnId: number; readonly stepId: number }

/** 流れの1行。`you` は利用者の依頼・補足・押した相づちの札、`her` はキャラクターのセリフか出し始めた反応。 */
export type TalkFlowRow =
  | {
      readonly kind: "you"
      readonly key: string
      readonly turnId: number
      readonly time: ClockStamp
      readonly text: string
      /** キャラクターが利用者を呼ぶ言葉（`character.json` の `userCall`）。持たないパックでは無い。 */
      readonly caller?: string
      /** 依頼に添えた画像の控え。依頼の行にだけ持ち、補足・相づちの札の行には無い。 */
      readonly images?: readonly RecordedPromptImage[]
    }
  | {
      readonly kind: "her"
      readonly key: string
      readonly turnId: number
      readonly time: ClockStamp
      readonly text: string
      /** 押して立ち絵を遡らせる先。並びの位置は `turnSpeeches` の数え方（セリフ・反応・相づちの札を通しで数える）。 */
      readonly target: SpeechTarget
      readonly finishedStep: FinishedStep
    }

/** 記録の全部のターンを、古い→新しいの順に1本の流れにする。 */
export function talkFlowOf(
  records: readonly SessionRecord[],
  timeZone: string,
  userCall?: string,
): readonly TalkFlowRow[] {
  const phaseStepIds = phaseStepIdsByTurn(records)
  return splitIntoTurns(records).flatMap((turn) => {
    const turnId = turnIdOf(turn)
    const finishedBySpeech = finishedStepsOf(turn.records, turnId, phaseStepIds.get(turnId) ?? [])
    const caller = userCall === undefined ? {} : { caller: userCall }
    const head: readonly TalkFlowRow[] =
      turn.kind === "request"
        ? [
            {
              kind: "you",
              key: `request-${String(turnId)}`,
              turnId,
              time: recordClockStamp(turn.request.time, timeZone),
              text: turn.request.text,
              images: turn.request.images,
              ...caller,
            },
          ]
        : []
    const spokenPositions = turn.records.flatMap((record, position) =>
      record.kind === "speech" || record.kind === "reaction" || record.kind === "aizuchi-chip"
        ? [position]
        : [],
    )
    const rest = turn.records.flatMap((record, position): readonly TalkFlowRow[] => {
      const key = `${String(turnId)}-${String(position)}`
      if (record.kind === "aside" || record.kind === "aizuchi-chip") {
        return [
          {
            kind: "you",
            key: `${record.kind === "aside" ? "aside" : "chip"}-${key}`,
            turnId,
            time: recordClockStamp(record.time, timeZone),
            text: record.text,
            ...caller,
          },
        ]
      }
      if (record.kind !== "speech" && record.kind !== "reaction") {
        return []
      }
      const index = spokenPositions.indexOf(position)
      return [
        {
          kind: "her",
          key: `her-${key}`,
          turnId,
          time: recordClockStamp(record.time, timeZone),
          text: record.text,
          target: { turnId, index },
          finishedStep: finishedBySpeech.get(position) ?? NO_FINISHED_STEP,
        },
      ]
    })
    return [...head, ...rest]
  })
}

const NO_FINISHED_STEP = { kind: "none" } as const satisfies FinishedStep

type TurnRecord = TurnRest<SessionRecord>

/**
 * ターンごとの、紙の中間レポートのうち段のまとめのステップの id（古い順）。
 * 段が移った `work-plan` の記録1件が、ここの1件と同じ順で対になる。
 */
function phaseStepIdsByTurn(
  records: readonly SessionRecord[],
): ReadonlyMap<number, readonly number[]> {
  return new Map(
    groupIntoTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records })).map(({ turn }) => [
      turn.id,
      turn.steps.flatMap((step) =>
        step.body.kind === "text" && step.body.finishedPhase.kind === "phase" ? [step.id] : [],
      ),
    ]),
  )
}

/** ターンの中の段を終えたセリフ（ターンの中の位置）と、その段の紙のステップ。 */
function finishedStepsOf(
  records: readonly TurnRecord[],
  turnId: number,
  phaseStepIds: readonly number[],
): ReadonlyMap<number, FinishedStep> {
  return shiftPositionsOf(records).reduce<ReadonlyMap<number, FinishedStep>>(
    (paired, shiftPosition, order) => {
      const stepId = phaseStepIds[order]
      const [speech] = [
        ...adjacentSpeech(records, shiftPosition, -1, paired),
        ...adjacentSpeech(records, shiftPosition, 1, paired),
      ]
      return stepId === undefined || speech === undefined
        ? paired
        : new Map([...paired, [speech, { kind: "finished", turnId, stepId }]])
    },
    new Map(),
  )
}

/** 段が移った（中間レポートが出る）`work-plan` の記録の、ターンの中の位置。紙と同じく前の `work-plan` の記録と比べる。 */
function shiftPositionsOf(records: readonly TurnRecord[]): readonly number[] {
  return records.reduce<{
    readonly previous: LatestWorkPlan
    readonly positions: readonly number[]
  }>(
    ({ previous, positions }, record, position) =>
      record.kind === "work-plan"
        ? {
            previous: workPlanOf(record),
            positions:
              shiftedPhaseOf(previous, record).kind === "finished"
                ? [...positions, position]
                : positions,
          }
        : { previous, positions },
    { previous: { kind: "none" }, positions: [] },
  ).positions
}

/**
 * `from` から `step` の向きにたどって最初に当たるセリフの位置（あれば1件）。
 * もう対になっているか、先に `report`・`work-plan` に当たれば空。
 */
function adjacentSpeech(
  records: readonly TurnRecord[],
  from: number,
  step: -1 | 1,
  paired: ReadonlyMap<number, FinishedStep>,
): readonly number[] {
  for (let position = from + step; position >= 0 && position < records.length; position += step) {
    const record = records[position]
    if (record?.kind === "report" || record?.kind === "work-plan") {
      return []
    }
    if (record?.kind === "speech") {
      return paired.has(position) ? [] : [position]
    }
  }
  return []
}
