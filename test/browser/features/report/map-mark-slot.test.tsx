import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { MapMarkProvider } from "../../../../src/browser/features/report/map-mark-slot.tsx"
import { Markdown } from "../../../../src/browser/features/report/renderer/markdown-renderer.tsx"

afterEach(cleanup)

const TEXT = "見て {{map: server/report}} を"

describe("本文の地図の箱の印の差し込み口", () => {
  it("口を渡すとその描き方になる", () => {
    const { container } = render(
      <MapMarkProvider value={(id) => <b data-badge={id}>バッジ</b>}>
        <Markdown text={TEXT} />
      </MapMarkProvider>,
    )

    expect(container.querySelector("[data-badge]")?.getAttribute("data-badge")).toBe(
      "server/report",
    )
    expect(container.textContent).toBe("見て バッジ を")
  })

  it("口を渡さなければ印の元の字のまま", () => {
    const { container } = render(<Markdown text={TEXT} />)

    expect(container.textContent).toBe(TEXT)
  })
})
