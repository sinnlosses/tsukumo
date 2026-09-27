// 帯の左端の部屋の名前と、いまのセッションの短縮IDの札（`docs/screen-design.md`「セッションの札」）。
// 「浅葱の間 - FA」のうち短縮IDだけがボタンで、押すと切り替え画面が開く（プルダウンにはしない）。
// ボタンへのホバーかフォーカスで、いまのセッションの一行（ID・始まった時刻・依頼の数・「押して切り替え」）を下に出す。
//
// 狭い画面では帯の左端が無い（「≡」だけになる）ので、同じ部品が「≡」の中の先頭にも出る。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import { useSessionDigest } from "../hooks/use-session-digest.ts"
import type {
  ScreenNavSessionIdentity,
  ScreenNavSessionTag,
} from "../hooks/use-session-switcher.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-session-tag.module.css"

export type ScreenNavSessionTagProps = {
  readonly tag: ScreenNavSessionTag
  /** 押したあとに呼ぶもの（「≡」の面の中では面を閉じる）。 */
  readonly onOpened: () => void
}

const SWITCH_HINT = "押して切り替え"
const UNKNOWN_SESSION = "記録前のセッション"
/** ID が分かる前に短縮IDの場所へ出す字。 */
const NEW_SESSION_LABEL = "新規"

export function ScreenNavSessionTag(props: ScreenNavSessionTagProps): ReactElement {
  const { tag } = props
  const [peeking, setPeeking] = useState(false)

  // `shellStyles["screen-nav-session-tag"]` は見た目を持たない（「≡」の面の中の見た目の打ち消し
  // `.screen-nav-panel .screen-nav-session-tag` のためだけの参照）。
  return (
    <span
      className={clsx(styles["screen-nav-session-tag"], shellStyles["screen-nav-session-tag"])}
      onFocus={() => setPeeking(true)}
      onBlur={() => setPeeking(false)}
    >
      <span className={styles["screen-nav-room"]}>{tag.room}</span>
      <span className={styles["screen-nav-session-tag-dash"]} aria-hidden="true">
        -
      </span>
      <button
        type="button"
        className={styles["screen-nav-session-tag-button"]}
        aria-haspopup="dialog"
        aria-expanded={tag.open}
        aria-label={accessibleName(tag.identity)}
        onPointerEnter={() => setPeeking(true)}
        onPointerLeave={() => setPeeking(false)}
        onClick={() => {
          tag.onOpen()
          props.onOpened()
        }}
      >
        <span className={styles["screen-nav-session-tag-id"]}>
          {tag.identity.kind === "known" ? tag.identity.shortId : NEW_SESSION_LABEL}
        </span>
      </button>
      {peeking && !tag.open && <SessionTagTooltip identity={tag.identity} />}
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

/** 読み上げの名前。部屋の名前は見える字で読めるので、名前には入れない（見本の `aria-label` と同じ）。 */
function accessibleName(identity: ScreenNavSessionIdentity): string {
  const session = identity.kind === "known" ? `セッション ${identity.shortId}` : UNKNOWN_SESSION
  return `${session}。押すとセッションを切り替える画面を開く`
}
