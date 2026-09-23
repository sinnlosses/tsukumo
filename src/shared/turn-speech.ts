// ターンごとのセリフ。**確定した記録（`SessionRecord`）から、そのターンの吹き出しと表情を
// 引き直す**純粋関数だけを置く（過去のターンのタブを選んだときに、キャラビューが遡るため。
// docs/requirements.md 4.2）。キャラビューのセリフのログも同じ並びを読む。
//
// 今のターンは `SessionState.speeches` / `speechExpression` が持つので、ここは使わない
// （`request` の時点で「前のターンの最後の1件だけ残す」規則が乗っており、記録から素直には
// 導けない）。**過去のターンだけをここから引く**（`src/browser/features/character-view/hooks/use-character-view.ts`）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type Expression } from "./expression.ts"
import { PRE_REQUEST_TURN_ID } from "./main-view.ts"
import { type SessionRecord } from "./session-state.ts"

/**
 * 1ターン分のセリフ。`id` は `shared/main-view.ts` の `mainViewTurns` が振る通し番号と同じ
 * （タブの選択からそのまま引ける）。
 */
export type TurnSpeech = {
  readonly id: number
  /**
   * そのターンの依頼の文面（セリフのログの見出しに使う）。依頼より前に届いたセリフのまとまりは
   * 依頼を持たないので undefined。
   */
  readonly request: string | undefined
  /** そのターンのセリフ（古い→新しいの順）。1件も無いターンは空配列。 */
  readonly speeches: readonly string[]
  /** そのターンの**最後の**セリフに添えられた表情。セリフが1件も無ければ undefined。 */
  readonly expression: Expression | undefined
}

/**
 * 記録を利用者の依頼（`request`）を境目にしてターンへ分け、ターンごとのセリフを返す。
 * **昇順（古い→新しい）で返し、セリフが1件も無いターンも空のまま並べる**（タブの番号から
 * 引けるようにするため）。
 *
 * **通し番号は記録が持っているものをそのまま使う**（`request` の `turnId`）。`mainViewTurns`
 * も同じ値を読むので、タブの選択がそのまま引ける——数え方を両側に書き写さない。
 */
export function turnSpeeches(records: readonly SessionRecord[]): readonly TurnSpeech[] {
  const turns: TurnSpeech[] = []
  // 依頼より前に届いたセリフの置き場（`mainViewTurns` 側の同じ番号のまとまりに対応する）。
  // **1件も無ければ最後に落とす**ので、引く先の無い空のまとまりは残らない。
  let current: TurnSpeech = {
    id: PRE_REQUEST_TURN_ID,
    request: undefined,
    speeches: [],
    expression: undefined,
  }

  for (const record of records) {
    if (record.kind === "request") {
      turns.push(current)
      current = { id: record.turnId, request: record.text, speeches: [], expression: undefined }
      continue
    }
    if (record.kind === "speech") {
      current = {
        ...current,
        speeches: [...current.speeches, record.text],
        expression: record.expression,
      }
    }
  }
  turns.push(current)

  return turns.filter((turn) => turn.id !== PRE_REQUEST_TURN_ID || turn.speeches.length > 0)
}
