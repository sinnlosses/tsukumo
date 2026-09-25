// ターンの札の頭の**器だけ**（`<PresentationalTurnHeader>`）。フックも算出も持たず、
// `hooks/use-turn-header.ts` が畳んだ値と呼び先をそのまま置く（docs/design.md 2章
// 「機能の中を分ける」）。
//
// 左に `‹` `›`（`‹` が1つ古いターン、`›` が1つ新しいターン。端ではその側を押せなくする）、
// 続けて見ているターンのタイトル（矢印と同じ1つのボタン。押すと窓の中のやり取りへ一度で飛べる
// 一覧が開く）、右端に「n / N」と、最新を見ているときは「最新」の印・過去を見ているときは
// 「最新へ」の口。
//
// **ターンが1件しか無くても出す。** 依頼の1行目はここにしか出ない（`turn.tsx` の
// `RequestRest` は2行目以降だけを持つ）ので、省くと依頼が画面から消える。
//
// **キー操作は付けない。** ページでは入力欄にほぼ常にフォーカスがあるので素のキーは使えず、
// 修飾キー付きはブラウザの戻る / 進む（Cmd+[ / Alt+←）とぶつかる。見ていたターンは
// `location.hash` に乗るので、1つ前に見ていたターンへはブラウザの戻るで帰れる
// （`stores/turn-selection.tsx`）。
//
// **開く口は `h2` の中の1つの `<button>`**（タイトルの文字 + 下向きの矢印）。h2 に直接 `onClick` を
// 付ける形は採らない——押せるのはボタンだけにする。アクセシブルネームはタイトルの文字そのもの
// （矢印は `aria-hidden`）。

import { type ReactElement } from "react"

import { Button } from "../../../../../components/ui/button/button.tsx"
import { Text } from "../../../../../components/ui/text/text.tsx"
import { type TurnHeaderHistoryRow, type TurnHeaderModel } from "./hooks/use-turn-header.ts"
import styles from "./turn-header.module.css"

const OLDER_LABEL = "1つ古いターンへ"
const NEWER_LABEL = "1つ新しいターンへ"
const NEWEST_BADGE = "最新"
const TO_NEWEST_LABEL = "最新へ"
const HISTORY_HEADING = "窓の中のやり取り"
const HISTORY_CURRENT_MARK = "●"
const HISTORY_OTHER_MARK = "○"

export type PresentationalTurnHeaderProps = TurnHeaderModel

export function PresentationalTurnHeader({
  olderDisabled,
  onOlder,
  isNewest,
  onNewer,
  activeTitle,
  positionLabel,
  onToNewest,
  historyOpen,
  historyListId,
  titleGroupRef,
  historyToggleRef,
  onToggleHistory,
  historyRows,
  onSelectHistoryRow,
}: PresentationalTurnHeaderProps): ReactElement {
  return (
    <header className={styles["turn-header"]}>
      <div className={styles["turn-nav"]}>
        <Button
          type="button"
          variant="outline"
          size="subheading"
          pressed="none"
          disabled={olderDisabled}
          ariaLabel={OLDER_LABEL}
          ariaHasPopup={undefined}
          title={OLDER_LABEL}
          className={styles["turn-nav-button"] ?? ""}
          onClick={onOlder}
        >
          <span aria-hidden="true">‹</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="subheading"
          pressed="none"
          disabled={isNewest}
          ariaLabel={NEWER_LABEL}
          ariaHasPopup={undefined}
          title={NEWER_LABEL}
          className={styles["turn-nav-button"] ?? ""}
          onClick={onNewer}
        >
          <span aria-hidden="true">›</span>
        </Button>
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
            onClick={onToggleHistory}
          >
            <Text
              element="span"
              size="subheading"
              tone="inherit"
              weight="bold"
              className={styles["turn-title-text"] ?? ""}
            >
              {activeTitle}
            </Text>
            <span className={styles["turn-title-chevron"]} aria-hidden="true" />
          </button>
        </h2>
        {historyOpen ? (
          <TurnHistoryList id={historyListId} rows={historyRows} onSelect={onSelectHistoryRow} />
        ) : null}
      </div>
      <div className={styles["turn-meta"]}>
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["turn-position"] ?? ""}
        >
          {positionLabel}
        </Text>
        {isNewest ? (
          <span className={styles["turn-newest-badge"]}>{NEWEST_BADGE}</span>
        ) : (
          <button type="button" className={styles["turn-to-newest"]} onClick={onToNewest}>
            {TO_NEWEST_LABEL}
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * 矢印で開く、窓の中のやり取りの一覧（新しい順）。**行は2つに分かれる**——依頼の全文
 * （`row.text`）を出す選択できる文字と、そのやり取りへ移って閉じる飛ぶ口（印 + 番号だけの
 * 小さな `<button>`）。行ぜんぶを1つの `<button>` にすると、中の文字が（UAの既定で）
 * 選択できなくなる。
 */
function TurnHistoryList(props: {
  readonly id: string
  readonly rows: readonly TurnHeaderHistoryRow[]
  readonly onSelect: (turnId: number) => void
}): ReactElement {
  return (
    <div
      id={props.id}
      className={styles["turn-history"]}
      role="region"
      aria-label={HISTORY_HEADING}
    >
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="semibold"
        className={styles["turn-history-heading"] ?? ""}
      >
        {HISTORY_HEADING}
      </Text>
      <ul className={styles["turn-history-rows"]}>
        {props.rows.map((row) => (
          <li key={row.id}>
            <div className={styles["turn-history-row"]}>
              <button
                type="button"
                className={styles["turn-history-jump"]}
                aria-current={row.isActive ? "true" : undefined}
                // JSX は隣り合う要素の間に空白を残さないので、そのまま読ませると
                // 「2 / 3」と本文がくっつく。読める名前にするため `aria-label` を別に組む。
                aria-label={`${row.positionLabel}: ${row.title}`}
                onClick={() => {
                  props.onSelect(row.id)
                }}
              >
                <span className={styles["turn-history-mark"]} aria-hidden="true">
                  <Text element="span" size="inherit" tone="accent" weight="inherit" className="">
                    {row.isActive ? HISTORY_CURRENT_MARK : HISTORY_OTHER_MARK}
                  </Text>
                </span>
                <span className={styles["turn-history-position"]} aria-hidden="true">
                  <Text
                    element="span"
                    size="secondary"
                    tone="ink-quiet"
                    weight="inherit"
                    className=""
                  >
                    {row.positionLabel}
                  </Text>
                </span>
              </button>
              {/* 選択してコピーするための、ただの文字（ボタンではない）。改行はそのまま
                  `white-space: pre-wrap`（`turn-header.module.css`）で見せる。 */}
              <span className={styles["turn-history-text"]}>{row.text}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
