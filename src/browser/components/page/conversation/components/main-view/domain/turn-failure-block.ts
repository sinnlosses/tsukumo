// 失敗・中断の表示に出す語（理由・詳細・残ったもの）と、押せる次の手を決める。

import type { RateLimit } from "../../../../../../../shared/session-driver/rate-limit.ts"
import { turnFailureDetail, turnFailureLabel } from "../../../domain/api-error-label.ts"
import { rateLimitResetText } from "../../../domain/rate-limit-label.ts"
import type { FailureEnding, FailureRemains } from "./stream-item-list.ts"

/**
 * 依頼を入力欄に戻す口。どちらも押すと入力欄に戻すだけで、送らない。
 *
 * - `none`: 戻す文が無い
 * - `request`: 同じ依頼を入力欄に戻す（中断では続きを頼む文を入れる）
 * - `after-reset`: 利用上限が戻る時刻を字に添えて、同じ依頼を入力欄に戻す
 */
type TurnFailureRetry =
  | { readonly kind: "none" }
  | {
      readonly kind: "request" | "after-reset"
      readonly label: string
      readonly request: string
    }

/** 進み具合のプログレスバーの手順の一覧を開くボタン。 */
type TurnFailureStepsDoor =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly label: string }

export type TurnFailureBlockModel = {
  /** 見出し。失敗か中断かを字で言う。 */
  readonly heading: string
  /** 何が起きたかの語（失敗は内部の綴りを含めない。中断は止めたフェーズ「n/N 名前」。言えなければ空）。 */
  readonly reason: string
  /** 失敗の全文（内部の綴りを含む）。中断では空。 */
  readonly detail: string
  /** 残ったものの1行。導けた項目だけを並べ、1つも導けなければ空。 */
  readonly remains: string
  readonly retry: TurnFailureRetry
  readonly failedSteps: TurnFailureStepsDoor
}

export type TurnFailureBlockSource = {
  readonly ending: FailureEnding
  readonly remains: FailureRemains
  /** 戻す依頼の文。記録に依頼が無ければ空。 */
  readonly requestText: string
  readonly rateLimit: RateLimit
  /** いちばん新しいやり取りか。 */
  readonly newest: boolean
  /** いちばん新しい依頼の手順が帯に出ていて、失敗した手順があるか。 */
  readonly hasFailedStep: boolean
  /** いちばん新しい依頼の手順が帯に出ているか。 */
  readonly hasSteps: boolean
  readonly now: number
}

const FAILED_HEADING = "失敗で終わった"
const INTERRUPTED_HEADING = "止めた"
const RETRY_LABEL = "同じ依頼を入力欄に戻す"
const FAILED_STEPS_LABEL = "失敗した手順を見る"
const INTERRUPTED_RETRY_LABEL = "続きを頼む文を入力欄に入れる"
const INTERRUPTED_RETRY_REQUEST = "続きをお願いします。"
const STEPS_LABEL = "手順を見る"

export function turnFailureBlockOf(source: TurnFailureBlockSource): TurnFailureBlockModel {
  const { ending } = source
  if (ending.kind === "interrupted") {
    return {
      heading: INTERRUPTED_HEADING,
      reason: stoppedPhaseOf(source.remains),
      detail: "",
      remains: remainsLineOf(source.remains),
      retry: {
        kind: "request",
        label: INTERRUPTED_RETRY_LABEL,
        request: INTERRUPTED_RETRY_REQUEST,
      },
      failedSteps:
        source.newest && source.hasSteps ? { kind: "shown", label: STEPS_LABEL } : { kind: "none" },
    }
  }
  return {
    heading: FAILED_HEADING,
    reason: turnFailureLabel(ending.failure),
    detail: turnFailureDetail(ending.failure),
    remains: remainsLineOf(source.remains),
    retry: retryOf(source),
    failedSteps:
      source.newest && source.hasFailedStep
        ? { kind: "shown", label: FAILED_STEPS_LABEL }
        : { kind: "none" },
  }
}

function stoppedPhaseOf(remains: FailureRemains): string {
  const { phases } = remains
  if (phases?.stopped === undefined) {
    return ""
  }
  return `フェーズ ${String(phases.done + 1)}/${String(phases.total)}「${phases.stopped}」の途中で止めた`
}

function remainsLineOf(remains: FailureRemains): string {
  const { phases, files } = remains
  const parts = [
    ...(phases === undefined
      ? []
      : [`済んだフェーズ ${String(phases.done)}/${String(phases.total)}`]),
    ...(files === undefined
      ? []
      : [
          `書き換えた ${String(files.count)} ファイル（${files.first}${files.count > 1 ? " ほか" : ""}）`,
        ]),
  ]
  return parts.length === 0 ? "" : `残ったもの　${parts.join("・")}`
}

function retryOf(source: TurnFailureBlockSource): TurnFailureRetry {
  const { requestText, rateLimit } = source
  if (requestText === "") {
    return { kind: "none" }
  }
  if (source.newest && rateLimit.kind === "rejected") {
    const resetText = rateLimitResetText(rateLimit, source.now)
    if (resetText.kind === "known") {
      return {
        kind: "after-reset",
        label: `${resetText.text}に戻る · 依頼を入力欄に戻す`,
        request: requestText,
      }
    }
  }
  return { kind: "request", label: RETRY_LABEL, request: requestText }
}
