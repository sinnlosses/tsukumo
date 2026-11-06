import { EditorView } from "@codemirror/view"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ComposerSurface } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { MarkdownEditorSurface } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/markdown-editor-surface.tsx"
import {
  useComposerDraft,
  type Draft,
} from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { typedElement } from "../../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

function surfaceElement(
  ref: { current: ComposerSurface | null },
  draft: Draft,
  onChange: (draft: Draft) => void,
): React.ReactElement {
  return (
    <MarkdownEditorSurface
      ref={ref}
      initialDraft={draft}
      placeholder="架空"
      label="架空の欄"
      onChange={onChange}
      onKeyDown={() => false}
      onPaste={() => {}}
      onDragOver={() => {}}
      onDrop={() => {}}
    />
  )
}

function viewOf(): EditorView {
  const view = EditorView.findFromDOM(
    typedElement(
      screen.getByLabelText("架空の欄").closest(".cm-editor"),
      HTMLElement,
      "エディタの外枠",
    ),
  )
  if (view === null) {
    throw new Error("EditorView が見つからない")
  }
  return view
}

describe("マークダウンの面", () => {
  it("replace は文面と選択を置き、onChange を通さない", () => {
    const onChange = vi.fn<(draft: Draft) => void>()
    const ref: { current: ComposerSurface | null } = { current: null }
    render(surfaceElement(ref, { text: "", caret: 0 }, onChange))
    ref.current?.replace("架空の文面", 2)
    const view = viewOf()
    expect(view.state.doc.toString()).toBe("架空の文面")
    expect(view.state.selection.main.head).toBe(2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("打鍵は onChange に打った文面とキャレットで届く", () => {
    const onChange = vi.fn<(draft: Draft) => void>()
    const ref: { current: ComposerSurface | null } = { current: null }
    render(surfaceElement(ref, { text: "", caret: 0 }, onChange))
    const view = viewOf()
    view.dispatch({
      changes: { from: 0, insert: "ab" },
      selection: { anchor: 2 },
      userEvent: "input.type",
    })
    expect(onChange).toHaveBeenLastCalledWith({ text: "ab", caret: 2 })
  })

  it("打ったあとに古い初期値で描き直しても、打った字が残る", () => {
    const onChange = vi.fn<(draft: Draft) => void>()
    const ref: { current: ComposerSurface | null } = { current: null }
    const stale = { text: "", caret: 0 }
    const { rerender } = render(surfaceElement(ref, stale, onChange))
    const view = viewOf()
    view.dispatch({
      changes: { from: 0, insert: "ab" },
      selection: { anchor: 2 },
      userEvent: "input.type",
    })
    rerender(surfaceElement(ref, { text: "古い", caret: 0 }, onChange))
    expect(view.state.doc.toString()).toBe("ab")
  })
})
