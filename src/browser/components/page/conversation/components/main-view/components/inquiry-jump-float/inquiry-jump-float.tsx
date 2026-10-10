// 札が窓の外にあるあいだ、メインビューの下端に浮かぶ「お伺い ↓」の口。
// 押すとお伺いの札まで送る（フォーカスは移さない）。

import type { ReactElement } from "react"

import { usePhoneWidth } from "../../../../../../../hooks/use-phone-width.ts"
import { useInquiryAnswer } from "../../../../../../../stores/inquiry-answer.ts"
import { useInquiryCardVisibility } from "../../../../../../../stores/inquiry-card-visibility.ts"
import { useInquiryJump } from "../../../../../../../stores/inquiry-jump.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import styles from "./inquiry-jump-float.module.css"

const FLOAT_LABEL = "お伺い ↓"

export function InquiryJumpFloat(): ReactElement | null {
  const phone = usePhoneWidth()
  const inquiry = useInquiryAnswer()
  const visible = useInquiryCardVisibility((state) => state.visible)
  const requestJump = useInquiryJump((state) => state.requestJump)

  if (phone || inquiry.kind === "none" || visible) {
    return null
  }

  return (
    <div className={styles["inquiry-float"]}>
      <div className={styles["inquiry-float-body"]}>
        <Button
          variant="outline-warn"
          size="label"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["inquiry-float-button"]}
          onClick={() => {
            requestJump({ focus: false })
          }}
        >
          {FLOAT_LABEL}
        </Button>
      </div>
    </div>
  )
}
