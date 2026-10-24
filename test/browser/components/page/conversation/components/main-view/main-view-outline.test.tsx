import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { useInquiryDraft } from "../../../../../../../src/browser/stores/inquiry-draft.ts"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import {
  chooseOutlineOpen,
  OUTLINE_PANEL_STORAGE_KEY,
  press,
  renderMainView,
  stepTurn,
  threeTurns,
  title,
} from "../../../../../../fixture/main-view.tsx"
import { detailRecord, requestRecord } from "../../../../../../fixture/session-record.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  // 過去のターンを選ぶと hash に乗る（`useTurnSelection`）ので、次のテストへ持ち越さない。
  window.location.hash = ""
})

/** やり取りの列のやり取りの行（古い順）。 */
function outlineTurnRows(): readonly HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("[data-outline-turn]")]
}

/** やり取りの列の行（やり取りの行と見出しの行）の字。やり取りの行は印 + 1行目。 */
function outlineRowTexts(): readonly string[] {
  const nav = screen.getByRole("navigation", { name: "やり取り" })
  return [...nav.querySelectorAll("button")]
    .filter((row) => row.getAttribute("aria-label") !== "やり取りを畳む")
    .map((row) => row.textContent)
}

describe("MainView（やり取りの列: やり取りと見出しの2段）", () => {
  /** 3件目のレポートだけが見出しを2つ持つ。 */
  function threeTurnsWithHeadings(): readonly SessionRecord[] {
    return [
      requestRecord({ text: "1つ目\n2行目は列に出さない", turnId: 0 }),
      detailRecord("1つ目のレポート"),
      requestRecord({ text: "2つ目", turnId: 1 }),
      detailRecord("2つ目のレポート"),
      requestRecord({ text: "3つ目", turnId: 2 }),
      detailRecord("## 節の一\n\n本文の一\n\n### 小節\n\n本文の二\n\n## 節の二\n\n本文の三"),
    ]
  }

  const RUNNING_TURN = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]

  afterEach(() => {
    localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
  })

  it("上の段にやり取りが古い順に印と依頼の1行目で並び、見ているやり取りだけが ● でその見出しを子に持つ", () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())

    expect(outlineRowTexts()).toEqual([
      "✓1つ目",
      "✓2つ目",
      "●3つ目",
      "最終節の一",
      "節の一",
      "小節",
      "節の二",
    ])
    expect(outlineTurnRows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "true",
    ])
    expect(outlineTurnRows()[0]?.getAttribute("aria-label")).toBe("完了: 1つ目")
  })

  it("働いている最中のいちばん新しいやり取りは「…」の印になる", () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings(), RUNNING_TURN)

    stepTurn("[")

    expect(outlineTurnRows()[2]?.getAttribute("aria-label")).toBe("作業中: 3つ目")
    expect(outlineTurnRows()[2]?.textContent).toBe("…3つ目")
  })

  it("やり取りの行を押すとそのやり取りへ移り、見出しの子はそのやり取りのものに替わる", async () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())

    press("完了: 1つ目")

    expect(title()).toBe("1つ目")
    // 見出しは描いた本文の DOM の変化（`MutationObserver`）で拾い直すので、次のタスクで替わる。
    await waitFor(() => {
      expect(outlineRowTexts()).toEqual(["●1つ目", "最終1つ目のレポート", "✓2つ目", "✓3つ目"])
    })
  })

  // Enter で押せることは行が `<button>` であることで確かめる（happy-dom は Enter を click に変えない）。
  it("↑↓ でやり取りの行と見出しの行を区別なく移り、やり取りの行（Enter で押せる button）でそのやり取りへ移る", async () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())
    const nav = screen.getByRole("navigation", { name: "やり取り" })
    const [first, second] = outlineTurnRows()
    if (first === undefined || second === undefined) {
      throw new Error("やり取りの行が見つからない")
    }

    act(() => {
      second.focus()
    })
    fireEvent.keyDown(nav, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("●3つ目")
    fireEvent.keyDown(nav, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("最終節の一")
    fireEvent.keyDown(nav, { key: "ArrowUp" })
    fireEvent.keyDown(nav, { key: "ArrowUp" })
    fireEvent.keyDown(nav, { key: "ArrowUp" })
    expect(document.activeElement).toBe(first)
    expect(first.tagName).toBe("BUTTON")

    act(() => {
      fireEvent.click(first)
      window.dispatchEvent(new Event("hashchange"))
    })
    expect(title()).toBe("1つ目")
    await waitFor(() => {
      expect(outlineRowTexts()).toEqual(["●1つ目", "最終1つ目のレポート", "✓2つ目", "✓3つ目"])
    })
  })

  it("やり取りが1件で見出しも無くても、列は出る", () => {
    chooseOutlineOpen()
    renderMainView([requestRecord({ text: "1つ目", turnId: 0 }), detailRecord("本文")])

    expect(screen.getByRole("navigation", { name: "やり取り" })).toBeTruthy()
  })

  it("畳んだ列の開き直す口を押すと、やり取りの行が出る", () => {
    renderMainView(threeTurns())

    expect(outlineTurnRows()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "やり取りを開く" }))
    expect(outlineTurnRows()).toHaveLength(3)
  })
})
