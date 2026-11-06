import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ComposerSurface } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { TextAreaSurface } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/text-area-surface.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

describe("素の入力欄の面", () => {
  function renderSurface(onChange: () => void): { current: ComposerSurface | null } {
    const ref: { current: ComposerSurface | null } = { current: null }
    render(
      <TextAreaSurface
        ref={ref}
        initialDraft={{ text: "", caret: 0 }}
        placeholder="架空"
        label="架空の欄"
        onChange={onChange}
        onKeyDown={() => false}
        onPaste={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
      />,
    )
    return ref
  }

  it("replace は文面とキャレットを置き、onChange を通さない", () => {
    const onChange = vi.fn<() => void>()
    const ref = renderSurface(onChange)
    ref.current?.replace("架空の文面", 2)
    const area = screen.getByLabelText<HTMLTextAreaElement>("架空の欄")
    expect(area.value).toBe("架空の文面")
    expect(area.selectionStart).toBe(2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("打ったあとに古い初期値で描き直しても、欄の字が残る", () => {
    const element = (
      <TextAreaSurface
        ref={null}
        initialDraft={{ text: "", caret: 0 }}
        placeholder="架空"
        label="架空の欄"
        onChange={() => {}}
        onKeyDown={() => false}
        onPaste={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
      />
    )
    const { rerender } = render(element)
    const area = screen.getByLabelText<HTMLTextAreaElement>("架空の欄")
    fireEvent.change(area, { target: { value: "ab" } })
    rerender(element)
    expect(area.value).toBe("ab")
  })

  it("マウントすると store に登録され、replaceDraft の命令が届く", () => {
    renderSurface(() => {})
    useComposerDraft.getState().replaceDraft({ text: "命令", caret: 1 })
    expect(screen.getByLabelText<HTMLTextAreaElement>("架空の欄").value).toBe("命令")
  })
})
