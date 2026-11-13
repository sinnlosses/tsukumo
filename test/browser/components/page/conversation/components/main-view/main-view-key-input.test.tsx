import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { MainView } from "../../../../../../../src/browser/components/page/conversation/components/main-view/main-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import { useReadingDepth } from "../../../../../../../src/browser/stores/reading-depth.ts"
import { saveSingleKeys } from "../../../../../../../src/browser/stores/single-key-setting.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { stepTurn, threeTurns, title } from "../../../../../../fixture/main-view.tsx"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  useReadingDepth.setState(useReadingDepth.getInitialState(), true)
  window.location.hash = ""
})

function renderPaper(): HTMLElement {
  putSession({ ...INITIAL_SESSION_STATE, records: threeTurns() })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MainView outline="column" inquiry="inline" progress="paper" />
    </QueryClientProvider>,
  )
  const root = document.querySelector<HTMLElement>("[data-main-view]")
  if (root === null) {
    throw new Error("メインビューの根が見つからない")
  }
  return root
}

function press(target: Element, key: string): void {
  act(() => {
    fireEvent.keyDown(target, { key })
  })
}

describe("MainView（紙の1字のキー）", () => {
  it("d は読む深さを回し、? はキーの一覧を開く", () => {
    const root = renderPaper()

    press(root, "d")
    expect(useReadingDepth.getState().depth).toBe(3)
    press(root, "?")
    expect(screen.getByRole("dialog", { name: "キーの一覧" })).toBeDefined()
  })

  it("入力欄の中では d・o・? を奪わない", () => {
    const root = renderPaper()
    const field = document.createElement("textarea")
    root.append(field)

    press(field, "d")
    press(field, "?")
    expect(useReadingDepth.getState().depth).toBe(2)
    expect(screen.queryByRole("dialog", { name: "キーの一覧" })).toBeNull()
  })

  it("設定が切のあいだ d・? は効かず、[ ] は効く", () => {
    saveSingleKeys(false)
    const root = renderPaper()

    press(root, "d")
    press(root, "?")
    expect(useReadingDepth.getState().depth).toBe(2)
    expect(screen.queryByRole("dialog", { name: "キーの一覧" })).toBeNull()
    stepTurn("[")
    expect(title()).toBe("2つ目")
  })
})
