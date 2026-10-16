import { describe, expect, it } from "vitest"

import { readOrcaFailure } from "../../../../src/server/host/adapter/orca-failure.ts"

const STALE_REASON = "送信先のターミナルが見つからない（一覧が古くなっている）"

function failure(code: unknown, message: unknown, data?: unknown): string {
  return JSON.stringify({ id: "x", ok: false, error: { code, message, data }, _meta: {} })
}

describe("readOrcaFailure（--json の応答）", () => {
  it("表に載ったコードは、構造化した応答から既存の日本語の理由になる", () => {
    expect(readOrcaFailure(failure("terminal_handle_stale", "terminal_handle_stale"), "")).toEqual({
      kind: "known",
      reason: STALE_REASON,
    })
    expect(readOrcaFailure(failure("agent_prompt_blocked", "agent_prompt_blocked"), "")).toEqual({
      kind: "known",
      reason: "claude が入力待ちの表示を出している間は送れない（ターミナル側で答える）",
    })
  })

  it("message の文言が変わっても、code が合えば同じ理由になる", () => {
    expect(readOrcaFailure(failure("terminal_handle_stale", "別の言い回し"), "")).toEqual({
      kind: "known",
      reason: STALE_REASON,
    })
  })

  it("message が合っても code が別なら、表の理由にしない", () => {
    expect(readOrcaFailure(failure("browser_tab_not_found", "terminal_handle_stale"), "")).toEqual({
      kind: "code",
      code: "browser_tab_not_found",
    })
  })

  it("invalid_argument は、固定文言のときだけ『送る中身が空』になる", () => {
    expect(
      readOrcaFailure(failure("invalid_argument", "Missing terminal send payload"), ""),
    ).toEqual({ kind: "known", reason: "送る中身が空" })
    expect(readOrcaFailure(failure("invalid_argument", "別の問題"), "")).toEqual({
      kind: "code",
      code: "invalid_argument",
    })
  })

  it("表に無いコードは形が合うときだけ code で返し、message と data の値は出さない", () => {
    const reading = readOrcaFailure(
      failure("selector_not_found", "/private/path", { selector: "path:/private/path" }),
      "",
    )

    expect(reading).toEqual({ kind: "code", code: "selector_not_found" })
    expect(JSON.stringify(reading)).not.toContain("/private/path")
    expect(readOrcaFailure(failure("見つからない 失敗", "x"), "")).toEqual({ kind: "none" })
  })

  it("ok: true・error 無し・code が文字列でない応答は、コードを読まない", () => {
    expect(
      readOrcaFailure(JSON.stringify({ ok: true, error: { code: "terminal_handle_stale" } }), ""),
    ).toEqual({ kind: "none" })
    expect(readOrcaFailure(JSON.stringify({ ok: false }), "")).toEqual({ kind: "none" })
    expect(readOrcaFailure(failure(42, "x"), "")).toEqual({ kind: "none" })
  })
})

describe("readOrcaFailure（JSON にならない出力）", () => {
  it("素の stdout が表のコード1語だけなら、日本語の理由になる", () => {
    expect(readOrcaFailure("terminal_handle_stale\n", "")).toEqual({
      kind: "known",
      reason: STALE_REASON,
    })
  })

  it("素の stdout が表に無い1語なら、そのコードを返す", () => {
    expect(readOrcaFailure("browser_tab_not_found", "")).toEqual({
      kind: "code",
      code: "browser_tab_not_found",
    })
  })

  it("stderr が1語のコードでも、表を引く", () => {
    expect(readOrcaFailure("", "terminal_handle_stale\n")).toEqual({
      kind: "known",
      reason: STALE_REASON,
    })
    expect(readOrcaFailure("", "browser_tab_not_found")).toEqual({
      kind: "code",
      code: "browser_tab_not_found",
    })
  })

  it("1語でない出力・空の出力は、コードを読まない", () => {
    expect(readOrcaFailure("", "")).toEqual({ kind: "none" })
    expect(readOrcaFailure("error: terminal_handle_stale", "")).toEqual({ kind: "none" })
    expect(readOrcaFailure("terminal_handle_stale", "別の出力")).toEqual({ kind: "none" })
    expect(readOrcaFailure("見つからない", "")).toEqual({ kind: "none" })
  })
})
