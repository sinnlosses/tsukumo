// 会話の画面のメインビューの下に浮かぶ「いまの作業」の札（`CurrentWorkCapsule`）。
// 中身と一覧は帯の札と同じ部品なので、ここでは札が自分で持つ開閉だけを測る。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CurrentWorkCapsule } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/current-work-capsule/current-work-capsule.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
import { requestRecord } from "../../../../../../../../fixture/session-record.ts"
import { putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

describe("CurrentWorkCapsule", () => {
  it("押すと依頼の手順の一覧が開く", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord()],
    })
    render(<CurrentWorkCapsule />)

    fireEvent.click(screen.getByRole("button", { expanded: false }))

    expect(document.querySelector(".current-work-list")).not.toBeNull()
  })
})
