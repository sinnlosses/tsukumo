// 内容部品の外枠に「聞く」を足す。口が渡され、節の中の内容部品のときだけ包んで右上にボタンを出す。
// それ以外は子をそのまま返す（包みの要素を足さない）。
// 開いている入力欄は部品の中で1つ。部品全体の欄と表の行の欄は、同じ状態を取り合う。

import { createContext, type ReactElement, type ReactNode, use, useState } from "react"

import type { ReplyTarget } from "../../../../shared/session/reply-target.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { replyTargetOf } from "../domain/reply-target.ts"
import { LeafIdentityContext, SectionPointContext } from "../leaf-point-context.ts"
import { ReplyPortContext } from "../reply-port.ts"
import { AskBox } from "./ask-box.tsx"
import styles from "./leaf.module.css"

/** 表が行ごとに「聞く」を出すための口。`none` の表は行のボタンを出さない。 */
export type RowAsk =
  | { readonly kind: "none" }
  | {
      readonly kind: "available"
      /** 元の行の添字と1列目の字で、その行の下に欄を開く。 */
      readonly openRow: (index: number, firstCell: string) => void
      /** その行について欄が開いているか（欄は表の下に出し、行には印を付ける）。 */
      readonly isOpen: (index: number) => boolean
    }

export const RowAskContext = createContext<RowAsk>({ kind: "none" })

type OpenAsk =
  | { readonly kind: "closed" }
  | { readonly kind: "leaf" }
  | { readonly kind: "row"; readonly index: number; readonly firstCell: string }

export function AskFrame(props: {
  readonly title: string
  readonly children: ReactNode
}): ReactElement {
  const slot = use(ReplyPortContext)
  const section = use(SectionPointContext)
  const leaf = use(LeafIdentityContext)
  const [open, setOpen] = useState<OpenAsk>({ kind: "closed" })
  if (slot.kind === "none" || section.kind === "none" || leaf.kind === "none") {
    return <>{props.children}</>
  }
  const targetOf = (row?: { readonly index: number; readonly firstCell: string }): ReplyTarget =>
    replyTargetOf({
      reportToolUseId: section.reportToolUseId,
      componentId: leaf.componentId,
      section: section.heading,
      title: props.title,
      componentKind: leaf.componentKind,
      row,
    })
  const close = () => {
    setOpen({ kind: "closed" })
  }
  const boxOf = (target: ReplyTarget): ReactElement => (
    <AskBox
      target={target}
      onSend={(text) => {
        slot.port.ask(target, text)
      }}
      onClose={close}
    />
  )
  const rowAsk: RowAsk = {
    kind: "available",
    openRow: (index, firstCell) => {
      setOpen({ kind: "row", index, firstCell })
    },
    isOpen: (index) => open.kind === "row" && open.index === index,
  }
  return (
    <RowAskContext value={rowAsk}>
      <div className={styles["ask-frame"]}>
        {props.children}
        {open.kind !== "leaf" && (
          <span className={styles["ask-button-slot"]}>
            <Button
              variant="outline"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["ask-button"]}
              onClick={() => {
                setOpen({ kind: "leaf" })
              }}
            >
              聞く
            </Button>
          </span>
        )}
        {open.kind === "leaf" && boxOf(targetOf())}
        {open.kind === "row" && boxOf(targetOf({ index: open.index, firstCell: open.firstCell }))}
      </div>
    </RowAskContext>
  )
}
