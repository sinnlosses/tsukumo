// ターンごとのセリフ。確定した記録（`SessionRecord`）から、そのターンの吹き出しと表情を
// 引き直す純粋関数だけを置く（過去のターンのタブを選んだときに、キャラビューが遡るため。
// docs/display.md 4.2）。キャラビューのセリフのログも同じ並びを読む。
//
// 今のターンは `SessionState.speeches` / `speechExpression` が持つので、ここは使わない
// （`request` の時点で「前のターンの最後の1件だけ残す」規則が乗っており、記録から素直には
// 導けない）。過去のターンだけをここから引く（`src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts`）。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type Expression } from "./expression.ts"
import { type SessionRecord } from "./session-state.ts"
import { splitIntoTurns, turnIdOf } from "./turn.ts"

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
  /** そのターンの最後のセリフに添えられた表情。セリフが1件も無ければ undefined。 */
  readonly expression: Expression | undefined
}

/**
 * 記録を利用者の依頼（`request`）を境目にしてターンへ分け（`shared/turn.ts` の
 * `splitIntoTurns`）、ターンごとのセリフを返す。
 * 昇順（古い→新しい）で返し、セリフが1件も無いターンも空のまま並べる（タブの番号から
 * 引けるようにするため）。
 *
 * 通し番号は記録が持っているものをそのまま使う（`request` の `turnId`）。`mainViewTurns`
 * も同じ値を読むので、タブの選択がそのまま引ける——数え方を両側に書き写さない。
 */
export function turnSpeeches(records: readonly SessionRecord[]): readonly TurnSpeech[] {
  return (
    splitIntoTurns(records)
      // 依頼より前に届いた記録のまとまり（`mainViewTurns` 側の同じ番号のまとまりに対応する）は、
      // セリフが1件も無ければ落とすので、引く先の無い空のまとまりは残らない。
      .filter((turn) => turn.kind !== "pre-request" || turn.records.some(isSpeechRecord))
      .map((turn): TurnSpeech => {
        const speeches = turn.records.filter(isSpeechRecord)
        return {
          id: turnIdOf(turn),
          request: turn.kind === "pre-request" ? undefined : turn.request.text,
          speeches: speeches.map((speech) => speech.text),
          expression: speeches.at(-1)?.expression,
        }
      })
  )
}

function isSpeechRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "speech" }> {
  return record.kind === "speech"
}
