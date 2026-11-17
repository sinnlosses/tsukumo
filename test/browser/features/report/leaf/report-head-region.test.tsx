import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useComposerDraft } from "../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { FavorRegion } from "../../../../../src/browser/features/report/leaf/report-head-region.tsx"
import { ReplyPortContext } from "../../../../../src/browser/features/report/reply-port.ts"

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

const FIRST = { name: "甲の案", draft: "甲でお願いします", result: "架空の結果", recommended: true }
const SECOND = { name: "乙の案", draft: "乙でお願いします" }
const OPTIONS = [FIRST, SECOND]

function renderFavor(options: Parameters<typeof FavorRegion>[0]["options"], pressable: boolean) {
  const port = {
    appendDraft: useComposerDraft.getState().appendParagraphToDraft,
    prependDraft: useComposerDraft.getState().prependToDraft,
    ask: () => Promise.resolve(),
  }
  return render(
    <ReplyPortContext value={{ kind: "open", port }}>
      <FavorRegion
        id="f"
        text="どちらにするか選んでください。"
        options={options}
        pressable={pressable}
      />
    </ReplyPortContext>,
  )
}

describe("FavorRegion の札", () => {
  it("札の数だけ並び、勧める印のある札にだけ「おすすめ」が付く", () => {
    renderFavor(OPTIONS, true)

    expect(screen.getAllByRole("button")).toHaveLength(2)
    expect(screen.getAllByText("おすすめ")).toHaveLength(1)
    expect(screen.getByText("架空の結果")).toBeTruthy()
  })

  it("戻せない印があるときだけ注意の行が1つ立つ", () => {
    renderFavor(OPTIONS, true)
    expect(screen.queryAllByRole("note")).toHaveLength(0)
    cleanup()

    renderFavor([FIRST, { ...SECOND, irreversible: true }], true)
    expect(screen.getAllByRole("note")).toHaveLength(1)
  })

  it("押すと下書きが入り、押した札が分かる", () => {
    renderFavor(OPTIONS, true)

    fireEvent.click(screen.getByRole("button", { name: /乙の案/ }))

    expect(useComposerDraft.getState().draft.text).toContain("乙でお願いします")
    expect(screen.getByRole("button", { name: /乙の案/ }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: /甲の案/ }).getAttribute("aria-pressed")).toBe(
      "false",
    )
  })

  it("pressable でなければボタンにならず、名前と結果だけを出す", () => {
    renderFavor(OPTIONS, false)

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.getByText("甲の案")).toBeTruthy()
    expect(screen.getByText("架空の結果")).toBeTruthy()
  })
})
