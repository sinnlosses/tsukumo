// 狭い画面（760px 以下）で下から上がる板。持つのは面の形（つまみ・頭・中・下端）と閉じ方（覆い・Esc・つまみを下へ払う）だけで、中身は差し込み口で受ける。
//
// 高さの上限から引く頭の高さは、置き方の外から `--phone-head-height` で受ける。

import type { ReactElement, ReactNode } from "react"

import { useCloseWhenWide } from "../../../hooks/use-close-when-wide.ts"
import { Dialog } from "../dialog/dialog.tsx"
import styles from "./bottom-sheet.module.css"
import { useSheetSwipe } from "./hooks/use-sheet-swipe.ts"

/** 下端の口。無いときは下端ごと描かない。 */
export type BottomSheetFooter =
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

export function BottomSheet(props: BottomSheetProps): ReactElement {
  const swipe = useSheetSwipe(props.onClose)
  useCloseWhenWide(props.open, props.onClose)

  return (
    <Dialog
      open={props.open}
      ariaLabel={props.ariaLabel}
      backdrop="sheet"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["bottom-sheet"]}
    >
      {props.open && (
        <div className={styles["bottom-sheet-frame"]}>
          <div
            className={styles["bottom-sheet-grip"]}
            data-bottom-sheet-grip=""
            onPointerDown={swipe.onPointerDown}
            onPointerMove={swipe.onPointerMove}
            onPointerUp={swipe.onPointerEnd}
            onPointerCancel={swipe.onPointerEnd}
          >
            <span className={styles["bottom-sheet-grip-bar"]} />
          </div>
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
    </Dialog>
  )
}
