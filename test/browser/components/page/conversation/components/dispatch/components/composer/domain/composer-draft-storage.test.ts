import { afterEach, describe, expect, it } from "vitest"

import {
  clearSessionDraft,
  draftOnSessionChange,
  saveSessionDraft,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/domain/composer-draft-storage.ts"
import {
  EMPTY_DRAFT,
  type Draft,
} from "../../../../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"

const STORAGE_KEY = "tsukumo-composer-draft:v1"

// `MAX_DRAFT_SESSIONS` と同じ値。
const MAX_DRAFT_SESSIONS = 10

/**
 * `sessionId` に保存してある打ちかけ。無ければ undefined。
 * 画面を開いた直後（`previous` が無い）に空の入力欄へ戻る下書きで読む（空の文面は保存されないので、空なら無い）。
 */
function loadSessionDraft(sessionId: string): Draft | undefined {
  const restored = draftOnSessionChange(undefined, sessionId, EMPTY_DRAFT)
  return restored === undefined || restored.text === "" ? undefined : restored
}

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("保存した打ちかけの読み戻し", () => {
  it("何も保存していなければ undefined を返す", () => {
    expect(loadSessionDraft("a")).toBeUndefined()
  })

  it("保存した文面とキャレットをそのセッションだけに読み戻す", () => {
    saveSessionDraft("a", { text: "あいう", caret: 2 })
    saveSessionDraft("b", { text: "xyz", caret: 3 })
    expect(loadSessionDraft("a")).toEqual({ text: "あいう", caret: 2 })
    expect(loadSessionDraft("b")).toEqual({ text: "xyz", caret: 3 })
    expect(loadSessionDraft("c")).toBeUndefined()
  })

  it("壊れた値は空として扱う", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadSessionDraft("a")).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: "a" }))
    expect(loadSessionDraft("a")).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ sessionId: "a", text: 1, caret: 0 }]))
    expect(loadSessionDraft("a")).toBeUndefined()
  })
})

describe("saveSessionDraft", () => {
  it("空の文面は保存せず、あれば消す", () => {
    saveSessionDraft("a", { text: "x", caret: 1 })
    saveSessionDraft("a", { text: "", caret: 0 })
    expect(loadSessionDraft("a")).toBeUndefined()
  })

  it("10 セッション目までは全部残る", () => {
    for (let index = 0; index < MAX_DRAFT_SESSIONS; index += 1) {
      saveSessionDraft(`s${index}`, { text: "x", caret: 1 })
    }
    expect(loadSessionDraft("s0")).toBeDefined()
    expect(loadSessionDraft(`s${MAX_DRAFT_SESSIONS - 1}`)).toBeDefined()
  })

  it("11 セッション目を書くと、最後に書いたのが最も古いセッションが消える", () => {
    for (let index = 0; index < MAX_DRAFT_SESSIONS; index += 1) {
      saveSessionDraft(`s${index}`, { text: "x", caret: 1 })
    }
    saveSessionDraft("s0", { text: "y", caret: 1 })
    saveSessionDraft("new", { text: "z", caret: 1 })
    expect(loadSessionDraft("s1")).toBeUndefined()
    expect(loadSessionDraft("s0")).toEqual({ text: "y", caret: 1 })
    expect(loadSessionDraft("new")).toEqual({ text: "z", caret: 1 })
  })
})

describe("draftOnSessionChange", () => {
  const typed = { text: "打ちかけ", caret: 4 }
  const empty = { text: "", caret: 0 }

  it("最初に決まったとき、入力欄が空なら保存済みを戻す", () => {
    saveSessionDraft("a", { text: "保存済み", caret: 3 })
    expect(draftOnSessionChange(undefined, "a", empty)).toEqual({ text: "保存済み", caret: 3 })
  })

  it("最初に決まったとき、入力欄に字があれば触らない", () => {
    saveSessionDraft("a", { text: "保存済み", caret: 3 })
    expect(draftOnSessionChange(undefined, "a", typed)).toBeUndefined()
  })

  it("切り替えると、いまの下書きを前のセッションへ保ち、切り替え先の下書きに入れ替える", () => {
    saveSessionDraft("b", { text: "bの下書き", caret: 1 })
    expect(draftOnSessionChange("a", "b", typed)).toEqual({ text: "bの下書き", caret: 1 })
    expect(loadSessionDraft("a")).toEqual(typed)
  })

  it("未確定に変わると、いまの下書きを前のセッションへ保ち、入力欄を空にする", () => {
    expect(draftOnSessionChange("a", undefined, typed)).toEqual(empty)
    expect(loadSessionDraft("a")).toEqual(typed)
  })

  it("最初から未確定のままなら何もしない", () => {
    expect(draftOnSessionChange(undefined, undefined, typed)).toBeUndefined()
    expect(loadSessionDraft("a")).toBeUndefined()
  })

  it("切り替え先に下書きが無ければ空にし、元のセッションへ戻ると元の下書きが戻る", () => {
    expect(draftOnSessionChange("a", "b", typed)).toEqual(empty)
    expect(draftOnSessionChange("b", "a", empty)).toEqual(typed)
  })
})

describe("clearSessionDraft", () => {
  it("そのセッションの下書きだけを消す", () => {
    saveSessionDraft("a", { text: "x", caret: 1 })
    saveSessionDraft("b", { text: "y", caret: 1 })
    clearSessionDraft("a")
    expect(loadSessionDraft("a")).toBeUndefined()
    expect(loadSessionDraft("b")).toBeDefined()
  })
})
