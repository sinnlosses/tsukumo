// ターンごとのセリフ。確定した記録（`SessionRecord`）から、そのターンの吹き出しと表情を引き直す。
// セリフのログと、留めた行（ターンの番号と位置）を引く先はどのターンもこれ。
// 今のターンの吹き出しは `SessionState.speeches` / `speechExpression` が持つ（`request` で空に戻るなどの規則が乗っていて、記録から素直には導けない）。

import type { Expression } from "../character-pack/expression.ts"
import type { SessionRecord, Speech } from "./session-state.ts"
import { splitIntoTurns, turnIdOf } from "./turn.ts"

/** ターンの吹き出しに出した1件。`source` は `speak` のセリフ（`speak`）か、出し始めた反応（`reaction`）か。 */
export type TurnLine = Speech & { readonly source: "speak" | "reaction" }

/** 1ターン分のセリフ。`id` は `mainViewTurns` が振る通し番号と同じ（タブの選択からそのまま引ける）。 */
export type TurnSpeech = {
  readonly id: number
  /** そのターンの依頼の文面。依頼より前に届いたセリフのまとまりは依頼を持たないので undefined。 */
  readonly request: string | undefined
  /**
   * そのターンのセリフと、吹き出しに出し始めた反応（古い→新しいの順）。1件も無いターンは空配列。
   * 表情ごと持つのは、セリフを押して立ち絵を遡らせるため。
   */
  readonly speeches: readonly TurnLine[]
  /** `speeches` の最後の1件の表情（そのターンで最後に出していた顔）。1件も無ければ undefined。 */
  readonly expression: Expression | undefined
}

/**
 * 記録をターンへ分け（{@link splitIntoTurns}）、ターンごとのセリフを返す。
 * 昇順（古い→新しい）で返し、セリフが1件も無いターンも空のまま並べる（タブの番号から引けるようにするため）。
 * 通し番号は記録が持っているものをそのまま使う（`request` の `turnId`。数え方を書き写さない）。
 */
export function turnSpeeches(records: readonly SessionRecord[]): readonly TurnSpeech[] {
  return (
    splitIntoTurns(records)
      // 依頼より前に届いた記録のまとまりは、セリフが1件も無ければ落とすので、引く先の無い空のまとまりは残らない。
      .filter((turn) => turn.kind !== "pre-request" || turn.records.some(isSpokenRecord))
      .map((turn): TurnSpeech => {
        const speeches = turn.records.filter(isSpokenRecord)
        return {
          id: turnIdOf(turn),
          request: turn.kind === "pre-request" ? undefined : turn.request.text,
          speeches: speeches.map((speech) => ({
            text: speech.text,
            expression: speech.expression,
            time: speech.time,
            source: speech.kind === "speech" ? "speak" : "reaction",
          })),
          expression: speeches.at(-1)?.expression,
        }
      })
  )
}

/** 吹き出しに出した記録（`speak` のセリフと、出し始めた反応）。 */
function isSpokenRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "speech" | "reaction" }> {
  return record.kind === "speech" || record.kind === "reaction"
}
