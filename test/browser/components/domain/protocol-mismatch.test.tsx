import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ProtocolMismatch } from "../../../../src/browser/components/domain/protocol-mismatch.tsx"

afterEach(() => {
  cleanup()
})

describe("ProtocolMismatch", () => {
  it("版が合わない知らせを alert として出し、読み込み直すよう、直らないときは tsukumo を上げ直すよう伝える", () => {
    render(<ProtocolMismatch />)

    const alert = within(screen.getByRole("alert"))
    expect(alert.getByText("tsukumo とこのページの版が合いません")).toBeDefined()
    expect(alert.getByText("ページを読み込み直してください。")).toBeDefined()
    expect(
      alert.getByText("読み込み直しても出るときは、tsukumo を上げ直してください。"),
    ).toBeDefined()
  })
})
