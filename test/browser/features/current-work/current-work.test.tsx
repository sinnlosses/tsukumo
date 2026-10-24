import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useInquiryJump } from "../../../../src/browser/stores/inquiry-jump.ts"
import { readHashRoute } from "../../../../src/browser/stores/location-hash.ts"
import { useNavDrawer } from "../../../../src/browser/stores/nav-drawer.ts"
import type { StampedPendingAsk } from "../../../../src/shared/session-driver/pending-ask.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { renderScreenNav, workToggle } from "../../../fixture/current-work.tsx"
import { requestRecord, toolRecord, workPlanRecord } from "../../../fixture/session-record.ts"
import { stubPhoneWidth } from "../../phone-width.ts"
import { putState } from "../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  // 「お伺いへ」は会話の画面（`#`）へ hash を書き換える（`navigateTo`）ので、次のテストへ
  // 持ち越さない。
  window.location.hash = ""
  // 押した回数はモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryJump.setState(useInquiryJump.getInitialState(), true)
})

const FIXTURE_PENDING: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

const FIXTURE_QUESTION: StampedPendingAsk = {
  kind: "question",
  id: "ask-1",
  questions: [
    {
      header: "最初の見出し",
      text: "架空の質問",
      multiSelect: false,
      options: [],
    } satisfies Question,
  ],
  briefs: [],
  imageSizes: [],
  unshelvedImages: [],
  askedAt: 0,
}

describe("いまの作業（帯の札と、押すと開く依頼の手順の一覧）。語・要約・段の出し分けは hooks/use-current-work.test.ts", () => {
  it("札に語・印・要約が描かれ、雑談中の依頼待ちは data-chat-idle を持つ", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      pending: [FIXTURE_QUESTION],
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 1 }),
      ],
    })

    expect(document.querySelector(".current-work-word")?.textContent).toBe("答え待ち")
    expect(document.querySelector(".current-work-mark")?.textContent).toBe("●")
    expect(document.querySelector(".current-work-summary")?.textContent).toBe("最初の見出し")
    expect(document.querySelector(".current-work-phase")?.textContent).toBe("2/2 架空の段B")

    cleanup()
    renderScreenNav({ chatMode: true, character: characterInfo({ name: "架空の精霊" }) })

    expect(document.querySelector(".current-work")?.getAttribute("data-chat-idle")).toBe("true")
  })

  it.each([
    ["質問", FIXTURE_QUESTION],
    ["許可要求", FIXTURE_PENDING],
  ])("答え待ちが%sなら、一覧の見出しは「答え待ち」だけで、「お伺いへ」を出す", (_kind, pending) => {
    renderScreenNav({ pending: [pending] })

    fireEvent.click(workToggle())

    expect(document.querySelector(".current-work-heading")?.textContent).toBe("答え待ち")
    expect(screen.getByRole("button", { name: "お伺いへ" })).toBeDefined()
  })

  it("「お伺いへ」を押すと、一覧を閉じて会話の画面・最新のやり取りへ戻し、お伺いの札へのスクロールを合図する", () => {
    window.location.hash = "#character?turn=1"
    renderScreenNav({
      pending: [FIXTURE_PENDING],
      records: [1, 2, 3].map((turnId) => requestRecord({ turnId })),
    })

    fireEvent.click(workToggle())
    fireEvent.click(screen.getByRole("button", { name: "お伺いへ" }))

    expect(document.querySelector(".current-work-list")).toBeNull()
    expect(readHashRoute().screen).toBe("conversation")
    expect(readHashRoute().turn).toBe("newest")
    expect(useInquiryJump.getState().jump).toEqual({ signal: 1, focus: false })
  })

  it("答え終わると、質問の要約と「お伺いへ」が消えて元に戻る", () => {
    const running = { kind: "running", startedAt: 0 } satisfies SessionState["turn"]
    renderScreenNav({ turn: running, pending: [FIXTURE_QUESTION], records: [requestRecord()] })

    expect(document.querySelector(".current-work-summary")?.textContent).toBe("最初の見出し")

    act(() => {
      putState({ ...INITIAL_SESSION_STATE, turn: running, pending: [], records: [requestRecord()] })
    })

    expect(document.querySelector(".current-work-word")?.textContent).toBe("作業中")
    expect(document.querySelector(".current-work-summary")).toBeNull()

    fireEvent.click(workToggle())
    expect(screen.queryByRole("button", { name: "お伺いへ" })).toBeNull()
  })

  it("もう一度押す・外側を押す・Esc で閉じる（Esc はフォーカスを札へ戻す）", () => {
    renderScreenNav({ records: [requestRecord()] })
    const toggle = workToggle()

    fireEvent.click(toggle)
    expect(document.querySelector(".current-work-list")).not.toBeNull()

    fireEvent.click(toggle)
    expect(document.querySelector(".current-work-list")).toBeNull()

    fireEvent.click(toggle)
    fireEvent.pointerDown(document.body)
    expect(document.querySelector(".current-work-list")).toBeNull()

    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(document.querySelector(".current-work-list")).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })

  // 狭い画面では一覧を頭の「手順 n」が開き、引き出しには札を置かない（同じ一覧が2つ開いて重ならない）。
  // 会話の画面には帯の札が無いので、Esc の戻り先は頭の「手順 n」の1つだけ。
  it("会話の画面では頭の「手順 n」が一覧を開き、Esc でその口へフォーカスを戻す。引き出しには札が無い", () => {
    stubPhoneWidth(true)
    window.location.hash = "#conversation"
    renderScreenNav({ turn: { kind: "running", startedAt: 0 }, records: [requestRecord()] })
    const steps = screen.getByRole("button", { name: /^手順/u })

    fireEvent.click(screen.getByRole("button", { name: "やり取りとタスクを開く" }))
    const drawer = screen.getByRole("dialog", { name: "引き出し" })
    expect(drawer.querySelector(".current-work-toggle")).toBeNull()
    act(() => {
      useNavDrawer.getState().close()
    })

    fireEvent.click(steps)
    expect(document.querySelectorAll(".current-work-list")).toHaveLength(1)
    expect(document.querySelectorAll(".current-work-toggle")).toHaveLength(0)

    fireEvent.keyDown(document, { key: "Escape" })

    expect(document.querySelector(".current-work-list")).toBeNull()
    expect(document.activeElement).toBe(steps)
  })
})
