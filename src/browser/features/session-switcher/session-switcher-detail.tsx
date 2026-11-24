// セッション1件の詳細（短縮ID・期間と依頼数・キャラクター・要約・残り・最後のひとこと・切り替えるボタン）。
// 切り替え画面の右の欄と、札の右隣のパネルが同じ部品を使う。
// 顔の部品は機能の外にあるので、呼ぶ側が `face` で差し込む。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { summaryParagraphs } from "../../../shared/session/session-digest.ts"
import type { SessionId } from "../../../shared/session/session-id.ts"
import { Button } from "../../components/ui/button/button.tsx"
import { Heading } from "../../components/ui/heading/heading.tsx"
import { Text } from "../../components/ui/text/text.tsx"
import styles from "./session-switcher-detail.module.css"
import type { SessionSwitcherRow } from "./session-switcher-row.ts"
import type { SessionDigestView } from "./use-session-digest.ts"

const SUMMARY_HEADING = "このセッションの要約"
const LAST_LINE_HEADING = "最後のひとこと"
const NO_SUMMARY = "要約はまだ無い（このセッションの report に要約が書かれていない）"
const REMAINING_LABEL = "残り："
const LOADING = "読み込み中…"
const UNAVAILABLE = "このセッションの記録は読めなかった"
const CURRENT_BUTTON = "いま出しているセッション"

type SessionSwitcherDetailProps = {
  readonly row: SessionSwitcherRow
  readonly digest: SessionDigestView
  readonly characterName: string
  /** 名前の前に出すキャラクターの顔。 */
  readonly face: ReactNode
  /** 短縮IDの行の下に題を1行で出すか。 */
  readonly showTitle: boolean
  readonly blocked: boolean
  readonly blockedTitle?: string
  /** ボタンの左に添える一言（キーの印など）。 */
  readonly footNote?: ReactNode
  /** 区画の余白などを呼ぶ側が決めるときの class。 */
  readonly className?: string
  readonly onSwitch: (sessionId: SessionId) => void
}

export function SessionSwitcherDetail(props: SessionSwitcherDetailProps): ReactElement {
  const { row, digest } = props
  const meta =
    digest.kind === "known"
      ? `${row.rangeLabel} · 依頼 ${String(digest.requestCount)}`
      : row.rangeLabel
  return (
    <section
      className={clsx(styles["session-switcher-detail"], props.className)}
      aria-label={`セッション ${row.shortId}`}
    >
      <div className={styles["session-switcher-detail-head"]}>
        <span className={styles["session-switcher-detail-id"]}>{row.shortId}</span>
        <Text
          element="span"
          size="action"
          tone="ink-quiet"
          weight="inherit"
          className={styles["session-switcher-detail-meta"]}
        >
          {meta}
        </Text>
        <Text
          element="span"
          size="action"
          tone="ink-quiet"
          weight="inherit"
          className={styles["session-switcher-detail-character"]}
        >
          {props.face}
          {props.characterName}
        </Text>
      </div>
      {props.showTitle && (
        <Text
          element="p"
          size="secondary"
          tone="ink"
          weight="bold"
          className={styles["session-switcher-detail-title"]}
        >
          {row.heading}
        </Text>
      )}
      <div className={styles["session-switcher-detail-body"]}>
        <DigestBody digest={digest} characterName={props.characterName} />
      </div>
      <div className={styles["session-switcher-detail-foot"]}>
        {props.footNote !== undefined && (
          <div className={styles["session-switcher-detail-foot-note"]}>{props.footNote}</div>
        )}
        <Button
          variant="solid-accent-static"
          size="subheading"
          pressed="none"
          disabled={props.blocked || row.current}
          disclosure={{ kind: "none" }}
          title={row.current ? undefined : props.blockedTitle}
          className={styles["session-switcher-switch"]}
          onClick={() => props.onSwitch(row.sessionId)}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            {row.current ? CURRENT_BUTTON : `${row.shortId} に切り替える`}
          </Text>
        </Button>
      </div>
    </section>
  )
}

type DigestBodyProps = {
  readonly digest: SessionDigestView
  readonly characterName: string
}

function DigestBody(props: DigestBodyProps): ReactElement {
  const { digest } = props
  if (digest.kind === "loading") {
    return (
      <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
        {LOADING}
      </Text>
    )
  }
  if (digest.kind === "unavailable") {
    return (
      <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
        {UNAVAILABLE}
      </Text>
    )
  }
  return (
    <>
      <Heading
        level={3}
        size="action"
        tone="accent"
        weight="bold"
        className={styles["session-switcher-summary-heading"]}
      >
        {SUMMARY_HEADING}
      </Heading>
      {digest.summary === undefined ? (
        <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
          {NO_SUMMARY}
        </Text>
      ) : (
        summaryParagraphs(digest.summary).map((paragraph, index) => (
          <p key={`${String(index)}-${paragraph}`} className={styles["session-switcher-paragraph"]}>
            {paragraph}
          </p>
        ))
      )}
      {digest.remaining !== undefined && (
        <p className={styles["session-switcher-paragraph"]} data-remaining="true">
          {REMAINING_LABEL}
          {digest.remaining}
        </p>
      )}
      {digest.lastLine !== undefined && (
        <div className={styles["session-switcher-last-line"]}>
          <div className={styles["session-switcher-last-line-label"]}>{LAST_LINE_HEADING}</div>
          <div className={styles["session-switcher-last-line-text"]}>
            {props.characterName}「{digest.lastLine}」
          </div>
        </div>
      )}
    </>
  )
}
