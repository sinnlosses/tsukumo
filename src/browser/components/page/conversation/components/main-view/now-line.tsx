// 流れの末尾の「いまの行」。回る印・「いま」・走っている手順の文を1行で出す。

import clsx from "clsx"
import type { ReactNode } from "react"

import { Spinner } from "../../../../ui/spinner/spinner.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { useNowLine } from "./hooks/use-now-line.ts"
import styles from "./main-view.module.css"

export function NowLine(props: { readonly viewingPast: boolean }): ReactNode {
  const nowLine = useNowLine(props.viewingPast)
  if (nowLine.kind === "none") {
    return <></>
  }
  const { activity } = nowLine
  return (
    <p className={clsx(styles["now-line"], activity.mono && styles["is-mono"])} data-now-line="">
      <Spinner className={styles["now-line-mark"]} />
      <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
        いま
      </Text>
      <Text
        element="span"
        size="secondary"
        tone="ink-quiet"
        weight="inherit"
        className={styles["now-line-text"]}
      >
        {activity.text}
      </Text>
      {activity.retry.kind === "retrying" && (
        <Text
          element="span"
          size="secondary"
          tone="state-warn"
          weight="inherit"
          className={styles["now-line-retry"]}
        >
          <span title={activity.retry.detail}>{activity.retry.label}</span>
        </Text>
      )}
    </p>
  )
}
