// 流れの末尾の「いまの行」。回る印・対象・つなぎと動詞・経過・添え書きを1枚の小さな札で出す。

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
    <p
      className={clsx(styles["now-line"], activity.mono && styles["is-mono"])}
      data-now-line=""
      title={activity.retryDetail === "" ? undefined : activity.retryDetail}
    >
      <Spinner className={styles["now-line-mark"]} />
      {activity.lead !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["now-line-lead"]}
        >
          {activity.lead}
        </Text>
      )}
      {activity.target !== "" && (
        <span className={styles["now-line-subject"]}>
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["now-line-target"]}
          >
            {activity.target}
          </Text>
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["now-line-particle"]}
          >
            {activity.particle}
          </Text>
        </span>
      )}
      <Text
        element="span"
        size="secondary"
        tone="ink"
        weight="semibold"
        className={styles["now-line-verb"]}
      >
        {activity.verb}
      </Text>
      {activity.elapsed !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["now-line-elapsed"]}
        >
          {activity.elapsed}
        </Text>
      )}
      {activity.aside !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["now-line-aside"]}
        >
          {activity.aside}
        </Text>
      )}
    </p>
  )
}
