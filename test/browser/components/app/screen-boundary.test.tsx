import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reportBrowserError } from "../../../../src/browser/components/app/browser-error-report.ts"
import { ScreenBoundary } from "../../../../src/browser/components/app/screen-boundary.tsx"

vi.mock("../../../../src/browser/components/app/browser-error-report.ts", () => ({
  reportBrowserError: vi.fn<() => void>(),
}))

const RENDER_FAILURE = new Error("描画の失敗（テスト用）")

function Thrower(): ReactElement {
  throw RENDER_FAILURE
}

beforeEach(() => {
  // React が捕まえた例外を console.error へ出す分を黙らせる。
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(reportBrowserError).mockClear()
})

describe("ScreenBoundary", () => {
  it("描画中に throw する子を包むと、説明の1行と読み込み直すボタンを出し、失敗を1回だけ記録する", () => {
    render(
      <ScreenBoundary>
        <Thrower />
      </ScreenBoundary>,
    )

    const alert = within(screen.getByRole("alert"))
    expect(alert.getByText("この画面を描けませんでした。読み込み直してください。")).toBeDefined()
    expect(alert.getByRole("button", { name: "読み込み直す" })).toBeDefined()
    expect(reportBrowserError).toHaveBeenCalledTimes(1)
    expect(reportBrowserError).toHaveBeenCalledWith("render-failure", RENDER_FAILURE)
  })

  it("読み込み直すボタンを押すとページを読み込み直す", () => {
    const reload = vi.fn<() => void>()
    vi.stubGlobal("window", { location: { reload } })
    render(
      <ScreenBoundary>
        <Thrower />
      </ScreenBoundary>,
    )

    fireEvent.click(screen.getByRole("button", { name: "読み込み直す" }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("失敗した境界の外にある部品は残り、失敗しなければ子をそのまま出す", () => {
    render(
      <>
        <p>帯</p>
        <ScreenBoundary>
          <Thrower />
        </ScreenBoundary>
        <ScreenBoundary>
          <p>無事な画面</p>
        </ScreenBoundary>
      </>,
    )

    expect(screen.getByText("帯")).toBeDefined()
    expect(screen.getByText("無事な画面")).toBeDefined()
    expect(screen.getAllByRole("alert")).toHaveLength(1)
  })
})
