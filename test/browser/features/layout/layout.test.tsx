import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Layout } from "../../../../src/browser/features/layout/layout.tsx"
import {
  DEFAULT_SPLIT,
  loadSplit,
  saveSplit,
} from "../../../../src/browser/features/layout/split.ts"

/**
 * 4領域は中身の判別さえできればよいので、部品名の文字列だけ渡す
 * （`<Layout>` は他の `features/` を import しない。test/architecture.test.ts）。
 */
function renderLayout(): void {
  render(<Layout main="main" sidebar="sidebar" character="character" dispatch="dispatch" />)
}

beforeEach(() => {
  saveSplit(DEFAULT_SPLIT)
})

afterEach(() => {
  cleanup()
  saveSplit(DEFAULT_SPLIT)
})

describe("Layout", () => {
  it("比率を戻すボタンは常設で出る", () => {
    renderLayout()

    expect(screen.getByRole("button", { name: "領域の比率を既定に戻す" })).toBeDefined()
  })

  it("比率を戻すボタンを押すと、保存済みの比率が DEFAULT_SPLIT に戻る", () => {
    saveSplit({ rowTop: 20, topLeft: 30, bottomLeft: 40 })
    renderLayout()

    fireEvent.click(screen.getByRole("button", { name: "領域の比率を既定に戻す" }))

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
  })
})
