import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import type { StampedPendingAsk } from "../../../../../src/shared/session-driver/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { setPageUrl } from "../../../../dom-environment.ts"
import { characterInfo } from "../../../../fixture/character.ts"
import {
  finishedToolStatus,
  requestRecord,
  toolRecord,
  workPlanRecord,
} from "../../../../fixture/session-record.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

// 狭い画面の頭（広い画面では CSS が消す。ここでは DOM の出し分けだけを見る）。

const PENDING: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

const PHASES = ["架空の段A", "架空の段B", "架空の段C", "架空の段D", "架空の段E"]

afterEach(() => {
  cleanup()
  setPageUrl("http://127.0.0.1/")
  window.location.hash = ""
})

function renderHead(state: Partial<SessionState> = {}): HTMLElement {
  putSession({
    ...INITIAL_SESSION_STATE,
    character: characterInfo({ face: "/character/face.png" }),
    ...state,
  })
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
  return typedElement(document.querySelector(".phone-head"), HTMLElement, "頭")
}

function word(): string | null | undefined {
  return document.querySelector(".phone-head-word")?.textContent
}

function title(): string | null | undefined {
  return document.querySelector(".phone-head-title")?.textContent
}

function stepsToggle(head: HTMLElement): HTMLElement {
  return within(head).getByRole("button", { name: /^手順/u })
}

describe("PhoneHead", () => {
  it("作業中は回る輪と「作業中」・経過・今の段の題を出し、2行目に段の点と n/N と「手順 n」を出す", () => {
    const head = renderHead({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord({ text: "架空の依頼" }),
        workPlanRecord({ phases: PHASES, current: 2 }),
        toolRecord({ toolUseId: "toolu_a", status: finishedToolStatus() }),
        toolRecord({ toolUseId: "toolu_b" }),
      ],
    })

    expect(head.querySelector(".phone-head-spinner")).not.toBeNull()
    expect(word()).toBe("作業中")
    expect(head.querySelector(".phone-head-elapsed")?.textContent).toMatch(/^\d+(:\d{2}){1,2}$/u)
    expect(title()).toBe("架空の段C")
    expect(head.querySelector(".phone-head-face")?.getAttribute("src")).toBe("/character/face.png")
    const dots = [...head.querySelectorAll(".phone-head-dot")]
    expect(dots.map((dot) => dot.className.includes("is-done"))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
    expect(dots.map((dot) => dot.className.includes("is-current"))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ])
    expect(head.querySelector(".phone-head-position")?.textContent).toBe("3/5")
    expect(stepsToggle(head).textContent).toBe("手順 2")
  })

  it("段を全部終えていれば題は「n段すべて済み」、位置は「N/N」", () => {
    const head = renderHead({
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord(), workPlanRecord({ phases: PHASES, current: 5 })],
    })

    expect(title()).toBe("5段すべて済み")
    expect(head.querySelector(".phone-head-position")?.textContent).toBe("5/5")
  })

  it("段取りの無いターンは2行目に「手順 n」だけを出し、題は依頼の1行目", () => {
    const head = renderHead({
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord({ text: "\n架空の依頼の1行目\n2行目" }), toolRecord()],
    })

    expect(head.querySelector(".phone-head-dots")).toBeNull()
    expect(stepsToggle(head).textContent).toBe("手順 1")
    expect(title()).toBe("架空の依頼の1行目")
  })

  it("依頼待ちは「依頼待ち」で2行目を出さず、題は直前の依頼の1行目（無ければ部屋の名前）", () => {
    const head = renderHead({
      records: [requestRecord({ text: "前の架空の依頼" }), workPlanRecord()],
    })

    expect(word()).toBe("依頼待ち")
    expect(head.querySelector(".phone-head-spinner")).toBeNull()
    expect(head.querySelector(".phone-head-elapsed")).toBeNull()
    expect(within(head).queryByRole("button", { name: /^手順/u })).toBeNull()
    expect(title()).toBe("前の架空の依頼")
  })

  it("依頼が一度も無ければ題は部屋の名前", () => {
    setPageUrl("http://127.0.0.1:7329/")
    renderHead()

    expect(title()).toBe("菜の花の間")
  })

  it("答え待ちは語が「答え待ち」になり、頭は隠さない", () => {
    renderHead({
      turn: { kind: "running", startedAt: 0 },
      pending: [PENDING],
      records: [requestRecord(), workPlanRecord({ phases: PHASES, current: 1 })],
    })

    expect(word()).toBe("答え待ち")
    expect(title()).toBe("架空の段B")
  })

  it("背景で作業中は「背景で作業中」", () => {
    renderHead({
      turn: { kind: "finished", startedAt: 0, finishedAt: 0, ending: { kind: "ended" } },
      backgroundTasks: [{ taskId: "bg-1", kind: "shell", description: "架空の背景" }],
      records: [requestRecord()],
    })

    expect(word()).toBe("背景で作業中")
  })

  it("雑談中の依頼待ちは題が「雑談」で、2行目を出さない", () => {
    const head = renderHead({
      chatMode: true,
      character: characterInfo({ name: "架空の精霊" }),
      records: [requestRecord()],
    })

    expect(word()).toBe("架空の精霊 とおしゃべり中")
    expect(title()).toBe("雑談")
    expect(within(head).queryByRole("button", { name: /^手順/u })).toBeNull()
  })

  it("「手順 n」を押すと依頼の手順の一覧が開き、失敗した手順も読める", () => {
    const head = renderHead({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_failed",
          input: { command: "架空の失敗するコマンド" },
          status: finishedToolStatus({
            result: { kind: "failed", output: { head: "架空のエラー出力", omittedLength: 0 } },
          }),
        }),
      ],
    })
    const toggle = stepsToggle(head)

    fireEvent.click(toggle)

    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const list = typedElement(head.querySelector(".current-work-list"), HTMLElement, "一覧")
    expect(list.querySelector("[data-step-failed]")?.textContent).toContain(
      "架空の失敗するコマンド",
    )
    expect(list.textContent).toContain("架空のエラー出力")
  })

  it("会話の画面でないときは「‹ 会話へ」と画面の名前を出し、答え待ちでなければ状態の語も2行目も出さない", () => {
    window.location.hash = "#token-usage"
    const head = renderHead({
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord(), workPlanRecord()],
    })

    expect(within(head).getByRole("link", { name: "‹ 会話へ" })).toBeDefined()
    expect(title()).toBe("トークン")
    expect(word()).toBeUndefined()
    expect(within(head).queryByRole("button", { name: /^手順/u })).toBeNull()
  })

  it("会話の画面でなくても、答え待ちが来たら状態の語が頭に出る", () => {
    window.location.hash = "#character"
    renderHead({ turn: { kind: "running", startedAt: 0 }, pending: [PENDING] })

    expect(word()).toBe("答え待ち")
    expect(screen.queryByRole("link", { name: "‹ 会話へ" })).not.toBeNull()
  })
})
