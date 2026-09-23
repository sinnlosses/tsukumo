// サイドバーの「セッション情報」の、セッションの行（`docs/requirements.md` 4.8）。
// 同じディレクトリで起こした tsukumo のセッションを `<select>` に並べ、選ぶと
// `switch-session` を `dispatch` する（駆動の起こし直し。会話はそのセッションの続きから
// 始まり、画面もその記録で組み直される）。
//
// **置き場所がここなのは、セッションが「今回のこと」だから**（`docs/screen-design.md` 13.6
// 「今回のことはサイドバーに、それ以外はキャラクター画面に」）。キャラクターの対と同じ grid
// （`sidebar.module.css` の `.session-info`。`grid-auto-flow: column` で対ごとに列が等分され、
// キャラクターと横に並ぶ）に、ラベルと値の対として並ぶ。
//
// **一覧はいまの部屋（このビューのポート）のものだけ**（`src/server/core/session-restore.ts`）
// なので、行の部屋の名前はすべて同じで見分けの役に立たない。**見分けるのは SDK の見出し
// （`SessionChoice.heading`）と最終更新時刻**（部屋の名前を出す場所は帯だけになった。
// `docs/screen-design.md` 13.9「部屋の名前」）。

import { type ReactElement } from "react"

import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type SessionChoice } from "../../../shared/session-choice.ts"
import { Select } from "../../components/select.tsx"
import { useSessionDispatch, useSessionSelector, useTurnRunning } from "../../stores/session.tsx"
import { clockTime, localTimeZoneId, zonedDateTime } from "../../utils/clock.ts"
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
  const turnInProgress = useTurnRunning()

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
          frameClassName={styles["session-info-select-frame"] ?? ""}
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

/** 見出しが無い（SDK の `summary` が空・読めない）ときに、見出しの位置へ代わりに出す字。 */
const NO_HEADING_LABEL = "（題なし）"

/**
 * 見出しに出す文字数の上限。**`<select>` の選択肢は折り返せない**（`docs/screen-design.md` 13.9）ので、
 * 文字数で切って `…` を足す。**見出しだけを切り、時刻は切らない**——同じ部屋の行を見分けるのは
 * 時刻なので（下の {@link sessionLabel}）、見出しがどれだけ長くても時刻は必ず残る。
 */
const MAX_HEADING_LENGTH = 24

/**
 * 1行の見え方。**見出し（SDK の `summary`）と最終更新時刻の両方**を出す（`docs/requirements.md`
 * 4.8）——一覧はいまの部屋のものだけなので部屋の名前では見分けが付かず、`/clear` で分かれた行は
 * それぞれの中身の分かる見出しで見分ける。
 *
 * 見出しが無い行は {@link NO_HEADING_LABEL} を代わりに出す。
 */
function sessionLabel(session: SessionChoice, isCurrent: boolean): string {
  const heading =
    session.heading === undefined ? NO_HEADING_LABEL : truncateHeading(session.heading)
  const label = `${heading}・${localTimestamp(session.lastModified)}`
  return isCurrent ? `${label}${CURRENT_SUFFIX}` : label
}

function truncateHeading(heading: string): string {
  return heading.length <= MAX_HEADING_LENGTH ? heading : `${heading.slice(0, MAX_HEADING_LENGTH)}…`
}

/**
 * エポックミリ秒を、この端末のローカル時刻の `M/D HH:MM` にする。**日付まで出す**のは、
 * 何日も前の作業が一覧に残るため（時刻だけだと今日のものと見分けられない）。
 *
 * **年は出さない**（一覧に並ぶのは同じディレクトリの作業で、年をまたぐほど古いものを選ぶ
 * 場面が無い）。
 */
function localTimestamp(epochMilliseconds: number): string {
  const at = zonedDateTime(epochMilliseconds, localTimeZoneId())
  return `${String(at.month)}/${String(at.day)} ${clockTime(at)}`
}
