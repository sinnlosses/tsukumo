// 見本帳の `ui/` の節の1まとまり。並べた `ui/` のディレクトリ名を `data-ui-part` に空白区切りで持つ。

import type { ReactElement, ReactNode } from "react"

import { Heading } from "../../ui/heading/heading.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import styles from "./design.module.css"

export function Group(props: {
  readonly title: string
  readonly parts: readonly string[]
  readonly children: ReactNode
}): ReactElement {
  return (
    <section data-ui-part={props.parts.join(" ")}>
      <VStack
        element="div"
        name={{ kind: "label", label: props.title }}
        gap="sm"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <Heading level={3} size="subheading" tone="ink" weight="bold" className="">
          {props.title}
        </Heading>
        <div className={styles["design-row"]}>{props.children}</div>
      </VStack>
    </section>
  )
}
