import { afterEach, describe, expect, it } from "vitest"

import { useComposerDraft } from "../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import {
  draftReplyBatch,
  useReplyBatch,
} from "../../../../../../src/browser/components/page/conversation/stores/reply-batch.ts"
import type { ReplyNote } from "../../../../../../src/browser/stores/reply-note-list.ts"

function noteOf(id: string): ReplyNote {
  return {
    id,
    body: `中身${id}`,
    state: { kind: "unsent" },
    target: {
      label: { component: `部品${id}` },
      key: { reportToolUseId: "r1", componentId: id },
    },
  }
}

const noTitle = () => ""

afterEach(() => {
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useReplyBatch.setState(useReplyBatch.getInitialState(), true)
})

describe("draftReplyBatch", () => {
  it("下書きへ文面を入れて、付箋の id の組を添える", () => {
    draftReplyBatch([noteOf("a"), noteOf("b")], noTitle)
    expect(useComposerDraft.getState().draft.text).toContain("頼みごと 2 件")
    expect(useReplyBatch.getState().noteIds).toEqual(["a", "b"])
  })

  it("組がある下書きへ足すと、組は和集合になる", () => {
    draftReplyBatch([noteOf("a")], noTitle)
    draftReplyBatch([noteOf("a"), noteOf("b")], noTitle)
    expect(useReplyBatch.getState().noteIds).toEqual(["a", "b"])
  })

  it("付箋が無ければ何もしない", () => {
    draftReplyBatch([], noTitle)
    expect(useComposerDraft.getState().draft.text).toBe("")
    expect(useReplyBatch.getState().noteIds).toEqual([])
  })

  it("下書きを空にすると組が外れる", () => {
    draftReplyBatch([noteOf("a")], noTitle)
    useComposerDraft.getState().replaceDraft({ text: "", caret: 0 })
    expect(useReplyBatch.getState().noteIds).toEqual([])
  })
})
