// 会話の流れの下端に浮く口。
// 最新を見ているあいだ、お伺いのカードが見える範囲の外にあるときの「お伺い ↓」と、上へ送って読んでいるときの「末尾へ」（新しい行の件数つき）を1つだけ出す。
// 押すとお伺いのカードまで送る口は、フォーカスを移さない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useInquiryJump } from "../../../../../stores/inquiry-jump.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { useInquiryAnswer } from "../../stores/inquiry-answer.ts"
import { useInquiryCardVisibility } from "../../stores/inquiry-card-visibility.ts"
import { streamFloatOf } from "./domain/head-notice.ts"
import type { TailReturnModel } from "./hooks/use-tail-return.ts"
import styles from "./main-view.module.css"

const INQUIRY_LABEL = "お伺い ↓"

const TAIL_LABEL = "末尾へ"

type StreamFloatProps = {
  readonly viewingPast: boolean
  /** 上へ送って読んでいるあいだの「末尾へ」。 */
  readonly tail: TailReturnModel
}

export function StreamFloat(props: StreamFloatProps): ReactElement | undefined {
  const phone = usePhoneWidth()
  const inquiry = useInquiryAnswer()
  const cardVisible = useInquiryCardVisibility((state) => state.visible)
  const requestJump = useInquiryJump((state) => state.requestJump)

  const float = streamFloatOf({
    viewingPast: props.viewingPast,
    inquiryOutOfSight: inquiry.kind !== "none" && !cardVisible,
    tail: props.tail.tail,
  })
  if (phone || float.kind === "none") {
    return undefined
  }

  if (float.kind === "tail") {
    return (
      <div className={styles["stream-float"]}>
        <div className={styles["stream-float-body"]}>
          <Button
            variant="outline"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["stream-float-button"]}
            onClick={props.tail.onReturn}
          >
            <span>{TAIL_LABEL}</span>
            {float.unseen > 0 && (
              <span className={styles["stream-float-count"]}>新しい行 {float.unseen}件</span>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles["stream-float"]}>
      <div className={clsx(styles["stream-float-body"], styles["is-warn"])}>
        <Button
          variant="outline-warn"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["stream-float-button"]}
          onClick={() => {
            requestJump({ focus: false })
          }}
        >
          {INQUIRY_LABEL}
        </Button>
      </div>
    </div>
  )
}
