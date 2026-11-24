// 問い・説明の1行・キャンセルと実行のボタンを持つ確認の部品。`showModal()` は top layer に積むので、下のモーダルより必ず上に出る。
// `confirm` を渡さなければ実行のボタンを出さない（送れない理由だけを見せるとき）。

import type { ReactElement, ReactNode } from "react"

import { Button } from "../button/button.tsx"
import { Dialog } from "../dialog/dialog.tsx"
import { Surface } from "../surface/surface.tsx"
import { Text } from "../text/text.tsx"
import styles from "./confirm-dialog.module.css"

export type ConfirmDialogAction = {
  readonly label: string
  readonly icon?: ReactNode
  readonly onPress: () => void
}

type ConfirmDialogProps = {
  readonly ariaLabel: string
  readonly heading: string
  readonly note: ReactNode
  readonly cancelLabel: string
  readonly confirm?: ConfirmDialogAction
  readonly onClose: () => void
}

export function ConfirmDialog(props: ConfirmDialogProps): ReactElement {
  const { confirm } = props
  return (
    <Dialog
      open={true}
      ariaLabel={props.ariaLabel}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["confirm-dialog"]}
    >
      <Surface
        element="div"
        tone="surface"
        space="none"
        radius="lg"
        shadow="none"
        className={styles["surface"]}
      >
        <div className={styles["head"]}>
          <Text element="p" size="heading" tone="inherit" weight="semibold" className="">
            {props.heading}
          </Text>
          <Text element="p" size="inherit" tone="ink-quiet" weight="inherit" className="">
            {props.note}
          </Text>
        </div>
        <div className={styles["actions"]}>
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["action"]}
            onClick={props.onClose}
          >
            {props.cancelLabel}
          </Button>
          {confirm !== undefined && (
            <Button
              variant="solid-accent"
              size="secondary"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["action"]}
              onClick={confirm.onPress}
            >
              {confirm.icon}
              {confirm.label}
            </Button>
          )}
        </div>
      </Surface>
    </Dialog>
  )
}

/** 説明の1行の中で、実行される文面を等幅で見せる。改行を含む文面は改行のまま見せる。 */
export function ConfirmDialogCode(props: { readonly children: string }): ReactElement {
  return <code className={styles["code"]}>{props.children}</code>
}
