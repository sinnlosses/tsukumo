import { afterEach, describe, expect, it } from "vitest"

import {
  clearSessionDraft,
  draftOnSessionChange,
  saveSessionDraft,
} from "../../../../../../src/browser/components/page/conversation/domain/composer-draft-storage.ts"
import {
  EMPTY_DRAFT,
  type Draft,
} from "../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import type { SessionId } from "../../../../../../src/shared/session/session-id.ts"
import { checkedSessionId } from "../../../../../fixture/session-id.ts"

const STORAGE_KEY = "tsukumo-composer-draft:v1"

// `MAX_DRAFT_SESSIONS` と同じ値。
const MAX_DRAFT_SESSIONS = 10

const A = checkedSessionId("a")
const B = checkedSessionId("b")
const C = checkedSessionId("c")
const NEW = checkedSessionId("new")

/**
 * `sessionId` に保存してある打ちかけ。無ければ undefined。
 * 画面を開いた直後（`previous` が無い）に空の入力欄へ戻る下書きで読む（空の文面は保存されないので、空なら無い）。
 */
function loadSessionDraft(sessionId: SessionId): Draft | undefined {
  const restored = draftOnSessionChange(undefined, sessionId, EMPTY_DRAFT)
  return restored === undefined || restored.text === "" ? undefined : restored
}

function numbered(index: number): SessionId {
  return checkedSessionId(`s${String(index)}`)
}

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("保存した打ちかけの読み戻し", () => {
  it("何も保存していなければ undefined を返す", () => {
    expect(loadSessionDraft(A)).toBeUndefined()
  })

  it("保存した文面とキャレットをそのセッションだけに読み戻す", () => {
    saveSessionDraft(A, { text: "あいう", caret: 2 })
    saveSessionDraft(B, { text: "xyz", caret: 3 })
    expect(loadSessionDraft(A)).toEqual({ text: "あいう", caret: 2 })
    expect(loadSessionDraft(B)).toEqual({ text: "xyz", caret: 3 })
    expect(loadSessionDraft(C)).toBeUndefined()
  })

  it("壊れた値は空として扱う", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadSessionDraft(A)).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: "a" }))
    expect(loadSessionDraft(A)).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ sessionId: "a", text: 1, caret: 0 }]))
    expect(loadSessionDraft(A)).toBeUndefined()
  })

  it("セッションの ID の綴りでない鍵の要素は読まずに落とす", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { sessionId: "../a", text: "x", caret: 1 },
        { sessionId: "a", text: "y", caret: 1 },
      ]),
    )
    saveSessionDraft(B, { text: "z", caret: 1 })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([
      { sessionId: "a", text: "y", caret: 1 },
      { sessionId: "b", text: "z", caret: 1 },
    ])
  })
})

describe("saveSessionDraft", () => {
  it("空の文面は保存せず、あれば消す", () => {
    saveSessionDraft(A, { text: "x", caret: 1 })
    saveSessionDraft(A, { text: "", caret: 0 })
    expect(loadSessionDraft(A)).toBeUndefined()
  })

  it("10 セッション目までは全部残る", () => {
    for (let index = 0; index < MAX_DRAFT_SESSIONS; index += 1) {
      saveSessionDraft(numbered(index), { text: "x", caret: 1 })
    }
    expect(loadSessionDraft(numbered(0))).toBeDefined()
    expect(loadSessionDraft(numbered(MAX_DRAFT_SESSIONS - 1))).toBeDefined()
  })

  it("11 セッション目を書くと、最後に書いたのが最も古いセッションが消える", () => {
    for (let index = 0; index < MAX_DRAFT_SESSIONS; index += 1) {
      saveSessionDraft(numbered(index), { text: "x", caret: 1 })
    }
    saveSessionDraft(numbered(0), { text: "y", caret: 1 })
    saveSessionDraft(NEW, { text: "z", caret: 1 })
    expect(loadSessionDraft(numbered(1))).toBeUndefined()
    expect(loadSessionDraft(numbered(0))).toEqual({ text: "y", caret: 1 })
    expect(loadSessionDraft(NEW)).toEqual({ text: "z", caret: 1 })
  })
})

describe("draftOnSessionChange", () => {
  const typed = { text: "打ちかけ", caret: 4 }
  const empty = { text: "", caret: 0 }

  it("最初に決まったとき、入力欄が空なら保存済みを戻す", () => {
    saveSessionDraft(A, { text: "保存済み", caret: 3 })
    expect(draftOnSessionChange(undefined, A, empty)).toEqual({ text: "保存済み", caret: 3 })
  })

  it("最初に決まったとき、入力欄に字があれば触らない", () => {
    saveSessionDraft(A, { text: "保存済み", caret: 3 })
    expect(draftOnSessionChange(undefined, A, typed)).toBeUndefined()
  })

  it("切り替えると、いまの下書きを前のセッションへ保ち、切り替え先の下書きに入れ替える", () => {
    saveSessionDraft(B, { text: "bの下書き", caret: 1 })
    expect(draftOnSessionChange(A, B, typed)).toEqual({ text: "bの下書き", caret: 1 })
    expect(loadSessionDraft(A)).toEqual(typed)
  })

  it("未確定に変わると、いまの下書きを前のセッションへ保ち、入力欄を空にする", () => {
    expect(draftOnSessionChange(A, undefined, typed)).toEqual(empty)
    expect(loadSessionDraft(A)).toEqual(typed)
  })

  it("最初から未確定のままなら何もしない", () => {
    expect(draftOnSessionChange(undefined, undefined, typed)).toBeUndefined()
    expect(loadSessionDraft(A)).toBeUndefined()
  })

  it("切り替え先に下書きが無ければ空にし、元のセッションへ戻ると元の下書きが戻る", () => {
    expect(draftOnSessionChange(A, B, typed)).toEqual(empty)
    expect(draftOnSessionChange(B, A, empty)).toEqual(typed)
  })
})

describe("clearSessionDraft", () => {
  it("そのセッションの下書きだけを消す", () => {
    saveSessionDraft(A, { text: "x", caret: 1 })
    saveSessionDraft(B, { text: "y", caret: 1 })
    clearSessionDraft(A)
    expect(loadSessionDraft(A)).toBeUndefined()
    expect(loadSessionDraft(B)).toBeDefined()
  })
})
