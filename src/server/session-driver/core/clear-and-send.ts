// `clear_and_send` ツールの説明文と、預かった文面をターンの終わりに送るかどうかの判定。
// 文面は利用者の依頼と同じ種類の会話の持ち物なので、ログにもファイルにも書かない。

import type { TurnOutcome } from "../../../shared/session-driver/turn-failure.ts"

/** 文脈を空にする組み込みのコマンド。依頼の文面のまま本体へ渡る。 */
const CLEAR_COMMAND = "/clear"

/** モデルに見せる `clear_and_send` ツールの説明。 */
export const CLEAR_AND_SEND_TOOL_DESCRIPTION =
  "いまのターンが成功で終わったあとに、会話の文脈を空にして、渡した文面を新しい会話の最初の依頼として送る。" +
  "呼んだ時点では何も起きず、すぐ戻る。呼んだら続けて report を渡してターンを終える。" +
  "ターンが中断・失敗で終わったときや、その間に利用者が何か送ったときは、何も送られない。" +
  "呼び直すと前の文面は置き換わる。"

export type ClearAndSend = {
  /** 文面を預かる。すでに預かっていれば置き換える。 */
  readonly hold: (text: string) => void
  /** 預かった文面を捨てる（利用者の依頼・脇の話が届いたとき、セッションが終わったとき）。 */
  readonly discard: () => void
  /**
   * ターンの終わりに送る文面の列を返す。送らないときは空。預かりは必ず空になる。
   * 送るのはターンが `completed` で終わり、答え待ちが残っていないときだけ。
   */
  readonly take: (turn: {
    readonly outcome: TurnOutcome
    readonly pendingCount: number
  }) => readonly string[]
}

export function createClearAndSend(): ClearAndSend {
  let held: string | undefined = undefined
  return {
    hold: (text) => {
      held = text
    },
    discard: () => {
      held = undefined
    },
    take: ({ outcome, pendingCount }) => {
      const text = held
      held = undefined
      return text !== undefined && outcome.kind === "completed" && pendingCount === 0
        ? [CLEAR_COMMAND, text]
        : []
    },
  }
}
