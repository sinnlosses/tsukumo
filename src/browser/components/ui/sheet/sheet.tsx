// 右から重ねる紙の部品。中身は Astryx の `Drawer` を覆いなし（`hasScrim={false}`）で開いた形で、紙の下は操作できるまま残る。
// 持つのは見出し・閉じる（Esc）・本文の並べ方と開閉の写しだけ。紙の下の何を操作できなくするかと、覆いは呼び出し側が決める。
//
// Esc で `onClose` を呼び、閉じたらフォーカスを開いた入口へ戻す。

import { Drawer } from "@astryxdesign/core/Drawer"
import { Kbd } from "@astryxdesign/core/Kbd"
import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { Button } from "../button/button.tsx"
import { Heading } from "../heading/heading.tsx"
import { Text } from "../text/text.tsx"
import styles from "./sheet.module.css"

export type SheetSub = { readonly kind: "none" } | { readonly kind: "shown"; readonly text: string }

export type SheetProps = {
  readonly open: boolean
  readonly title: string
  /** 見出しの横の補い。 */
  readonly sub: SheetSub
  /** 本文を余白なしで全面に敷く（本文が自分で余白を持つ紙）。 */
  readonly flush: boolean
  readonly onClose: () => void
  readonly children: ReactNode
}

export function Sheet(props: SheetProps): ReactElement {
  return (
    <Drawer
      isOpen={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose()
        }
      }}
      side="end"
      width="min(calc(100% - 64px), 1000px)"
      hasScrim={false}
      padding={0}
      label={props.title}
      className={styles["sheet"]}
    >
      {props.open && (
        <div className={styles["sheet-frame"]}>
          <div className={styles["sheet-head"]}>
            <div className={styles["sheet-title"]}>
              <Heading level={1} size="heading" tone="ink" weight="bold" className="">
                {props.title}
              </Heading>
              {props.sub.kind === "shown" && (
                <Text element="span" size="secondary" tone="ink-quiet" weight="normal" className="">
                  {props.sub.text}
                </Text>
              )}
            </div>
            <Button
              variant="outline"
              size="action"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["sheet-close"]}
              onClick={props.onClose}
            >
              閉じる <Kbd keys="escape" />
            </Button>
          </div>
          <div className={clsx(styles["sheet-body"], props.flush && styles["sheet-body-flush"])}>
            {props.children}
          </div>
        </div>
      )}
    </Drawer>
  )
}
