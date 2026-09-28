// 訪問（待ち時間にほかのキャラクターが客として訪ねてくる）の状態とイベントと畳み込み。
// セッションの状態とイベントへの差し込みは、`visit` のフィールドと訪問のイベントを足す型・`case` だけにとどめ、状態の形と変わり方はここに閉じる。
//
// 台本の表情はここにだけ持つ。
// `speechExpression`（表情の源）と `records`（過去のターンの吹き出しと表情の引き直し）には書かない（docs/requirements.md「表情の源」が認める例外の条件）。
// 訪問の状態が消えれば元の値が出るので、帰ったあとに「戻す」処理は要らない。
//
// 台本は会話の内容に当たる（生成した台本も同じ経路を通る）ので、ログにもファイルにも書かない。

import type { VisitScript } from "../character-pack/character-visit.ts"

/**
 * 歯車の「訪問」のオン・オフの同梱の既定。
 * 覚えた値が無い・読めないときはここへ畳むので、`SessionState.visitEnabled` の初期値と `readRememberedVisitEnabled` はどちらもこの1つを指す。
 */
export const DEFAULT_VISIT_ENABLED = true

/**
 * 帰った理由。帰る合図はサーバで1つの `visit-ended` にまとめる（ブラウザ側で別々に判定しない。判定は `visitDeparture`）。
 *
 * - `request`: 利用者が依頼を送った
 * - `pending`: 答え待ち（許可・質問）が積まれた
 * - `speech`: あるじが本物の `speak` をした
 * - `wait-over`: 待ちが終わった（走っていたツールが戻った・背景のタスクが終わった・続きのターンが始まった）
 * - `script-finished`: 台本を言い終えた
 * - `session-ended`: セッションが終わった（切り替えは起こし直しで状態ごと初期値へ戻るので、この理由では届かない）
 * - `disabled`: 歯車の「訪問」をオフにした
 */
export type VisitEndReason =
  | "request"
  | "pending"
  | "speech"
  | "wait-over"
  | "script-finished"
  | "session-ended"
  | "disabled"

/**
 * 訪問の様子。
 *
 * - `none`: まだ一度も来ていない
 * - `visiting`: 来ている。`guest` は客のパック名（画面へは全パックの姿を既に配っているので、ブラウザは名前で引ける）。
 *   `line` はいま出している台本の行の番号で、行を進めるのはサーバ（`visit-line-advanced`）。再接続したタブも `hello` の snapshot で同じ行を出せる。
 *   `farewell` は帰るときに言う一言（来たときに選んである）
 * - `left`: 帰った。帰りの一言をいつまで出すかは描く側が `leftAt` から決める
 */
export type VisitState =
  | { readonly kind: "none" }
  | {
      readonly kind: "visiting"
      readonly guest: string
      readonly script: VisitScript
      readonly line: number
      readonly farewell: string
    }
  | {
      readonly kind: "left"
      readonly guest: string
      readonly farewell: string
      readonly leftAt: number
    }

/** 訪問のイベント（`SessionEvent` の一部。出すのはサーバの訪問の見張りだけ）。 */
export type VisitEvent =
  /** 客が来た。台本は丸ごと渡し、1行目から出す。 */
  | {
      readonly kind: "visit-started"
      readonly guest: string
      readonly script: VisitScript
      readonly farewell: string
    }
  /** 台本の `line` 行目へ進んだ。 */
  | { readonly kind: "visit-line-advanced"; readonly line: number }
  /** 客が帰った（{@link VisitEndReason}）。 */
  | { readonly kind: "visit-ended"; readonly reason: VisitEndReason }

export const INITIAL_VISIT_STATE = { kind: "none" } as const satisfies VisitState

/**
 * 訪問のイベント1件を畳む。
 * 訪問中でないときの行の進み・帰る合図は何も変えない（遅れて届いたものが、帰ったあとの姿を書き換えない）。台本の外を指す行の番号も無視する。
 */
export function applyVisitEvent(visit: VisitState, event: VisitEvent, at: number): VisitState {
  switch (event.kind) {
    case "visit-started":
      return {
        kind: "visiting",
        guest: event.guest,
        script: event.script,
        line: 0,
        farewell: event.farewell,
      }
    case "visit-line-advanced":
      return visit.kind === "visiting" && event.line >= 0 && event.line < visit.script.length
        ? { ...visit, line: event.line }
        : visit
    case "visit-ended":
      return visit.kind === "visiting"
        ? { kind: "left", guest: visit.guest, farewell: visit.farewell, leftAt: at }
        : visit
  }
}
