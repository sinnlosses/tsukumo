// 会話の画面のメインビューの下に浮かぶ「いまの作業」の札（`CurrentWorkCapsule`）。
// 中身と一覧は帯の札と同じ部品なので、ここでは「いつ浮かぶか」と、帯とは別の形（回る輪の印）だけを測る。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CurrentWorkCapsule } from "../../../../../src/browser/components/domain/screen-nav/current-work-capsule.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { requestRecord, toolRecord } from "../../../../fixture/session-record.ts"
import { putSession } from "../../../session-store.ts"

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

    expect(document.querySelector(".screen-nav-work")).toBeNull()
  })

  it("作業中は札が浮かび、印は回る輪で、要約に実行中のツールが出る", () => {
    renderCapsule({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
      ],
    })

    const work = document.querySelector(".screen-nav-work")
    expect(work?.getAttribute("data-variant")).toBe("capsule")
    expect(work?.querySelector(".screen-nav-work-spinner")).not.toBeNull()
    expect(work?.querySelector(".screen-nav-work-mark")).toBeNull()
    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("作業中")
    expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe("Bash: echo dummy")
  })

  it("答え待ちは回る輪ではなく、帯と同じ印で浮かぶ", () => {
    renderCapsule({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {} }],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("答え待ち")
    expect(document.querySelector(".screen-nav-work-mark")?.textContent).toBe("●")
  })

  it("押すと依頼の手順の一覧が開く", () => {
    renderCapsule({ turn: { kind: "running", startedAt: 0 }, records: [requestRecord()] })

    fireEvent.click(screen.getByRole("button", { expanded: false }))

    expect(document.querySelector(".screen-nav-work-list")).not.toBeNull()
  })
})
