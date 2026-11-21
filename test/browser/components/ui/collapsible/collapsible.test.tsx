import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Collapsible } from "../../../../../src/browser/components/ui/collapsible/collapsible.tsx"

afterEach(cleanup)

describe("Collapsible", () => {
  it("開いた形では見出しと本文が出て、閉じた形では見出しの開閉の印が閉を示す", () => {
    const opened = render(
      <Collapsible trigger="見出し" defaultOpen>
        本文
      </Collapsible>,
    ).container
    expect(opened.textContent).toContain("本文")
    expect(opened.querySelector("[aria-expanded='true']")).not.toBeNull()
    cleanup()

    const closed = render(
      <Collapsible trigger="見出し" defaultOpen={false}>
        本文
      </Collapsible>,
    ).container
    expect(closed.querySelector("[aria-expanded='false']")).not.toBeNull()
  })
})
