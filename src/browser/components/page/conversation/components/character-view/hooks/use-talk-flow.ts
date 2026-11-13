// 舞台のやり取りの流れ（`<TalkFlow>`）に渡す行。記録の全部のターンから組む。
// 最新のターンを見ているあいだは、いまの吹き出しの段が出している最新のセリフを流れには重ねない。

import { useSession } from "../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../stores/turn-selection.ts"
import { localTimeZoneId } from "../../../../../../utils/clock.ts"
import { talkFlowOf, type TalkFlowRow } from "../domain/talk-flow.ts"

/** いまの吹き出しが反応を出しているか（`BalloonReaction` のうち、ここが見る分）。 */
type BalloonReaction =
  | { readonly kind: "none" }
  | { readonly kind: "writing" }
  | { readonly kind: "shown"; readonly text: string }

export function useTalkFlow(reaction: BalloonReaction): readonly TalkFlowRow[] {
  const records = useSession((session) => session.state.records)
  const userCall = useSession((session) => session.state.character?.userCall)
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const rows = talkFlowOf(records, localTimeZoneId(), userCall)
  return activeTurnId === newestTurnId ? withoutBalloonLine(rows, reaction) : rows
}

/**
 * いまの吹き出しが出している行を流れから外す。
 * 反応を出していればその行（記録に積まれていれば最後の `her`）、無ければ最後のセリフが吹き出しにある。
 * 迎えの挨拶を書いている途中（`writing`）は吹き出しが「…」なので、何も外さない。
 */
function withoutBalloonLine(
  rows: readonly TalkFlowRow[],
  reaction: BalloonReaction,
): readonly TalkFlowRow[] {
  const last = rows.findLastIndex((row) => row.kind === "her")
  const lastRow = rows[last]
  const shownInBalloon =
    lastRow !== undefined &&
    (reaction.kind === "none" || (reaction.kind === "shown" && lastRow.text === reaction.text))
  return shownInBalloon ? rows.filter((_, index) => index !== last) : rows
}
