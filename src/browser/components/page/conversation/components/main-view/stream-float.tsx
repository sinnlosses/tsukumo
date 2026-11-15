// 会話の流れの下端に浮かぶ口。
// 「いま見ている所の外で何かが起きた」を1つだけ知らせ、押すとそこへ移る。
// 過去のやり取りを見ているあいだは知らせの行（作業中・失敗・お伺いの届き）、最新を見ているあいだはお伺いのカードが見える範囲の外にあるときの「お伺い ↓」。
// 押すとお伺いのカードまで送る口は、フォーカスを移さない。

import type { ReactElement } from "react"

import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useInquiryJump } from "../../../../../stores/inquiry-jump.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { useInquiryAnswer } from "../../stores/inquiry-answer.ts"
import { useInquiryCardVisibility } from "../../stores/inquiry-card-visibility.ts"
import { streamFloatOf, type HeadNotice, type HeadNoticeAction } from "./domain/head-notice.ts"
import styles from "./main-view.module.css"

const INQUIRY_LABEL = "お伺い ↓"
const NOTICE_ARROW = "→"

type StreamFloatProps = {
  readonly notice: HeadNotice
  readonly viewingPast: boolean
  readonly onNotice: (action: HeadNoticeAction) => void
}

export function StreamFloat(props: StreamFloatProps): ReactElement | undefined {
  const phone = usePhoneWidth()
  const inquiry = useInquiryAnswer()
  const cardVisible = useInquiryCardVisibility((state) => state.visible)
  const requestJump = useInquiryJump((state) => state.requestJump)

  const float = streamFloatOf({
    notice: props.notice,
    viewingPast: props.viewingPast,
    inquiryOutOfSight: inquiry.kind !== "none" && !cardVisible,
  })
  if (phone || float.kind === "none") {
    return undefined
  }

  return (
    <div className={styles["stream-float"]}>
      <div className={styles["stream-float-body"]}>
        <Button
          variant="outline-warn"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          title={float.kind === "notice" ? float.text : undefined}
          className={styles["stream-float-button"]}
          onClick={() => {
            if (float.kind === "notice") {
              props.onNotice(float.action)
            } else {
              requestJump({ focus: false })
            }
          }}
        >
          {float.kind === "notice" ? (
            <>
              <span className={styles["stream-float-text"]}>{float.text}</span>
              <span aria-hidden="true">{NOTICE_ARROW}</span>
            </>
          ) : (
            INQUIRY_LABEL
          )}
        </Button>
      </div>
    </div>
  )
}
