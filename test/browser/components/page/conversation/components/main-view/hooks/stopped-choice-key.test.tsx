import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useStoppedChoiceKeys,
  type WorkPlanPaperModel,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-work-plan-paper.ts"

function stoppedModel(onDraft: (text: string) => void): WorkPlanPaperModel {
  return {
    kind: "stopped",
    stopper: "you",
    position: "",
    elapsed: "",
    unfinished: [],
    slots: [],
    rows: [],
    now: 0,
    onDraft,
  }
}

function Probe(props: { readonly model: WorkPlanPaperModel }): ReactElement {
  useStoppedChoiceKeys(props.model)
  return <textarea aria-label="入力欄" />
}

afterEach(() => {
  cleanup()
})

describe("止めたあとの続け方の数字キー", () => {
  it("2 を押すと、2つ目の続け方の下書きを入れる", () => {
    const onDraft = vi.fn<(text: string) => void>()
    render(<Probe model={stoppedModel(onDraft)} />)

    fireEvent.keyDown(window, { key: "2" })

    expect(onDraft).toHaveBeenCalledWith("ここまでの変更をコミットして")
  })

  it("入力欄に打っている数字は拾わない", () => {
    const onDraft = vi.fn<(text: string) => void>()
    const view = render(<Probe model={stoppedModel(onDraft)} />)

    fireEvent.keyDown(view.getByLabelText("入力欄"), { key: "1" })

    expect(onDraft).not.toHaveBeenCalled()
  })
})
