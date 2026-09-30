// 段の知らせ。段取りの今の段が移ったところに、入った段の見出しを字だけで1行置く（線・枠・地は持たない）。

import type { ReactElement } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "./phase-notice.module.css"

export type PhaseNoticeProps = {
  /** 入った段の見出し（「2/4 段の名前」）。 */
  readonly label: string
}

export function PhaseNotice(props: PhaseNoticeProps): ReactElement {
  return (
    <Text
      element="p"
      size="label"
      tone="ink-quiet"
      weight="inherit"
      className={styles["phase-notice"]}
    >
      ここから {props.label}
    </Text>
  )
}
