// ターンごとのセリフ。確定した記録（`SessionRecord`）から、そのターンの吹き出しと表情を引き直す。
// セリフのログと、留めた行（ターンの番号と位置）を引く先はどのターンもこれ。
// 今のターンの吹き出しは `SessionState.speeches` / `speechExpression` が持つ（`request` で空に戻るなどの規則が乗っていて、記録から素直には導けない）。

import type { Expression } from "../character-pack/expression.ts"
import type { RecordTime, SessionRecord } from "./session-record.ts"
import { splitIntoTurns, turnIdOf } from "./turn.ts"

/** `speak` で来た1件のセリフと、そのときの表情。吹き出し・セリフのログが押して遡る先の材料になる。 */
export type Speech = {
  readonly text: string
  readonly expression: Expression
  /** 言った時刻（記録の `time` と同じ値）。 */
  readonly time: RecordTime
}

/**
 * ターンの流れに出した1件。`source` は `speak` のセリフ（`speak`）か、出し始めた反応（`reaction`）か、利用者が押した相づちの札（`you`）か。
 * `you` の `expression` は、その直前までに出していた顔（立ち絵は札では変わらない）。
 */
export type TurnLine = Speech & { readonly source: "speak" | "reaction" | "you" }

/** 1ターン分のセリフ。`id` は `mainViewTurns` が振る通し番号と同じ（タブの選択からそのまま引ける）。 */
export type TurnSpeech = {
  readonly id: number
  /** そのターンの依頼の文面。依頼より前に届いたセリフのまとまりは依頼を持たないので undefined。 */
  readonly request?: string
  /**
   * そのターンのセリフと、吹き出しに出し始めた反応（古い→新しいの順）。1件も無いターンは空配列。
   * 表情ごと持つのは、セリフを押して立ち絵を遡らせるため。
   */
  readonly speeches: readonly TurnLine[]
  /** `speeches` の最後の1件の表情（そのターンで最後に出していた顔）。1件も無ければ undefined。 */
  readonly expression?: Expression
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
        const lines = turn.records
          .filter(isSpokenRecord)
          .reduce<readonly TurnLine[]>((acc, record) => [...acc, lineOf(record, acc)], [])
        return {
          id: turnIdOf(turn),
          request: turn.kind === "pre-request" ? undefined : turn.request.text,
          speeches: lines,
          expression: lines.at(-1)?.expression,
        }
      })
  )
}

type SpokenRecord = Extract<
  SessionRecord,
  { readonly kind: "speech" | "reaction" | "aizuchi-chip" }
>

/** 流れに出した記録（`speak` のセリフ・出し始めた反応・利用者が押した札）。 */
function isSpokenRecord(record: SessionRecord): record is SpokenRecord {
  return record.kind === "speech" || record.kind === "reaction" || record.kind === "aizuchi-chip"
}

function lineOf(record: SpokenRecord, earlier: readonly TurnLine[]): TurnLine {
  if (record.kind === "aizuchi-chip") {
    return {
      text: record.text,
      expression: earlier.at(-1)?.expression ?? DEFAULT_EXPRESSION,
      time: record.time,
      source: "you",
    }
  }
  return {
    text: record.text,
    expression: record.expression,
    time: record.time,
    source: record.kind === "speech" ? "speak" : "reaction",
  }
}

/** 札のほかに顔の手がかりが無いターンに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_EXPRESSION = "default"
