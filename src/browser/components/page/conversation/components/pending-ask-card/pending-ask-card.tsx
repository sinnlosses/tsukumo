// 答え待ちの許可要求と質問を、入力欄のすぐ上に固定して出す札。狭い画面（760px 以下）だけに出す。

import { useState, type ReactElement } from "react"

import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useInquiryAnswer } from "../../../../../stores/inquiry-answer.ts"
import { pendingAskChips } from "./domain/pending-ask-chips.ts"
import {
  PresentationalPendingAskCard,
  type PendingAskSheet,
} from "./presentational-pending-ask-card.tsx"

const CLOSED_SHEET = { kind: "closed" } satisfies PendingAskSheet

export function PendingAskCard(): ReactElement | null {
  const inquiry = useInquiryAnswer()
  const phone = usePhoneWidth()
  const [sheet, setSheet] = useState<PendingAskSheet>(CLOSED_SHEET)

  if (inquiry.kind === "none" || !phone) {
    return null
  }
  const shown = sheet.kind !== "closed" && sheet.askId === inquiry.id ? sheet : CLOSED_SHEET
  return (
    <PresentationalPendingAskCard
      inquiry={inquiry}
      chips={pendingAskChips(inquiry)}
      sheet={shown}
      onOpenSheet={(kind) => {
        setSheet({ kind, askId: inquiry.id })
      }}
      onCloseSheet={() => {
        setSheet(CLOSED_SHEET)
      }}
    />
  )
}
