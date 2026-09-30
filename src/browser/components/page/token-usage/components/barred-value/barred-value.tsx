import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import styles from "../../token-usage.module.css"

type BarredValueProps = {
  /** 書き終えた数（表示する文字列そのもの）。 */
  readonly formatted: string
  /** 棒の幅（その列の最大に対する割合の字）。 */
  readonly share: string
}

/**
 * 数の右に、その列の最大に対する割合の横棒を添える（並べ順を決めている列だけに使う）。
 * 塗りは量の棒の青（`--usage-bar`）で、分類の色ではない。
 */
export function BarredValue(props: BarredValueProps): ReactElement {
  return (
    <span className={styles["usage-table-bar-cell"]}>
      <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
        {props.formatted}
      </Text>
      <span className={styles["usage-table-bar"]}>
        <span
          className={styles["usage-table-bar-fill"]}
          style={{ "--usage-bar-share": props.share }}
        />
      </span>
    </span>
  )
}
