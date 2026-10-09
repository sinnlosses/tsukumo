// 帯の左端の部屋の名前と、いまのセッションの短縮IDの札。
// 「浅葱の間 - FA」のうち短縮IDだけがボタンで、押すと切り替え画面が開く（プルダウンにはしない）。
// ボタンへのホバーかフォーカスで、いまのセッションの一行（ID・始まった時刻・依頼の数・「押して切り替え」）を下に出す。
//
// 狭い画面では帯の左端が無いので、同じ部品が引き出しの名乗りの行にも出る。
// 引き出しでは主の字を部屋の名前にし、区切りの「-」を置かずに短縮IDを並べる。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import { Text } from "../../../ui/text/text.tsx"
import { useSessionDigest } from "../hooks/use-session-digest.ts"
import type {
  ScreenNavSessionIdentity,
  ScreenNavSessionTag,
  ScreenNavSessionTitle,
} from "../hooks/use-session-switcher.ts"
import styles from "./screen-nav-session-tag.module.css"

/** 札を置く場所。広い画面の帯の左端か、狭い画面の引き出しの名乗りの行か。 */
export type ScreenNavSessionTagPlacement = "screen-nav" | "nav-drawer"

export type ScreenNavSessionTagProps = {
  readonly tag: ScreenNavSessionTag
  readonly placement: ScreenNavSessionTagPlacement
}

const SWITCH_HINT = "押して切り替え"
const UNKNOWN_SESSION = "記録前のセッション"
/** ID が分かる前に短縮IDの場所へ出す字。 */
const NEW_SESSION_LABEL = "新規"

export function ScreenNavSessionTag(props: ScreenNavSessionTagProps): ReactElement {
  const { tag } = props
  const [peeking, setPeeking] = useState(false)

  return (
    <span
      className={clsx(
        styles["screen-nav-session-tag"],
        props.placement === "nav-drawer" && styles["is-drawer"],
      )}
      onFocus={() => setPeeking(true)}
      onBlur={() => setPeeking(false)}
    >
      {props.placement === "screen-nav" ? (
        <>
          <SessionTagTitle title={tag.title} />
          <span className={styles["screen-nav-session-tag-dash"]} aria-hidden="true">
            -
          </span>
        </>
      ) : (
        <span className={styles["screen-nav-session-tag-drawer-room"]}>{tag.title.room}</span>
      )}
      <button
        type="button"
        className={styles["screen-nav-session-tag-button"]}
        aria-haspopup="dialog"
        aria-expanded={tag.open}
        aria-label={accessibleName(tag.identity)}
        onPointerEnter={() => setPeeking(true)}
        onPointerLeave={() => setPeeking(false)}
        onClick={tag.onOpen}
      >
        <span className={styles["screen-nav-session-tag-id"]}>
          {tag.identity.kind === "known" ? tag.identity.shortId : NEW_SESSION_LABEL}
        </span>
      </button>
      {peeking && !tag.open && <SessionTagTooltip identity={tag.identity} />}
    </span>
  )
}

type SessionTagTitleProps = {
  readonly title: ScreenNavSessionTitle
}

function SessionTagTitle(props: SessionTagTitleProps): ReactElement {
  const { title } = props
  if (title.kind === "room-only") {
    return (
      <Text
        element="span"
        size="heading"
        tone="ink"
        weight="bold"
        className={styles["screen-nav-room"]}
      >
        {title.room}
      </Text>
    )
  }
  return (
    <span className={styles["screen-nav-title"]} title={`${title.project} · ${title.room}`}>
      <Text
        element="span"
        size="heading"
        tone="ink"
        weight="bold"
        className={styles["screen-nav-project"]}
      >
        {title.project}
      </Text>
      <Text
        element="span"
        size="secondary"
        tone="ink-quiet"
        weight="normal"
        className={styles["screen-nav-room-note"]}
      >
        {title.room}
      </Text>
    </span>
  )
}

type SessionTagTooltipProps = {
  readonly identity: ScreenNavSessionIdentity
}

function SessionTagTooltip(props: SessionTagTooltipProps): ReactElement {
  const { identity } = props
  const digest = useSessionDigest(identity.kind === "known" ? identity.sessionId : undefined)
  const parts =
    identity.kind === "known"
      ? [
          `セッション ${identity.shortId}`,
          identity.startedLabel,
          digest.kind === "known" ? `依頼 ${String(digest.requestCount)}` : "",
        ]
      : [UNKNOWN_SESSION]
  return (
    <span role="tooltip" className={styles["screen-nav-session-tag-tooltip"]}>
      {parts.filter((part) => part !== "").join(" · ")}
      <span className={styles["screen-nav-session-tag-hint"]}>{SWITCH_HINT}</span>
    </span>
  )
}

/** 読み上げの名前。部屋の名前は見える字で読めるので、名前には入れない。 */
function accessibleName(identity: ScreenNavSessionIdentity): string {
  const session = identity.kind === "known" ? `セッション ${identity.shortId}` : UNKNOWN_SESSION
  return `${session}。押すとセッションを切り替える画面を開く`
}
