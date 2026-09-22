import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createTokenUsageLog } from "../../../src/server/adapter/token-usage-log.ts"
import { type TokenUsageEntry } from "../../../src/server/core/token-usage.ts"
import { type ModelTokenUsage } from "../../../src/shared/token-usage.ts"

// 数はすべて手で書いた架空のもの（実物の使用量も会話も使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const MODELS: readonly ModelTokenUsage[] = [
  {
    model: "claude-opus-fictional",
    inputTokens: 1_200,
    outputTokens: 340,
    thinkingTokens: 50,
    cacheReadInputTokens: 9_000,
    cacheCreationInputTokens: 800,
    costUsd: 0.125,
  },
]

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-token-usage-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 書き込み先（本物の `~/.tsukumo/token-usage` の代わり）。 */
function root(): string {
  return join(dir, "token-usage")
}

/** ある日のローカル時刻のエポックミリ秒（日をまたぐ心配をしない値）。 */
function at(hour: number, minute: number, day = 22): number {
  return new Date(2026, 8, day, hour, minute, 0).getTime()
}

function entry(when: number, models: readonly ModelTokenUsage[] = MODELS): TokenUsageEntry {
  return { at: when, sessionId: "claude-session-1", mode: "work", models }
}

function readLines(fileName: string): unknown[] {
  return readFileSync(join(root(), fileName), "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown)
}

/** 行の鍵の並び（順序を見たいので `toMatchObject` とは別に取る）。 */
function keysOf(value: unknown): readonly string[] {
  return typeof value === "object" && value !== null ? Object.keys(value) : []
}

describe("createTokenUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", () => {
    const log = createTokenUsageLog(root())

    log.append(entry(at(10, 30)))
    log.append(entry(at(10, 31)))
    log.append(entry(at(1, 5, 23)))

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・モード・モデルごとの数で、日時は ISO 8601（オフセット付き）", () => {
    const log = createTokenUsageLog(root())

    log.append(entry(at(10, 30)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "mode", "models"])
    expect(record).toMatchObject({
      v: 1,
      sessionId: "claude-session-1",
      mode: "work",
      models: MODELS,
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toContain('"at":"2026-09-22T10:30:00')
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T10:30:00[+-]\d{2}:\d{2}"/)
  })

  // **文字列で入るのは時刻・セッションID・モード・鍵の名前・モデルの名前だけ**
  // （docs/coding-standards.md「会話内容の扱い」）。会話の文面が混ざる余地が無いことを、
  // 行に出てくる文字列を数え上げて固定する。
  it("行に出てくる文字列は、鍵の名前とモデルの名前・セッションID・モード・時刻だけ", () => {
    const log = createTokenUsageLog(root())

    log.append(entry(at(10, 30)))

    const [line] = readFileSync(join(root(), "2026-09-22.jsonl"), "utf8").trimEnd().split("\n")
    const strings = [...(line ?? "").matchAll(/"([^"]*)"/g)].flatMap(([, value]) => value ?? [])
    expect(strings.filter((value) => value.startsWith("2026-09-22T")).length).toBe(1)
    expect(strings.filter((value) => !value.startsWith("2026-09-22T")).toSorted()).toEqual(
      [
        "at",
        "cacheCreationInputTokens",
        "cacheReadInputTokens",
        "claude-opus-fictional",
        "claude-session-1",
        "costUsd",
        "inputTokens",
        "mode",
        "model",
        "models",
        "outputTokens",
        "sessionId",
        "thinkingTokens",
        "v",
        "work",
      ].toSorted(),
    )
  })

  it("書けないときも例外を投げない（常駐プロセスを落とさない）", () => {
    // 置き場の名前でファイルを作っておくと、その下にファイルを作れない。
    writeFileSync(root(), "")
    const log = createTokenUsageLog(root())

    expect(() => log.append(entry(at(10, 30)))).not.toThrow()
  })
})
