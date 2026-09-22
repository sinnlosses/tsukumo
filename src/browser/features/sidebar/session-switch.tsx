// サイドバーの「セッション情報」の、セッションの行（`docs/requirements.md` 4.8）。
// 同じディレクトリで起こした tsukumo のセッションを `<select>` に並べ、選ぶと
// `switch-session` を `dispatch` する（駆動の起こし直し。会話はそのセッションの続きから
// 始まり、画面もその記録で組み直される）。
//
// **置き場所がここなのは、セッションが「今回のこと」だから**（`docs/design.md` 13.6
// 「今回のことはサイドバーに、それ以外はキャラクター画面に」）。キャラクターの行と同じ2列の
// grid（`sidebar.module.css` の `.session-info`）に、ラベルと値の対として並ぶ。
//
// **一覧に会話の内容は入らない**（`src/shared/session-choice.ts`）ので、見分けるのは
// 目印と最終更新時刻だけ。**目印は部屋の名前として出す**（`src/shared/room.ts`。13.9）。

import { type ReactElement } from "react"

import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { roomName } from "../../../shared/room.ts"
import { type SessionChoice } from "../../../shared/session-choice.ts"
import { Select } from "../../components/select.tsx"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import switchStyles from "./session-switch.module.css"
import styles from "./sidebar.module.css"

const SESSION_SELECT_ID = "tsukumo-session"

/**
 * いま出しているセッションが一覧に無いときの行（`<select>` の値には必ず対応する選択肢が
 * 要る）。**無いのは2通り** — 新規に起こして印がまだ付いていない（印が付くのはターンが
 * 終わって3秒後）か、古すぎて一覧の上限（`MAX_SESSION_CHOICES`）から漏れたか。
 */
const CURRENT_LABEL = "いまのセッション"

/** そのうち、新規に起こしてまだ印が付いていないほう（IDすら分かっていない）。 */
const UNMARKED_CURRENT_LABEL = `${CURRENT_LABEL}（記録前）`

/** いま出しているセッションの行に添える字。**選ばせないのではなく、印を付けて示す。** */
const CURRENT_SUFFIX = "（表示中）"

/** 切り替えは起こし直しなので、キャラクターの `<select>` と同じ条件（ターン進行中）で塞ぐ。 */
const SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.sessionSwitchDuringTurn

/**
 * セッションの行。**切り替え先が1つも無いときは行ごと出さない**（印の付いたセッションが
 * まだ無い＝選べるものが無い。キャラクターの `<select>` と同じ振る舞い）。
 */
export function SessionSwitch(): ReactElement | null {
  const dispatch = useSessionDispatch()
  const sessions = useSessionSelector((session) => session.state.sessions)
  const currentSessionId = useSessionSelector((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")

  if (sessions.length === 0) {
    return null
  }

  const current = currentSessionId ?? ""
  return (
    <>
      <label htmlFor={SESSION_SELECT_ID} className={styles["session-info-label"]}>
        セッション
      </label>
      <span className={styles["session-info-value"]}>
        <Select
          id={SESSION_SELECT_ID}
          ariaLabel="セッション"
          className={switchStyles["session-select"] ?? ""}
          value={current}
          disabled={turnInProgress}
          title={turnInProgress ? SWITCH_BLOCKED_TITLE : undefined}
          options={sessionOptions(sessions, current)}
          onChange={(value) => {
            // いま出しているものを選び直しても、起こし直さない（会話が消えるだけで何も
            // 変わらない）。
            if (value !== current) {
              dispatch({ type: "switch-session", sessionId: value })
            }
          }}
        />
      </span>
    </>
  )
}

/**
 * `<select>` に並べる選択肢。**いま出しているセッションが一覧に無いときは先頭に足す**
 * （`value` に対応する選択肢が無いと、ブラウザが勝手に先頭を選んだ姿になり、まだ切り替えて
 * いないのに別のセッションを指して見える）。
 */
function sessionOptions(
  sessions: readonly SessionChoice[],
  current: string,
): readonly { readonly value: string; readonly label: string }[] {
  const listed = sessions.map((session) => ({
    value: session.sessionId,
    label: sessionLabel(session, session.sessionId === current),
  }))
  const label = current === "" ? UNMARKED_CURRENT_LABEL : CURRENT_LABEL
  return sessions.some((session) => session.sessionId === current)
    ? listed
    : [{ value: current, label }, ...listed]
}

/**
 * 1行の見え方。**部屋の名前と最終更新時刻の両方**を出す（`docs/requirements.md` 4.8）——同じ
 * 部屋の行が複数並ぶことがあるので、どれがどの作業かは時刻で見分ける。
 *
 * **ポート番号は名前と並べて出さない**（名前はポート番号の言い換えなので、見分けの助けに
 * ならない。`docs/design.md` 13.9）。語彙の外のポートは `roomName` がポート番号を名乗るので、
 * 今までの見え方のまま残る。
 */
function sessionLabel(session: SessionChoice, isCurrent: boolean): string {
  const label = `${roomName(session.viewPort)}・${localTimestamp(session.lastModified)}`
  return isCurrent ? `${label}${CURRENT_SUFFIX}` : label
}

/**
 * エポックミリ秒を、この端末のローカル時刻の `M/D HH:MM` にする。**日付まで出す**のは、
 * 何日も前の作業が一覧に残るため（時刻だけだと今日のものと見分けられない）。
 *
 * **年は出さない**（一覧に並ぶのは同じディレクトリの作業で、年をまたぐほど古いものを選ぶ
 * 場面が無い）。
 */
function localTimestamp(epochMilliseconds: number): string {
  const at = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(
    Temporal.Now.timeZoneId(),
  )
  return `${String(at.month)}/${String(at.day)} ${at.toPlainTime().toString({ smallestUnit: "minute" })}`
}
