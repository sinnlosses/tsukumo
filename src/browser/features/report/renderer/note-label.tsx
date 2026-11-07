import type { ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import styles from "./report-notation.module.css"

/**
 * `note` の種別のラベル。文字として DOM に出すので、選択・コピー・読み上げのどれでも本文と同じに扱える。
 * `kindName` は記法の class 名（`note`・`note-warn` など）。
 */
export function NoteLabel(props: {
  readonly kindName: string
  readonly label: string
}): ReactElement {
  return (
    <Text
      element="span"
      size="label"
      tone="ink-quiet"
      weight="inherit"
      className={styles["report-note-label"]}
    >
      <span className={noteLabelColorClass(props.kindName)}>{props.label}</span>
    </Text>
  )
}

/** お願いを除く種別だけ、ラベルの字に種類の色と頭の記号を付ける。 */
function noteLabelColorClass(kindName: string): string | undefined {
  switch (kindName) {
    case "note":
      return styles["report-note-label-info"]
    case "note-warn":
      return styles["report-note-label-warn"]
    case "note-ng":
      return styles["report-note-label-ng"]
    case "note-ask":
      return styles["report-note-label-ask"]
    case "note-memo":
      return styles["report-note-label-memo"]
    default:
      return undefined
  }
}
