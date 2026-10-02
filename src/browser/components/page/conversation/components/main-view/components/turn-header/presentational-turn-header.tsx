// ターンの札の頭の器。
// 左に `‹` `›`（`‹` が1つ古いターン、`›` が1つ新しいターン。端ではその側を押せなくする）、続けて見ているターンのタイトル（押すと窓の中のやり取りへ一度で飛べる一覧が開く）、右端に「n / N」と、最新を見ているときは「最新」の印・過去を見ているときは「最新へ」の口（知らせの行があればそれが同じ席を使う）。
//
// ターンが1件しか無くても出す。
// 依頼はここにしか出ない（タイトルが1行目、続きが2行目以降）ので、省くと依頼が画面から消える。
//
// キー操作は付けない。
// ページでは入力欄にほぼ常にフォーカスがあるので素のキーは使えず、修飾キー付きはブラウザの戻る / 進む（Cmd+[ / Alt+←）とぶつかる。
// 見ていたターンは `location.hash` に乗るので、1つ前に見ていたターンへはブラウザの戻るで帰れる。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { HeadNotice } from "../head-notice/head-notice.tsx"
import { RequestContinuation } from "../request-continuation/request-continuation.tsx"
import type { TurnHeaderHistoryRow, TurnHeaderModel } from "./hooks/use-turn-header.ts"
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
  activeTurnId,
  activeRequestRest,
  positionLabel,
  onToNewest,
  historyOpen,
  historyListId,
  titleGroupRef,
  historyToggleRef,
  onToggleHistory,
  historyRows,
  onSelectHistoryRow,
  notice,
  onNotice,
}: PresentationalTurnHeaderProps): ReactElement {
  return (
    <header className={styles["turn-header"]}>
      <div className={styles["turn-nav"]}>
        <Button
          variant="outline"
          size="subheading"
          pressed="none"
          disabled={olderDisabled}
          ariaLabel={OLDER_LABEL}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={OLDER_LABEL}
          className={styles["turn-nav-button"]}
          onClick={onOlder}
        >
          <span aria-hidden="true">‹</span>
        </Button>
        <Button
          variant="outline"
          size="subheading"
          pressed="none"
          disabled={isNewest}
          ariaLabel={NEWER_LABEL}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={NEWER_LABEL}
          className={styles["turn-nav-button"]}
          onClick={onNewer}
        >
          <span aria-hidden="true">›</span>
        </Button>
      </div>
      {/* ページの中の本物の `h2` はこれ1つ（レポートの `##` は `h4` に落とす）。
          中身は1つの `<button>`（タイトルの文字 + 下向きの矢印）で、h2 に直接 `onClick` を付けず、押せるのはボタンだけにする。
          アクセシブルネームはタイトルの文字そのもの（矢印は `aria-hidden`）。
          1行に収まらないぶんは CSS が省略するので、全文はボタンの `title` で読ませる。
          一覧はこの枠（`titleGroupRef`）の中に置き、そこが `useDismissSignal` の「外側」の基準になる。 */}
      <div className={styles["turn-title-group"]} ref={titleGroupRef}>
        <Heading
          level={2}
          size="subheading"
          tone="inherit"
          weight="bold"
          className={styles["turn-title"]}
        >
          <Button
            variant="ghost-hover-outline"
            size="subheading"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup={undefined}
            disclosure={{
              kind: "popover",
              ref: historyToggleRef,
              expanded: historyOpen,
              controls: historyListId,
            }}
            title={activeTitle}
            className={styles["turn-title-toggle"]}
            onClick={onToggleHistory}
          >
            <Text
              element="span"
              size="subheading"
              tone="inherit"
              weight="bold"
              className={styles["turn-title-text"]}
            >
              {activeTitle}
            </Text>
            <span className={styles["turn-title-chevron"]} aria-hidden="true" />
          </Button>
        </Heading>
        {historyOpen && (
          <TurnHistoryList id={historyListId} rows={historyRows} onSelect={onSelectHistoryRow} />
        )}
      </div>
      <div className={styles["turn-meta"]}>
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["turn-position"]}
        >
          {positionLabel}
        </Text>
        {notice.kind === "notice" ? (
          <HeadNotice text={notice.text} onPress={onNotice} />
        ) : isNewest ? (
          <span className={styles["turn-newest-badge"]}>{NEWEST_BADGE}</span>
        ) : (
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["turn-to-newest"]}
            onClick={onToNewest}
          >
            {TO_NEWEST_LABEL}
          </Button>
        )}
      </div>
      {activeRequestRest.length > 0 && (
        <div className={styles["turn-request-rest"]}>
          <RequestContinuation key={activeTurnId} lines={activeRequestRest} />
        </div>
      )}
    </header>
  )
}

/**
 * 矢印で開く、窓の中のやり取りの一覧（新しい順）。
 * 行は、依頼の全文（`row.text`）を出す選択できる文字と、そのやり取りへ移って閉じる飛ぶ口（印 + 番号だけの小さな `<button>`）に分かれる。
 * 行ぜんぶを1つの `<button>` にすると、中の文字が（UA の既定で）選択できなくなる。
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
        className={styles["turn-history-heading"]}
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
                // JSX は隣り合う要素の間に空白を残さないので、そのまま読ませると「2 / 3」と本文がくっつく。
                // 読める名前にするため `aria-label` を別に組む。
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
              {/* 選択してコピーするための、ただの文字（ボタンではない）。改行はそのまま `white-space: pre-wrap` で見せる。 */}
              <Text
                element="span"
                size="inherit"
                tone="inherit"
                weight="inherit"
                className={styles["turn-history-text"]}
              >
                {row.text}
              </Text>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
