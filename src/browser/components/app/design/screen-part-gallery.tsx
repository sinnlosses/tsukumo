// 「画面の部品」の例を、部品のパスを見出しにして縦に並べる。

import type { ReactElement } from "react"

import { Heading } from "../../ui/heading/heading.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import styles from "./design.module.css"
import { SCREEN_PART_EXAMPLES } from "./screen-part-example.tsx"

export function ScreenPartGallery(): ReactElement {
  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="lg"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      {SCREEN_PART_EXAMPLES.map((example) => (
        <section key={example.path} data-screen-part={example.path}>
          <Heading
            level={3}
            size="subheading"
            tone="ink"
            weight="bold"
            className={styles["design-screen-path"]}
          >
            {example.path}
          </Heading>
          <div className={styles["design-screen-frame"]} data-frame={example.frame}>
            {example.render()}
          </div>
        </section>
      ))}
    </VStack>
  )
}
