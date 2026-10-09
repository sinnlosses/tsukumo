// 狭い画面の引き出しの「やり取り」のタブ。このセッションのやり取りを古い順（新しいものが下）に1行ずつ並べる。
// 材料はやり取りの列と同じ（`useReportOutlineTurns`）で、2行目の時刻（`turnSpans`）はここでだけ引く。
//
// いまの回（最新のやり取りで、経過を数えているあいだ）は回る輪と淡い差し色の地で、2行目は「作業中 <経過>」。経過は頭と同じ数え方。
// 行を押すと引き出しを閉じ、会話の画面のそのやり取りへ移る。

import clsx from "clsx"
import type { ReactElement } from "react"

import { isTurnCounting, turnElapsedClock } from "../../../../../../../domain/turn-elapsed.ts"
import { useNowWhile } from "../../../../../../../hooks/use-now-while.ts"
import { useNavDrawer } from "../../../../../../../stores/nav-drawer.ts"
import { useSession } from "../../../../../../../stores/session.ts"
import { showTurn, useTurnSelection } from "../../../../../../../stores/turn-selection.ts"
import { localTimeZoneId } from "../../../../../../../utils/clock.ts"
import { TURN_RESULT_MARKS } from "../../../../domain/turn-result-mark.ts"
import { turnSpanLabel, turnSpans, type TurnSpan } from "../../domain/turn-span.ts"
import { useReportOutlineTurns } from "../../hooks/use-report-outline-turns.ts"
import styles from "./turn-list.module.css"

const UNKNOWN_SPAN: TurnSpan = { kind: "unknown" }

const EMPTY_TEXT = "まだやり取りは無い"
const WORKING_LABEL = "作業中"

export function TurnList(): ReactElement {
  const turns = useReportOutlineTurns()
  const records = useSession((session) => session.state.records)
  const spans = turnSpans(records)
  const { activeTurnId } = useTurnSelection()
  const turn = useSession((session) => session.state.turn)
  const backgroundTaskCount = useSession((session) => session.state.backgroundTasks.length)
  const closeDrawer = useNavDrawer((state) => state.close)
  const counting = isTurnCounting(turn, backgroundTaskCount)
  const now = useNowWhile(counting)
  const timeZone = localTimeZoneId()
  const newestTurnId = turns.at(-1)?.id

  if (turns.length === 0) {
    return <p className={styles["turn-list-empty"]}>{EMPTY_TEXT}</p>
  }

  return (
    <ol className={styles["turn-list"]}>
      {turns.map((entry) => {
        const working = counting && entry.id === newestTurnId
        const result = TURN_RESULT_MARKS[entry.result]
        const spanLabel = working
          ? `${WORKING_LABEL} ${turnElapsedClock(turn, backgroundTaskCount, now)}`
          : turnSpanLabel(spans.get(entry.id) ?? UNKNOWN_SPAN, timeZone)
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={clsx(styles["turn-list-row"], working && styles["is-working"])}
              data-result={entry.result}
              aria-current={entry.id === activeTurnId ? "true" : undefined}
              aria-label={`${working ? WORKING_LABEL : result.label}: ${entry.title}`}
              onClick={() => {
                closeDrawer()
                showTurn(entry.id)
              }}
            >
              <span className={styles["turn-list-mark"]} aria-hidden="true">
                {working ? <span className={styles["turn-list-spinner"]} /> : result.mark}
              </span>
              <span className={styles["turn-list-body"]}>
                <span className={styles["turn-list-title"]}>{entry.title}</span>
                {spanLabel !== "" && <span className={styles["turn-list-span"]}>{spanLabel}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
