import type { ReactElement } from "react"

import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import styles from "../../token-usage.module.css"

type TableCardHeadProps = {
  readonly title: string
  readonly order: string
}

/** 表を持つ札の見出し（見出しの横に並べ順を小さく添える）。 */
export function TableCardHead(props: TableCardHeadProps): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="sm"
      align="baseline"
      justify="start"
      wrap="nowrap"
      className={styles["usage-table-head"]}
    >
      <h3 className={styles["usage-table-title"]}>{props.title}</h3>
      <span className={styles["usage-table-order"]}>{props.order}</span>
    </HStack>
  )
}
