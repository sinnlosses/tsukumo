// ターンの進み具合と SDK ターンごとの持ち物（`SessionState` の `turn` など）の型と、型だけで決まる読み書き。

import type { Expression } from "../character-pack/expression.ts"
import type { A2uiReportComponent, A2uiWrittenComponent } from "../report/a2ui-report-catalog.ts"
import { staticReportComponents } from "../report/report-static-component-list.ts"
import type { ApiTrouble } from "../session-driver/api-trouble.ts"
import type {
  TurnEnding,
  TurnFailure,
  TurnFailureCause,
  TurnOutcome,
} from "../session-driver/turn-failure.ts"

/**
 * ターンの進み具合。`request` で `running` になり、`turn-finished` / `session-ended` で `finished` になる（入力欄が送信と中断を切り替える判断材料）。
 *
 * - `idle`: まだ一度も依頼が無い
 * - `running`: 依頼を送って、まだ終わっていない。
 *   委譲した続きを claude が自分で始めたとき（`turn-resumed`）も `startedAt` は付け直さず、依頼を送った時刻のまま引き継ぐ（`resumeTurn`）
 * - `finished`: 終わった。`startedAt` は次の `request` まで持ち続ける（入力欄の経過時間表示が「所要」として出し続ける）。
 *   `ending` は失敗で終わったか（{@link TurnEnding}。入力欄の「失敗」の字と、立ち絵の「失敗でびくっ」の材料。`session-ended` で終わったときは `ended`）。
 *   ここが `finished` でも `SessionState.backgroundTasks` が残っていれば、入力欄は「経過」のまま数え続ける
 */
export type TurnProgress =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly startedAt: number }
  | {
      readonly kind: "finished"
      readonly startedAt: number
      readonly finishedAt: number
      readonly ending: TurnEnding
    }

/**
 * いま走っている SDK のターンで届いた本文の種類（{@link OpenSdkTurn} の `bodies`）。`report` は
 * `report` ツールの呼び出し、`utterance` はツールの外に書いた本文（空白だけのものは数えない）。
 */
export type TurnBodies = { readonly report: boolean; readonly utterance: boolean }

/**
 * メインが `report` の引数を書いている途中か（{@link OpenSdkTurn} の `reportDrafting`）。
 * `components` は引数の中で閉じた部品を届いた順に持つ（同じ呼び出しの中では同じ `id` は最初のものだけ）。
 *
 * - `drafting` の `held`: 差し戻された前の草稿の部品。同じ `id` の部品が `components` に届くまで土台として描き続ける
 * - `held`: 差し戻されて書き直しを待つ草稿。書き直しの `report-drafting` が来るまで部品を描き続ける
 */
export type ReportDrafting =
  | { readonly kind: "idle" }
  | {
      readonly kind: "drafting"
      readonly toolUseId: string
      readonly components: readonly A2uiWrittenComponent[]
      readonly held: readonly A2uiWrittenComponent[]
    }
  | {
      readonly kind: "held"
      readonly toolUseId: string
      readonly components: readonly A2uiWrittenComponent[]
    }

/**
 * SDK のターンの持ち物（`SessionState.sdkTurn`）。開いている間だけ欄を持ち、閉じると型の上で消える。
 *
 * - `bodies`: このターンで届いた本文の種類。
 *   メインビューが「まだ伸びうる本文」を伏せるときに、前の SDK のターンで確定した本文まで巻き込まないために要る
 * - `answeringAside`: 脇の話（`aside`）で開いたか
 * - `reportDrafting`: メインが `report` の引数を書いている途中か。
 *   `report-drafting` で書き始め、同じ `toolUseId` の `report` か `tool-finished`（差し戻されて `report` が届かないときもこちらは届く）で終わる
 */
export type SdkTurn = { readonly kind: "closed" } | OpenSdkTurn

export type OpenSdkTurn = {
  readonly kind: "open"
  readonly bodies: TurnBodies
  readonly answeringAside: boolean
  readonly reportDrafting: ReportDrafting
}

export const INITIAL_SPEECH_EXPRESSION = "default" as const satisfies Expression

const NO_TURN_BODIES = { report: false, utterance: false } as const satisfies TurnBodies

export const CLOSED_SDK_TURN = { kind: "closed" } as const satisfies SdkTurn

export const NOT_DRAFTING = { kind: "idle" } as const satisfies ReportDrafting

export const OPENED_SDK_TURN = {
  kind: "open",
  bodies: NO_TURN_BODIES,
  answeringAside: false,
  reportDrafting: NOT_DRAFTING,
} as const satisfies SdkTurn

/**
 * ターンの終わり方を、失敗だったかどうかに畳む（中断は失敗にしない）。
 * 失敗の理由が API のエラーなら、そのターンで届いた種類を足す
 * （`assistant` の `error`（`errored`）、無ければ最後の呼び直しの知らせ（`retrying`。呼び直しを使い切って止まったとき）、どちらも無ければ `unknown`）。
 */
export function turnEnding(outcome: TurnOutcome, trouble: ApiTrouble): TurnEnding {
  return outcome.kind === "failed"
    ? { kind: "failed", failure: toTurnFailure(outcome.cause, trouble) }
    : { kind: "ended" }
}

/**
 * ターンの終わりを畳む（`turn-finished` と `session-ended` で共通）。
 * 始まっていないターンは終われないので、まだ一度も依頼が無ければ `idle` のまま返す（依頼より先に `session-ended` が届く経路がある。そこでは立ち絵の「完了の反応」も出さない）。
 * 終わったあとにもう一度届いたときは、起点を動かさずに終わった時刻だけ進める。
 */
export function finishTurn(turn: TurnProgress, at: number, ending: TurnEnding): TurnProgress {
  if (turn.kind === "idle") {
    return turn
  }
  return { kind: "finished", startedAt: turn.startedAt, finishedAt: at, ending }
}

/**
 * 草稿として描く部品。書いたままの部品（{@link writtenDraftComponentsOf}）を初期値で評価した静的な一覧にする。
 * 評価できない部品（まだ届いていない `defs` の名前を読む部品など）は出さず、あとの部品で評価できるようになった更新で出る。
 */
export function draftComponentsOf(drafting: ReportDrafting): readonly A2uiReportComponent[] {
  return staticReportComponents(writtenDraftComponentsOf(drafting)).components
}

/** 草稿の書いたままの部品。保留の部品を土台に、同じ `id` は書き直しのもので差し替え、新しい `id` は後ろに足す。 */
export function writtenDraftComponentsOf(
  drafting: ReportDrafting,
): readonly A2uiWrittenComponent[] {
  if (drafting.kind !== "drafting") {
    return drafting.kind === "held" ? drafting.components : []
  }
  const fresh = new Map(drafting.components.map((component) => [component.id, component]))
  const heldIds = new Set(drafting.held.map((component) => component.id))
  return [
    ...drafting.held.map((component) => fresh.get(component.id) ?? component),
    ...drafting.components.filter((component) => !heldIds.has(component.id)),
  ]
}

/** `/clear` のあとの SDK のターン。開いていれば中身を空にして開いたまま、閉じていれば閉じたまま。 */
export function clearedSdkTurn(sdkTurn: SdkTurn): SdkTurn {
  return sdkTurn.kind === "open" ? OPENED_SDK_TURN : CLOSED_SDK_TURN
}

/** `report` の引数を書いている途中か。閉じていれば書いていない（毎回同じ値を返す）。 */
export function reportDraftingOf(sdkTurn: SdkTurn): ReportDrafting {
  return sdkTurn.kind === "open" ? sdkTurn.reportDrafting : NOT_DRAFTING
}

/** 脇の話で開いた SDK のターンの中か。 */
export function answeringAsideOf(sdkTurn: SdkTurn): boolean {
  return sdkTurn.kind === "open" && sdkTurn.answeringAside
}

/** いまの SDK のターンで届いた本文の種類。閉じていれば何も届いていない（毎回同じ値を返す）。 */
export function bodiesOf(sdkTurn: SdkTurn): TurnBodies {
  return sdkTurn.kind === "open" ? sdkTurn.bodies : NO_TURN_BODIES
}

function toTurnFailure(cause: TurnFailureCause, trouble: ApiTrouble): TurnFailure {
  if (cause.kind !== "api-error") {
    return cause
  }
  return { kind: "api-error", error: trouble.kind === "none" ? "unknown" : trouble.error }
}
