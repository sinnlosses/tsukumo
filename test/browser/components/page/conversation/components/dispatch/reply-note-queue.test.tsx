import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Composer } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/composer.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useReplyBatch } from "../../../../../../../src/browser/components/page/conversation/stores/reply-batch.ts"
import { useReplyNotes } from "../../../../../../../src/browser/stores/reply-note-list.ts"
import type { ReplyTarget } from "../../../../../../../src/shared/session/reply-target.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { detailRecord, requestRecord } from "../../../../../../fixture/session-record.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import {
  putSession,
  putState,
  type CommandSpy,
  type SentCommand,
} from "../../../../../session-store.ts"

// 付箋の鍵は、セッションの id がまだ無い間の "starting"。
const SESSION_KEY = "starting"

function targetAt(rowIndex: number): ReplyTarget {
  return {
    label: { component: "架空の案", row: `架空の案${String(rowIndex)}` },
    key: { reportToolUseId: "t1", componentId: "opts", rowIndex },
  }
}

function addNotes(...bodies: readonly string[]): void {
  act(() => {
    bodies.forEach((body, index) => {
      useReplyNotes.getState().addNote(SESSION_KEY, targetAt(index), body)
    })
  })
}

function renderComposer(sent: SentCommand[] = []): void {
  putSession(INITIAL_SESSION_STATE, (command) => sent.push(command))
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Composer />
    </QueryClientProvider>,
  )
}

function textArea(): HTMLTextAreaElement {
  return typedElement(
    screen.getByPlaceholderText(/依頼を書く/),
    HTMLTextAreaElement,
    "依頼の入力欄",
  )
}

function itemBodies(): readonly string[] {
  return screen.getAllByRole("listitem").map((item) => item.firstElementChild?.textContent ?? "")
}

beforeEach(() => {
  useReplyNotes.setState(useReplyNotes.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useReplyBatch.setState(useReplyBatch.getInitialState(), true)
})

describe("頼みごとの列", () => {
  it("付箋2件で「頼みごと 2 件」と2行が出る", () => {
    renderComposer()
    addNotes("一つ目", "二つ目")
    expect(screen.getByText(/2 件/)).toBeDefined()
    expect(itemBodies()).toEqual(["一つ目", "二つ目"])
  })

  it("付箋が無ければ列を出さない", () => {
    renderComposer()
    expect(screen.queryByText(/頼みごと/)).toBeNull()
  })

  it("Alt+↓ で1つ後ろへ動く", () => {
    renderComposer()
    addNotes("一つ目", "二つ目")
    const [first] = screen.getAllByRole("listitem")
    if (first === undefined) throw new Error("行が無い")
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true })
    expect(itemBodies()).toEqual(["二つ目", "一つ目"])
  })

  it("ドラッグで入れ替わる", () => {
    renderComposer()
    addNotes("一つ目", "二つ目")
    const [first, second] = screen.getAllByRole("listitem")
    if (first === undefined || second === undefined) throw new Error("行が無い")
    fireEvent.dragStart(first)
    fireEvent.drop(second)
    expect(itemBodies()).toEqual(["二つ目", "一つ目"])
  })

  it("「まとめて頼む」で下書きが入り、会話へは送られない", () => {
    const sent: SentCommand[] = []
    renderComposer(sent)
    addNotes("一つ目", "二つ目")
    fireEvent.click(screen.getByRole("button", { name: "まとめて頼む" }))
    expect(textArea().value).toContain("頼みごと 2 件。この順に進めて。")
    expect(textArea().value).toContain("1. 架空の案 › 架空の案0")
    expect(sent).toEqual([])
    expect(useReplyBatch.getState().noteIds).toHaveLength(2)
  })

  it("入力欄に字があれば、空行を挟んで後ろに足す", () => {
    renderComposer()
    addNotes("一つ目")
    fireEvent.change(textArea(), { target: { value: "先に書いた字" } })
    fireEvent.click(screen.getByRole("button", { name: "まとめて頼む" }))
    expect(textArea().value.startsWith("先に書いた字\n\n")).toBe(true)
  })

  it("下書きを空にすると組が外れる", () => {
    renderComposer()
    addNotes("一つ目")
    fireEvent.click(screen.getByRole("button", { name: "まとめて頼む" }))
    expect(useReplyBatch.getState().noteIds).toHaveLength(1)
    act(() => {
      useComposerDraft.getState().replaceDraft({ text: "", caret: 0 })
    })
    expect(useReplyBatch.getState().noteIds).toEqual([])
  })
})

const ONE_TURN = [
  requestRecord({ turnId: 0, text: "架空の最初の依頼" }),
  detailRecord("架空の本文"),
]

function renderWith(state: SessionState, spy: CommandSpy): void {
  putSession(state, spy)
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Composer />
    </QueryClientProvider>,
  )
}

async function sendDraft(): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true })
    await Promise.resolve()
  })
}

describe("まとめた下書きを送る", () => {
  it("受け付けられたあと新しいやり取りが現れると、付箋が送ったになり番号は新しいやり取りの id になる", async () => {
    const sent: SentCommand[] = []
    renderWith({ ...INITIAL_SESSION_STATE, records: ONE_TURN }, (command) => sent.push(command))
    addNotes("一つ目")
    fireEvent.click(screen.getByRole("button", { name: "まとめて頼む" }))
    await sendDraft()

    expect(sent.map((command) => command.procedure)).toEqual(["session.prompt"])
    expect(Object.values(useReplyNotes.getState().notesBySession).flat()[0]?.state).toEqual({
      kind: "unsent",
    })

    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        records: [...ONE_TURN, requestRecord({ turnId: 1, text: "架空のまとめた依頼" })],
      })
    })

    expect(Object.values(useReplyNotes.getState().notesBySession).flat()[0]?.state).toEqual({
      kind: "sent",
      turn: 1,
    })
    expect(screen.queryByText(/頼みごと/)).toBeNull()
    expect(textArea().value).toBe("")
  })

  it("断られたら付箋は未送信のまま、下書きと組も残る", async () => {
    renderWith({ ...INITIAL_SESSION_STATE, records: ONE_TURN }, () =>
      Promise.reject(new Error("断り")),
    )
    addNotes("一つ目")
    fireEvent.click(screen.getByRole("button", { name: "まとめて頼む" }))
    await sendDraft()
    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        records: [...ONE_TURN, requestRecord({ turnId: 1, text: "架空の別の依頼" })],
      })
    })

    expect(Object.values(useReplyNotes.getState().notesBySession).flat()[0]?.state).toEqual({
      kind: "unsent",
    })
    expect(textArea().value).toContain("頼みごと 1 件")
    expect(useReplyBatch.getState().noteIds).toHaveLength(1)
  })

  it("下書きを消してから受け付けられても、組は外れていて付箋は送ったにならない", () => {
    renderWith({ ...INITIAL_SESSION_STATE, records: ONE_TURN }, () => {})
    addNotes("一つ目")
    fireEvent.click(screen.getByRole("button", { name: "まとめて頼む" }))
    act(() => {
      useComposerDraft.getState().replaceDraft({ text: "", caret: 0 })
    })
    expect(useReplyBatch.getState().noteIds).toEqual([])
    expect(Object.values(useReplyNotes.getState().notesBySession).flat()[0]?.state.kind).toBe(
      "unsent",
    )
  })
})

describe("作業中", () => {
  const RUNNING = { ...INITIAL_SESSION_STATE, turn: { kind: "running", startedAt: 0 } } as const

  it("案内とボタンの字が変わる", () => {
    renderWith(RUNNING, () => {})
    addNotes("一つ目")
    expect(screen.getByText("いまは作業中。聞くはいつでも送れる")).toBeDefined()
    expect(screen.getByRole("button", { name: "終わったら頼む" })).toBeDefined()
  })

  it("押しておくと、作業が終わったときに下書きが入り、送られない", () => {
    const sent: SentCommand[] = []
    renderWith(RUNNING, (command) => sent.push(command))
    addNotes("一つ目")
    fireEvent.click(screen.getByRole("button", { name: "終わったら頼む" }))
    expect(textArea().value).toBe("")
    expect(screen.getByRole("button", { name: "頼む予約済み" })).toBeDefined()

    act(() => {
      putState({ ...INITIAL_SESSION_STATE })
    })

    expect(textArea().value).toContain("頼みごと 1 件")
    expect(sent).toEqual([])
  })
})
