import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SkipLink } from "../../../../src/browser/components/domain/skip-link.tsx"
import { useComposerFocus } from "../../../../src/browser/stores/composer-focus.ts"

afterEach(() => {
  cleanup()
  act(() => {
    useComposerFocus.setState(useComposerFocus.getInitialState(), true)
  })
})

describe("SkipLink", () => {
  it("「入力欄へ移る」の名前を持ち、押すと入力欄へのフォーカスの合図が進む", () => {
    render(<SkipLink />)
    expect(useComposerFocus.getState().signal).toBe(0)

    fireEvent.click(screen.getByRole("button", { name: "入力欄へ移る" }))

    expect(useComposerFocus.getState().signal).toBe(1)
  })
})
