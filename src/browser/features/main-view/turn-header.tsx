// ターンの札の頭（`docs/requirements.md` 4.2）。左に `‹` `›`（`‹` が1つ古いターン、`›` が1つ
// 新しいターン。端ではその側を押せなくする）、続けて見ているターンのタイトル（矢印と同じ1つの
// ボタン。押すと窓の中のやり取りへ一度で飛べる一覧が開く）、右端に「n / N」（窓の中の何件目か。
// 古いほうが1）と、最新を見ているときは「最新」の印・過去を見ているときは「最新へ」の口。
//
// **ターンが1件しか無くても出す。** 依頼の1行目はここにしか出ない（`turn.tsx` の
// `RequestRest` は2行目以降だけを持つ）ので、省くと依頼が画面から消える。
//
// **キー操作は付けない。** ページでは入力欄にほぼ常にフォーカスがあるので素のキーは使えず、
// 修飾キー付きはブラウザの戻る / 進む（Cmd+[ / Alt+←）とぶつかる。見ていたターンは
// `location.hash` に乗るので、1つ前に見ていたターンへはブラウザの戻るで帰れる
// （`stores/turn-selection.tsx`）。
//
// **一覧の並びは新しいものを上にする**（履歴の一覧としてよくある並びで、過去へ飛びたいときに
// 目当ての行を上から順に探しやすい）。行の番号（n / N）は `‹` `›` の脇に出す「n / N」と
// **同じ、古いほうを1とする通し番号**なので、並びを新しい順にしても数字自体は矛盾しない
// （最新の行だけは番号の代わりに「最新」を出す）。
//
// 開閉は帯に前例がある `browser/hooks/use-dismiss-signal.ts` の `useDismissSignal`
// （もう一度押す・外側・Esc で閉じる。Esc は開く口へフォーカスを戻す）。行を選ぶとその場で
// 閉じてターンを移す——最新の行を選べば `onSelect` の先（`stores/turn-selection.tsx` の
// `selectTurn`）がそのまま追従に戻す規則を持っているので、ここで特別扱いはしない。
//
// **開く口は `h2` の中の1つの `<button>`**（タイトルの文字 + 下向きの矢印）。h2 に直接 `onClick` を
// 付ける形は採らない——押せるのはボタンだけにする。アクセシブルネームはタイトルの文字そのもの
// （矢印は `aria-hidden`）。

import { useCallback, useId, useRef, useState, type ReactElement } from "react"

import { useDismissSignal, type DismissCause } from "../../hooks/use-dismiss-signal.ts"
import styles from "./main-view.module.css"

/** 一覧の1行ぶん（`main-view.tsx` が `domain/turn-title.ts` の `turnTitle` で作る）。 */
export type TurnHeaderEntry = {
  readonly id: number
  readonly title: string
}

export type TurnHeaderProps = {
  /** 窓の中のターン。**古い順**（末尾が最新）。 */
  readonly turns: readonly TurnHeaderEntry[]
  readonly activeTurnId: number
  readonly onSelect: (turnId: number) => void
}

const OLDER_LABEL = "1つ古いターンへ"
const NEWER_LABEL = "1つ新しいターンへ"
const NEWEST_BADGE = "最新"
const TO_NEWEST_LABEL = "最新へ"
const HISTORY_HEADING = "窓の中のやり取り"
const HISTORY_CURRENT_MARK = "●"
const HISTORY_OTHER_MARK = "○"

export function TurnHeader(props: TurnHeaderProps): ReactElement {
  const index = props.turns.findIndex((turn) => turn.id === props.activeTurnId)
  const older = props.turns[index - 1]?.id
  const newer = props.turns[index + 1]?.id
  const newest = props.turns.at(-1)?.id
  // `noUncheckedIndexedAccess` が生む `| undefined`（`docs/coding-standards.md`「無いかもしれない
  // 値」）。呼び出し側は必ず `turns` に含まれる id を渡す契約だが、畳まずそのまま使う
  // （`older` / `newer` と同じ扱い。属性・子要素として渡す先がどれも `undefined` を受け付ける）。
  const activeTitle = props.turns[index]?.title

  const [historyOpen, setHistoryOpen] = useState(false)
  const historyListId = useId()
  const titleGroupRef = useRef<HTMLDivElement>(null)
  const historyToggleRef = useRef<HTMLButtonElement>(null)

  const onDismissHistory = useCallback((cause: DismissCause): void => {
    setHistoryOpen(false)
    if (cause === "escape") {
      historyToggleRef.current?.focus()
    }
  }, [])

  useDismissSignal({ open: historyOpen, rootRef: titleGroupRef, onDismiss: onDismissHistory })

  function selectFromHistory(turnId: number): void {
    setHistoryOpen(false)
    props.onSelect(turnId)
  }

  return (
    <header className={styles["turn-header"]}>
      <div className={styles["turn-nav"]}>
        <button
          type="button"
          className={styles["turn-nav-button"]}
          aria-label={OLDER_LABEL}
          title={OLDER_LABEL}
          disabled={older === undefined}
          onClick={() => {
            if (older !== undefined) {
              props.onSelect(older)
            }
          }}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className={styles["turn-nav-button"]}
          aria-label={NEWER_LABEL}
          title={NEWER_LABEL}
          disabled={newer === undefined}
          onClick={() => {
            if (newer !== undefined) {
              props.onSelect(newer)
            }
          }}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {/* ページの中の本物の `h2` はこれ1つ（レポートの `##` は `h4` に落とす。
          `markdown/markdown.tsx`）。**中身は1つの `<button>`**（タイトルの文字 + 下向きの矢印）——
          h2 に直接 `onClick` を付けず、押せるのはボタンだけにする。1行に収まらないぶんは
          CSS が省略するので、全文はボタンの `title` で読ませる。一覧はこの枠（`titleGroupRef`）の
          中に置き、そこが `useDismissSignal` の「外側」の基準になる。 */}
      <div className={styles["turn-title-group"]} ref={titleGroupRef}>
        <h2 className={styles["turn-title"]}>
          <button
            type="button"
            ref={historyToggleRef}
            className={styles["turn-title-toggle"]}
            title={activeTitle}
            aria-expanded={historyOpen}
            aria-controls={historyListId}
            onClick={() => {
              setHistoryOpen((wasOpen) => !wasOpen)
            }}
          >
            <span className={styles["turn-title-text"]}>{activeTitle}</span>
            <ChevronDownIcon />
          </button>
        </h2>
        {historyOpen ? (
          <TurnHistoryList
            id={historyListId}
            turns={props.turns}
            activeTurnId={props.activeTurnId}
            onSelect={selectFromHistory}
          />
        ) : null}
      </div>
      <div className={styles["turn-meta"]}>
        <span className={styles["turn-position"]}>
          {String(index + 1)} / {String(props.turns.length)}
        </span>
        {newer === undefined ? (
          <span className={styles["turn-newest-badge"]}>{NEWEST_BADGE}</span>
        ) : (
          <button
            type="button"
            className={styles["turn-to-newest"]}
            onClick={() => {
              if (newest !== undefined) {
                props.onSelect(newest)
              }
            }}
          >
            {TO_NEWEST_LABEL}
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * タイトルの右に添える下向きの矢印。**字（`⌄`）ではなく線画**にする — 字は書体ごとに
 * 太さも高さも変わり、帯の <select> の矢印（`screen-nav.module.css` の
 * `.screen-nav-select::after`）と揃わない。形・太さ・大きさはその矢印と同じ
 * （見本は `docs/history/mockup/` の履歴案）。
 */
function ChevronDownIcon(): ReactElement {
  return (
    <svg
      className={styles["turn-title-chevron"]}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** 矢印で開く、窓の中のやり取りの一覧（新しい順）。行を押すとそのやり取りへ移って閉じる。 */
function TurnHistoryList(props: {
  readonly id: string
  readonly turns: readonly TurnHeaderEntry[]
  readonly activeTurnId: number
  readonly onSelect: (turnId: number) => void
}): ReactElement {
  const total = props.turns.length
  // 番号は `‹` `›` の脇と同じ、古いほうを1とする通し番号（配列の並びそのもの）。
  // 表示だけを新しい順にするので、番号を振ってから反転する。
  const rows = props.turns
    .map((turn, position) => ({
      ...turn,
      isActive: turn.id === props.activeTurnId,
      positionLabel:
        position === total - 1 ? NEWEST_BADGE : `${String(position + 1)} / ${String(total)}`,
    }))
    .toReversed()

  return (
    <div
      id={props.id}
      className={styles["turn-history"]}
      role="region"
      aria-label={HISTORY_HEADING}
    >
      <p className={styles["turn-history-heading"]}>{HISTORY_HEADING}</p>
      <ul className={styles["turn-history-rows"]}>
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={styles["turn-history-row"]}
              aria-current={row.isActive ? "true" : undefined}
              // JSX は隣り合う要素の間に空白を残さないので、そのまま読ませると
              // 「2 / 3」と本文がくっつく。読める名前にするため `aria-label` を別に組む。
              aria-label={`${row.positionLabel}: ${row.title}`}
              onClick={() => {
                props.onSelect(row.id)
              }}
            >
              <span className={styles["turn-history-mark"]} aria-hidden="true">
                {row.isActive ? HISTORY_CURRENT_MARK : HISTORY_OTHER_MARK}
              </span>
              <span className={styles["turn-history-position"]} aria-hidden="true">
                {row.positionLabel}
              </span>
              <span className={styles["turn-history-title"]} aria-hidden="true">
                {row.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
