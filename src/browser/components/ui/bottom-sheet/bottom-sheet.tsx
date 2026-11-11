// 狭い画面（760px 以下）で下から上がる板。中身は Astryx の `BottomSheet` で、持つのは頭・中・下端の並べ方と、開閉の写しと、広い画面になったら閉じる動きだけ。
//
// 高さの上限から引く頭の高さは、置き方の外から `--phone-head-height` で受ける。

import { BottomSheet as AstryxBottomSheet } from "@astryxdesign/core/BottomSheet"
import type { ReactElement, ReactNode } from "react"

import { useCloseWhenWide } from "../../../hooks/use-close-when-wide.ts"
import styles from "./bottom-sheet.module.css"

/** 下端の口。無いときは下端ごと描かない。 */
type BottomSheetFooter =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly node: ReactNode }

export type BottomSheetProps = {
  readonly open: boolean
  /** 中身の指し先。替わると中の転がりを先頭へ戻す。 */
  readonly contentKey: string
  readonly ariaLabel: string
  readonly onClose: () => void
  readonly header: ReactNode
  readonly children: ReactNode
  readonly footer: BottomSheetFooter
}

const SHEET_HEIGHT = "min(600px, calc(100dvh - var(--phone-head-height, 0px)))"

export function BottomSheet(props: BottomSheetProps): ReactElement {
  useCloseWhenWide(props.open, props.onClose)

  return (
    <AstryxBottomSheet
      isOpen={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose()
        }
      }}
      label={props.ariaLabel}
      height={SHEET_HEIGHT}
    >
      {props.open && (
        <div className={styles["bottom-sheet-frame"]}>
          <div className={styles["bottom-sheet-head"]}>{props.header}</div>
          {/* `key` で作り直し、中の転がりを先頭へ戻す。 */}
          <div className={styles["bottom-sheet-body"]} key={props.contentKey}>
            {props.children}
          </div>
          {props.footer.kind === "shown" && (
            <div className={styles["bottom-sheet-foot"]}>{props.footer.node}</div>
          )}
        </div>
      )}
    </AstryxBottomSheet>
  )
}
