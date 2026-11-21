import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CommandPalette } from "../../../../../src/browser/components/frame/command-palette/command-palette.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../session-store.ts"

// ターンの進行中は、起こし直しの要る行（新しいセッション・いまと違うモードの会話）を出さない。

beforeEach(() => {
  putSession({ ...INITIAL_SESSION_STATE, chatMode: false })
  render(<CommandPalette />)
})

afterEach(() => {
  cleanup()
})

function optionNames(): readonly string[] {
  return screen.queryAllByRole("option").map((option) => option.textContent)
}

describe("コマンドパレットのターン進行中の行", () => {
  it("進行中は新しいセッションと雑談の行が無く、進行が終わると開いたままのパレットに戻る", async () => {
    fireEvent.keyDown(document, { key: "k", metaKey: true })
    await screen.findByRole("option", { name: /入力欄へ移る/ })
    expect(optionNames()).toContain("新しいセッションを始める")
    expect(optionNames()).toContain("雑談")

    putSession({
      ...INITIAL_SESSION_STATE,
      chatMode: false,
      turn: { kind: "running", startedAt: 0 },
    })
    await waitFor(() => {
      expect(optionNames()).not.toContain("新しいセッションを始める")
    })
    expect(optionNames()).not.toContain("雑談")
    expect(screen.getByRole("option", { name: /セッションを切り替える/ })).toBeTruthy()

    putSession({ ...INITIAL_SESSION_STATE, chatMode: false })
    await waitFor(() => {
      expect(optionNames()).toContain("新しいセッションを始める")
    })
    expect(optionNames()).toContain("雑談")
  })
})
