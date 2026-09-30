// 札の頭のタイトルの下に出す、依頼の続き。
// 2行まで出し、3行目からは「ほか n 行」で開く（開いたら続きがすべて出て、戻す口は無い）。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "./request-continuation.module.css"

const FOLDED_LINE_COUNT = 2

export function RequestContinuation(props: { readonly lines: readonly string[] }): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? props.lines : props.lines.slice(0, FOLDED_LINE_COUNT)
  const hiddenCount = props.lines.length - shown.length

  return (
    <Text
      element="p"
      size="secondary"
      tone="ink-quiet"
      weight="inherit"
      className={styles["request-continuation"]}
    >
      {shown.map((line, index) => (
        <span key={index}>
          {index > 0 && <br />}
          {line}
        </span>
      ))}
      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="text-accent"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "expander", expanded }}
          title={undefined}
          className={styles["request-more"]}
          onClick={() => {
            setExpanded(true)
          }}
        >
          ほか {String(hiddenCount)} 行
          <span className={styles["request-more-chevron"]} aria-hidden="true" />
        </Button>
      )}
    </Text>
  )
}
