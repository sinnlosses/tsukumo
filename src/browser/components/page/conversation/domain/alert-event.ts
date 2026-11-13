// 割り込みの知らせ（`Alert`）に当てる出来事。姿の差から導くだけで、出すかどうか（設定・見ているか・出し済みか）は決めない。
// 通知の本文は OS の通知の履歴に残るので、固定の語だけにする（セリフ・依頼・レポートの字を入れない）。

import type { ReportJudgment } from "../../../../../shared/report/report-progress-field.ts"
import { conversationMoment } from "../../../../../shared/session/conversation-moment.ts"
import type { SessionState } from "../../../../../shared/session/session-state.ts"
import type { AlertEventKind } from "../../../../stores/alert-setting.ts"
import { latestVerdictOf } from "./tab-title.ts"

/** 出来事1件。`key` が同じものは同じ出来事で、2度出さない。 */
export type AlertEvent = {
  readonly kind: AlertEventKind
  readonly key: string
  readonly title: string
  readonly body: string
}

const YOUR_TURN = "● あなたの番"

/**
 * `report` の判定ごとの知らせ。`stopped` は利用者が止めたか書き手が止めたことを言うだけなので割り込まない。
 * 判定が `yours` なら判断を待っているので、問いと同じ扱いにする。
 */
const VERDICT_ALERTS = {
  done: { kind: "finished", title: "✓ 済んだ", body: "作業が済んだ" },
  partial: { kind: "finished", title: "◐ 一部済んだ", body: "作業の一部が済んだ" },
  yours: { kind: "question", title: YOUR_TURN, body: "あなたの番: 判断を待っている" },
  failed: { kind: "failure", title: "✕ 止まった", body: "失敗で止まった" },
} as const satisfies Record<Exclude<ReportJudgment, "stopped">, Omit<AlertEvent, "key">>

/**
 * `previous` から `next` へ進んだ間に新しく起きた、割り込みに当てうる出来事。
 * 新しく増えた答え待ち（`id` で比べる）と、やり取りが閉じた（`deliver`・`stumble` に入った）ときの判定。
 * 雑談モードは答え待ちだけを返す（閉じ方は仕事のセッションの局面）。中断で閉じたときは利用者が止めたので返さない。
 */
export function alertEventsBetween(
  previous: SessionState,
  next: SessionState,
): readonly AlertEvent[] {
  return [...askEvents(previous, next), ...(next.chatMode ? [] : closingEvents(previous, next))]
}

function askEvents(previous: SessionState, next: SessionState): readonly AlertEvent[] {
  const before = new Set(previous.pending.map((ask) => ask.id))
  return next.pending
    .filter((ask) => !before.has(ask.id))
    .map((ask) =>
      ask.kind === "permission"
        ? {
            kind: "permission",
            key: `ask-${ask.id}`,
            title: YOUR_TURN,
            body: "あなたの番: 許可を求めている",
          }
        : {
            kind: "question",
            key: `ask-${ask.id}`,
            title: YOUR_TURN,
            body: "あなたの番: 質問が届いた",
          },
    )
}

function closingEvents(previous: SessionState, next: SessionState): readonly AlertEvent[] {
  const before = conversationMoment(previous)
  const after = conversationMoment(next)
  if (before === after) {
    return []
  }
  const turn = String(next.finishedTurnCount)
  if (after === "stumble") {
    return [
      { kind: "failure", key: `turn-${turn}-failure`, title: "✕ 止まった", body: "失敗で止まった" },
    ]
  }
  if (after !== "deliver") {
    return []
  }
  if (next.turn.kind === "finished" && next.turn.ending.kind === "interrupted") {
    return []
  }
  const verdict = latestVerdictOf(next.records)
  if (verdict === "stopped") {
    return []
  }
  const alert = VERDICT_ALERTS[verdict]
  return [{ ...alert, key: `turn-${turn}-${alert.kind}` }]
}
