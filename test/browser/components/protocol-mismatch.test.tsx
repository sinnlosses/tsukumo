import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { ProtocolMismatch } from "../../../src/browser/components/protocol-mismatch.tsx"

afterEach(() => {
  cleanup()
})

describe("ProtocolMismatch", () => {
  it("版が合わない知らせを alert として出す", () => {
    render(<ProtocolMismatch />)

    expect(screen.getByRole("alert")).toBeDefined()
  })

  it("読み込み直すよう伝え、直らないときは tsukumo を上げ直すよう伝える", () => {
    render(<ProtocolMismatch />)

    expect(screen.getByText("tsukumo とこのページの版が合いません")).toBeDefined()
    expect(screen.getByText("ページを読み込み直してください。")).toBeDefined()
    expect(
      screen.getByText("読み込み直しても出るときは、tsukumo を上げ直してください。"),
    ).toBeDefined()
  })
})
