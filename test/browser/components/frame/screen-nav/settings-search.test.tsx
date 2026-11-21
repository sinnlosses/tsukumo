import { act, fireEvent, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSettingsRequest } from "../../../../../src/browser/stores/settings-request.ts"
import { rpcOutput } from "../../../rpc-fetch-stub.ts"
import { dialog, renderWorkflowFace, REPOSITORY, tearDownWorkflowFace } from "./workflow-face.tsx"

// 設定のダイアログのナビの頭の探す欄。項目の宣言の名前と説明で当て、結果の面から該当ページへ送る。

const scrolled = vi.fn<(options: ScrollIntoViewOptions) => void>()

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = scrolled
})

afterEach(() => {
  scrolled.mockClear()
  tearDownWorkflowFace()
  useSettingsRequest.setState(useSettingsRequest.getInitialState(), true)
})

function openSearch(): void {
  renderWorkflowFace(() =>
    rpcOutput({ kind: "unavailable", repository: REPOSITORY, reason: "tw-missing", detail: "" }),
  )
}

function typeQuery(word: string): void {
  fireEvent.change(within(dialog()).getByPlaceholderText("設定を探す"), {
    target: { value: word },
  })
}

describe("設定の探す欄", () => {
  it("「動き」で探すと当たった項目がページ名つきで並び、押すと演出のページへ移って欄が空に戻る", () => {
    openSearch()

    typeQuery("動き")
    const results = within(dialog()).getByRole("region", { name: "探した結果" })
    act(() => {
      fireEvent.click(within(results).getByRole("button", { name: /^動き\s*演出 — / }))
    })

    expect(within(dialog()).queryByRole("region", { name: "探した結果" })).toBeNull()
    expect(within(dialog()).getByRole("region", { name: "演出" })).toBeInstanceOf(HTMLElement)
    expect(useSettingsRequest.getState().faceKey).toBe("reveal")
    const row = [...dialog().querySelectorAll<HTMLElement>(".screen-nav-settings-row")].find(
      (node) =>
        node.querySelector(".screen-nav-settings-name > :first-child")?.textContent === "動き",
    )
    expect(row?.dataset["found"]).toBe("true")
    expect(scrolled).toHaveBeenCalledWith({ block: "center" })
  })

  it("欄を空にすると、探す前に見ていたページへ戻る", () => {
    openSearch()

    typeQuery("動き")
    typeQuery("")

    expect(within(dialog()).getByRole("region", { name: "ワークフロー" })).toBeInstanceOf(
      HTMLElement,
    )
  })

  it("当たる項目が無ければ、その旨を出す", () => {
    openSearch()

    typeQuery("存在しない語")

    expect(within(dialog()).getByText("当たる設定が無い")).toBeInstanceOf(HTMLElement)
  })
})
