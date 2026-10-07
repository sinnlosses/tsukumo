// ターンの札の頭の器。
// 左に `‹` `›`（`‹` が1つ古いターン、`›` が1つ新しいターン。端ではその側を押せなくする）、続けて見ているターンのタイトル、右端に「n / N」と、最新を見ているときは「最新」の印・過去を見ているときは「最新へ」の口（知らせの行があればそれが同じ席を使う）。
//
// ターンが1件しか無くても出す。
// 依頼はここにしか出ない（タイトルが1行目、続きが2行目以降）ので、省くと依頼が画面から消える。
//
// `[` `]` で前後へ移る口はメインビューの根が受けるので、ここではキーを `title` に添えるだけ。
// 見ていたターンは `location.hash` に乗るので、1つ前に見ていたターンへはブラウザの戻るで帰れる。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { HeadNotice } from "../head-notice/head-notice.tsx"
import { RequestContinuation } from "../request-continuation/request-continuation.tsx"
import type { TurnHeaderModel } from "./hooks/use-turn-header.ts"
import styles from "./turn-header.module.css"

const OLDER_LABEL = "1つ古いターンへ"
const NEWER_LABEL = "1つ新しいターンへ"
const OLDER_KEY = "["
const NEWER_KEY = "]"
const NEWEST_BADGE = "最新"
const TO_NEWEST_LABEL = "最新へ"

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
          title={`${OLDER_LABEL}（${OLDER_KEY} キー）`}
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
          title={`${NEWER_LABEL}（${NEWER_KEY} キー）`}
          className={styles["turn-nav-button"]}
          onClick={onNewer}
        >
          <span aria-hidden="true">›</span>
        </Button>
      </div>
      {/* ページの中の本物の `h2` はこれ1つ（レポートの `##` は `h4` に落とす）。
          1行に収まらないぶんは CSS が省略するので、全文は `title` で読ませる。 */}
      <Heading
        level={2}
        size="subheading"
        tone="inherit"
        weight="bold"
        className={styles["turn-title"]}
      >
        <span className={styles["turn-title-text"]} title={activeTitle}>
          {activeTitle}
        </span>
      </Heading>
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
