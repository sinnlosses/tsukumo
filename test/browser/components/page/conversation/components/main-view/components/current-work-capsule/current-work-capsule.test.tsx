// 会話の画面のメインビューの下に浮かぶ「いまの作業」の札（`CurrentWorkCapsule`）。
// 中身と一覧は帯の札と同じ部品なので、ここでは「いつ浮かぶか」と、帯とは別の形（回る輪の印）だけを測る。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CurrentWorkCapsule } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/current-work-capsule/current-work-capsule.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { requestRecord, toolRecord } from "../../../../../../../../fixture/session-record.ts"
import { putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderCapsule(state: Partial<SessionState>): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state })
  render(<CurrentWorkCapsule />)
}

describe("CurrentWorkCapsule", () => {
  it("依頼待ちのあいだは札を描かない", () => {
    renderCapsule({ records: [requestRecord()] })

    expect(document.querySelector(".current-work")).toBeNull()
  })

  it("作業中は札が浮かび、印は回る輪になる", () => {
    renderCapsule({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
      ],
    })

    const work = document.querySelector(".current-work")
    expect(work?.getAttribute("data-variant")).toBe("capsule")
    expect(work?.querySelector(".current-work-spinner")).not.toBeNull()
    expect(work?.querySelector(".current-work-mark")).toBeNull()
  })

  it("答え待ちは回る輪ではなく、帯と同じ印で浮かぶ", () => {
    renderCapsule({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {} }],
    })

    expect(document.querySelector(".current-work-mark")?.textContent).toBe("●")
  })

  it("押すと依頼の手順の一覧が開く", () => {
    renderCapsule({ turn: { kind: "running", startedAt: 0 }, records: [requestRecord()] })

    fireEvent.click(screen.getByRole("button", { expanded: false }))

    expect(document.querySelector(".current-work-list")).not.toBeNull()
  })
})
