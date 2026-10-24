import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { useInquiryCardVisibility } from "../../../../../../../src/browser/stores/inquiry-card-visibility.ts"
import { useInquiryDraft } from "../../../../../../../src/browser/stores/inquiry-draft.ts"
import { useInquiryJump } from "../../../../../../../src/browser/stores/inquiry-jump.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import {
  chooseOutlineOpen,
  OUTLINE_PANEL_STORAGE_KEY,
  press,
  renderMainView,
  rerenderMainView,
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

/**
 * やり取りの列の頭の知らせを押す。
 * 同じ知らせが狭い画面用に本文の上端にもあり（どちらを見せるかは CSS が決める）、ここでは列の側を押す。
 */
function pressOutlineNotice(name: string): void {
  act(() => {
    fireEvent.click(outlineNotice(name))
    window.dispatchEvent(new Event("hashchange"))
  })
}

function outlineNotice(name: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "やり取り" })).getByRole("button", { name })
}

describe("MainView（やり取りの移動）", () => {
  afterEach(() => {
    localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
  })

  /** 答え待ちが届いたまま動いている、いちばん新しいやり取り。 */
  const ASKING_TURN = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]
  const PERMISSION = [
    { kind: "permission", id: "fake-ask", toolName: "Bash", input: {}, askedAt: 0 },
  ] as const satisfies SessionState["pending"]

  it("題の行（前後の口と n / N）は出ない", () => {
    renderMainView(threeTurns())

    expect(screen.queryByRole("button", { name: "1つ古いターンへ" })).toBeNull()
    expect(screen.queryByRole("button", { name: "最新へ" })).toBeNull()
    expect(document.querySelector('[class*="turn-position"]')).toBeNull()
  })

  it("メインビューの中で [ は1つ古いターンへ、] は1つ新しいターンへ移り、端と修飾キーつきでは動かない", () => {
    renderMainView(threeTurns())

    stepTurn("]")
    expect(title()).toBe("3つ目")
    stepTurn("[")
    expect(title()).toBe("2つ目")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("3つ目のレポート")).toBeNull()
    stepTurn("[", { metaKey: true })
    expect(title()).toBe("2つ目")
    stepTurn("[")
    stepTurn("[")
    expect(title()).toBe("1つ目")
    stepTurn("]")
    expect(title()).toBe("2つ目")
  })

  it("過去を見ているときに最新のやり取りの行を押すと、追従に戻る", () => {
    chooseOutlineOpen()
    renderMainView(threeTurns())

    press("完了: 1つ目")
    expect(title()).toBe("1つ目")

    press("完了: 3つ目")
    expect(title()).toBe("3つ目")
    expect(window.location.hash).not.toContain("turn=")
  })

  it("過去のターンを見ている間は、新しいターンが来ても動かない", () => {
    renderMainView(threeTurns())

    stepTurn("[")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()

    rerenderMainView([
      ...threeTurns(),
      requestRecord({ text: "4つ目", turnId: 3 }),
      detailRecord("4つ目のレポート"),
    ])

    expect(title()).toBe("2つ目")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("4つ目のレポート")).toBeNull()
  })

  it("最新が答え待ちのとき過去を見ると、列の頭に「お伺いが届いた」の行が出て、押すと最新へ移りお伺いへの転がしを頼む", () => {
    chooseOutlineOpen()
    renderMainView(threeTurns(), ASKING_TURN, PERMISSION)
    expect(screen.queryByRole("button", { name: "お伺いが届いた" })).toBeNull()

    stepTurn("[")
    const signal = useInquiryJump.getState().jump.signal
    pressOutlineNotice("お伺いが届いた")

    expect(title()).toBe("3つ目")
    expect(useInquiryJump.getState().jump).toEqual({ signal: signal + 1, focus: false })
    expect(screen.queryByRole("button", { name: "お伺いが届いた" })).toBeNull()
  })

  it("最新が答え待ちのとき、お伺いの札は本文より後ろに出る", () => {
    renderMainView(threeTurns(), ASKING_TURN, PERMISSION)

    const body = document.querySelector('[class*="turn-card-body"]')
    if (body === null) {
      throw new Error("本文の入れ物が見つからない")
    }
    const card = screen.getByRole("region", { name: "お伺い" })
    expect(body.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  describe("お伺い ↓", () => {
    afterEach(() => {
      useInquiryCardVisibility.setState(useInquiryCardVisibility.getInitialState(), true)
    })

    it("答え待ちで札が窓の外にあるあいだだけ出る", () => {
      renderMainView(threeTurns(), ASKING_TURN, PERMISSION)
      expect(screen.queryByRole("button", { name: "お伺い ↓" })).toBeNull()

      act(() => {
        useInquiryCardVisibility.getState().setVisible(false)
      })
      expect(screen.queryByRole("button", { name: "お伺い ↓" })).not.toBeNull()

      act(() => {
        useInquiryCardVisibility.getState().setVisible(true)
      })
      expect(screen.queryByRole("button", { name: "お伺い ↓" })).toBeNull()
    })

    it("答え待ちが無ければ、札が見えていない扱いでも出ない", () => {
      useInquiryCardVisibility.setState({ visible: false })
      renderMainView(threeTurns())

      expect(screen.queryByRole("button", { name: "お伺い ↓" })).toBeNull()
    })

    it("過去のやり取りを見ているあいだは出ない", () => {
      renderMainView(threeTurns(), ASKING_TURN, PERMISSION)
      act(() => {
        useInquiryCardVisibility.getState().setVisible(false)
      })
      expect(screen.queryByRole("button", { name: "お伺い ↓" })).not.toBeNull()

      stepTurn("[")

      expect(screen.queryByRole("button", { name: "お伺い ↓" })).toBeNull()
    })

    it("押すと札まで送る合図が1つ増え、フォーカスは移さない", () => {
      renderMainView(threeTurns(), ASKING_TURN, PERMISSION)
      act(() => {
        useInquiryCardVisibility.getState().setVisible(false)
      })
      const signal = useInquiryJump.getState().jump.signal

      fireEvent.click(screen.getByRole("button", { name: "お伺い ↓" }))

      expect(useInquiryJump.getState().jump).toEqual({ signal: signal + 1, focus: false })
    })
  })

  it("最新が答え待ちでも、過去のやり取りを見ているあいだはお伺いの札を出さない", () => {
    renderMainView(threeTurns(), ASKING_TURN, PERMISSION)
    expect(screen.queryByRole("region", { name: "お伺い" })).not.toBeNull()

    stepTurn("[")

    expect(screen.queryByRole("region", { name: "お伺い" })).toBeNull()
  })

  it("最新が作業中のとき過去を見ると「作業中」の行が出て、押すと最新へ移るだけ", () => {
    chooseOutlineOpen()
    renderMainView(threeTurns(), ASKING_TURN)

    stepTurn("[")
    const signal = useInquiryJump.getState().jump.signal
    pressOutlineNotice("作業中")

    expect(title()).toBe("3つ目")
    expect(useInquiryJump.getState().jump.signal).toBe(signal)
  })

  it("畳んだ列では知らせが印だけの口になり、押すと同じく最新へ移る", () => {
    renderMainView(threeTurns(), ASKING_TURN, PERMISSION)

    stepTurn("[")
    const mark = outlineNotice("お伺いが届いた")
    expect(mark.textContent).toBe("!")
    expect(mark.getAttribute("title")).toBe("お伺いが届いた")

    pressOutlineNotice("お伺いが届いた")
    expect(title()).toBe("3つ目")
  })
})

describe("MainView（ターン切り替えでレポートの先頭へ戻す）", () => {
  it("前後へ移ると、先頭へ戻す scrollIntoView が1回呼ばれる", () => {
    renderMainView([
      requestRecord({ text: "1つ目", turnId: 0 }),
      detailRecord("1つ目のレポート"),
      requestRecord({ text: "2つ目", turnId: 1 }),
      detailRecord("2つ目のレポート"),
    ])

    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    stepTurn("[")

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.calls[0]?.[0]).toEqual({ block: "start" })

    scrollIntoView.mockRestore()
  })

  it("出ているターンが無いときは呼ばれない", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    renderMainView([])

    expect(scrollIntoView).not.toHaveBeenCalled()

    scrollIntoView.mockRestore()
  })
})
