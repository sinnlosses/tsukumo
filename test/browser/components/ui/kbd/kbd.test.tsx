import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Kbd } from "../../../../../src/browser/components/ui/kbd/kbd.tsx"

afterEach(cleanup)

describe("Kbd", () => {
  it("`+` で区切ったキーを、キーごとの kbd に分ける", () => {
    const { container } = render(<Kbd keys="shift+enter" />)

    expect(container.querySelectorAll("kbd")).toHaveLength(2)
  })
})
