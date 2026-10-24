import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Ref } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Composer } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/composer.tsx"
import type { ComposerSurface } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { useComposerDraft } from "../../../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../../../../../typed-element.ts"
import { createTestQueryClient } from "../../../../../../../query-client.tsx"
import { putSession } from "../../../../../../../session-store.ts"

// モックの工場が走った（マークダウンエディタのモジュールが読まれた）回数と、面の `focus()` が呼ばれた回数。
const editorModule = vi.hoisted(() => ({ loads: 0, focuses: 0 }))

vi.mock(
  "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/markdown-editor-surface/markdown-editor-surface.tsx",
  async () => {
    const { useImperativeHandle } = await import("react")
    editorModule.loads += 1
    return {
      MarkdownEditorSurface: ({ ref }: { readonly ref: Ref<ComposerSurface | null> }) => {
        useImperativeHandle(
          ref,
          () => ({
            focus: () => {
              editorModule.focuses += 1
            },
            blur: () => {},
            caret: () => 0,
            placeCaret: () => {},
          }),
          [],
        )
        return <div data-testid="markdown-editor" />
      },
    }
  },
)

afterEach(() => {
  cleanup()
  localStorage.clear()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

describe("Composer の面の読み込み", () => {
  it("`plain` の面のあいだはエディタのモジュールを読まず、マークダウンの面へ切り替えると読み、素の入力欄からエディタに替わってフォーカスを引き継ぐ", async () => {
    putSession({ ...INITIAL_SESSION_STATE }, () => {})
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Composer />
      </QueryClientProvider>,
    )
    expect(screen.getByPlaceholderText(/依頼を書く/)).toBeDefined()
    expect(editorModule.loads).toBe(0)

    fireEvent.click(screen.getByRole("button", { name: "マークダウンエディタで書く" }))
    typedElement(
      screen.getByPlaceholderText(/依頼を書く/),
      HTMLTextAreaElement,
      "読み込み中の入力欄",
    ).focus()
    const focusesBefore = editorModule.focuses

    expect(await screen.findByTestId("markdown-editor")).toBeDefined()
    expect(editorModule.loads).toBe(1)
    expect(editorModule.focuses).toBe(focusesBefore + 1)
  })
})
