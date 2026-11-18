import { act, cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER } from "../../../../../../fixture/character-view.tsx"
import { renderMainView } from "../../../../../../fixture/main-view.tsx"
import {
  reactionRecord,
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { stubPhoneWidth } from "../../../../../phone-width.ts"
import { putState } from "../../../../../session-store.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

const WELCOME_BACK = "架空のおかえり"

function resumedRecords(): readonly SessionRecord[] {
  const report = reportRecord()
  if (report.kind !== "report") {
    throw new Error("report の記録ではない")
  }
  return [
    requestRecord({ time: { kind: "restored" } }),
    {
      ...report,
      waitingLine: { kind: "speech", text: WELCOME_BACK, expression: "default" },
    },
    reactionRecord({ reaction: "welcome", text: WELCOME_BACK }),
  ]
}

function renderResumed(): void {
  renderMainView(resumedRecords())
  act(() => {
    putState({ ...INITIAL_SESSION_STATE, records: resumedRecords(), character: FIXTURE_CHARACTER })
  })
}

function textCount(text: string): number {
  return (document.body.textContent.match(new RegExp(text, "gu")) ?? []).length
}

describe("MainView（声の定位置）", () => {
  it("続きから起こした直後のおかえりは、入力欄の上の定位置にだけ出て、流れの行には出ない", () => {
    renderResumed()
    const slot = document.querySelector("[data-voice-slot]")
    expect(slot?.textContent).toContain(WELCOME_BACK)
    expect(textCount(WELCOME_BACK)).toBe(1)
  })

  describe("迎える場面", () => {
    function renderWelcome(welcomeGreeting: SessionState["welcomeGreeting"]): void {
      renderMainView([])
      act(() => {
        putState({ ...INITIAL_SESSION_STATE, character: FIXTURE_CHARACTER, welcomeGreeting })
      })
    }
    const greeting = {
      withCard: "架空の挨拶 {札}",
      withoutCard: "架空の挨拶",
      expression: "default",
    } as const

    it("書けた挨拶を定位置に1件出す", () => {
      renderWelcome({ kind: "written", greeting })
      expect(document.querySelector("[data-voice-slot]")?.textContent).toContain("架空の挨拶")
      expect(textCount("架空の挨拶")).toBe(1)
    })

    it("書いている途中は「…」を出し、書けなかったときは空にする", () => {
      renderWelcome({ kind: "writing" })
      expect(document.querySelector("[data-voice-slot] [data-speaker='typing']")).not.toBeNull()
      cleanup()
      renderWelcome({ kind: "unwritten" })
      expect(bandChildCount()).toBe(0)
    })

    it("狭い画面は定位置を出さない", () => {
      stubPhoneWidth(true)
      renderWelcome({ kind: "written", greeting })
      expect(bandChildCount()).toBe(0)
    })
  })

  it("狭い画面は定位置を出さない", () => {
    stubPhoneWidth(true)
    renderResumed()
    expect(bandChildCount()).toBe(0)
  })

  it("作業中のやり取りは直近のセリフ1件だけを定位置に出し、それより前のセリフは流れに残す", () => {
    renderMainView(
      [
        requestRecord({ turnId: 0 }),
        speechRecord({ text: "架空の着手の一言" }),
        speechRecord({ text: "架空の直近の一言" }),
      ],
      { kind: "running", startedAt: 0 },
    )
    const slot = document.querySelector("[data-voice-slot]")
    expect(slot?.textContent).toContain("架空の直近の一言")
    expect(slot?.textContent).not.toContain("架空の着手の一言")
    expect(textCount("架空の直近の一言")).toBe(1)
    expect(textCount("架空の着手の一言")).toBe(1)
  })
})

function bandChildCount(): number {
  return document.querySelector("[data-voice-slot]")?.childElementCount ?? 0
}
