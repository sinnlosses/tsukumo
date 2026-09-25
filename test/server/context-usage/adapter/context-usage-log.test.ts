import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createContextUsageLog } from "../../../../src/server/context-usage/adapter/context-usage-log.ts"
import { type ContextUsageEntry } from "../../../../src/server/context-usage/core/context-usage.ts"
import { CONTEXT_USAGE_FORMAT_VERSION } from "../../../../src/shared/context-usage-record.ts"
import { contextUsage } from "../../../fixture/context-usage.ts"

// 数も名前もすべて手で書いた架空のもの（実物のセッションの内訳は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-context-usage-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 書き込み先（本物の `~/.tsukumo/context-usage` の代わり）。 */
function root(): string {
  return join(dir, "context-usage")
}

/** ある日のローカル時刻のエポックミリ秒（日をまたぐ心配をしない値）。 */
function at(hour: number, minute: number, day = 22): number {
  return Temporal.ZonedDateTime.from({
    year: 2026,
    month: 9,
    day,
    hour,
    minute,
    second: 0,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

function entry(when: number, sessionId = "claude-session-1"): ContextUsageEntry {
  return { at: when, sessionId, mode: "work", usage: contextUsage() }
}

function readLines(fileName: string): unknown[] {
  return readFileSync(join(root(), fileName), "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line))
}

/** 行の鍵の並び（順序を見たいので `toMatchObject` とは別に取る）。 */
function keysOf(value: unknown): readonly string[] {
  return typeof value === "object" && value !== null ? Object.keys(value) : []
}

describe("createContextUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", () => {
    const log = createContextUsageLog(root())

    log.append(entry(at(9, 0), "claude-session-1"))
    log.append(entry(at(23, 30), "claude-session-2"))
    log.append(entry(at(1, 15, 23), "claude-session-3"))

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・モード・内訳で、日時は ISO 8601（オフセット付き）", () => {
    const log = createContextUsageLog(root())

    log.append(entry(at(9, 0)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "mode", "usage"])
    expect(record).toMatchObject({
      v: CONTEXT_USAGE_FORMAT_VERSION,
      sessionId: "claude-session-1",
      mode: "work",
      usage: contextUsage(),
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T09:00:00[+-]\d{2}:\d{2}"/)
  })

  // **ターンごとの記録より広い線**（`src/shared/context-usage-record.ts`）——分類の表示名・
  // MCP ツール名・メモリファイルのパス・スキル名まで入る。**広がったのはそこまで**で、
  // 会話の文面が混ざる余地が無いことを、行に出てくる文字列を数え上げて固定する。
  it("行に出てくる文字列は、鍵の名前と内訳の名前・セッションID・モード・時刻だけ", () => {
    const log = createContextUsageLog(root())

    log.append(entry(at(9, 0)))

    const [line] = readFileSync(join(root(), "2026-09-22.jsonl"), "utf8").trimEnd().split("\n")
    const strings = [...(line ?? "").matchAll(/"([^"]*)"/g)].flatMap(([, value]) => value ?? [])
    expect(strings.filter((value) => value.startsWith("2026-09-22T")).length).toBe(1)
    // **同じ鍵の名前が内訳の行ごとに繰り返す**（`name` / `tokens` は3つの並びすべてに出る）ので、
    // 種類を数え上げる。見たいのは「知らない文字列が1つも無い」こと。
    const kinds = [...new Set(strings.filter((value) => !value.startsWith("2026-09-22T")))]
    expect(kinds.toSorted()).toEqual(
      [
        // 鍵の名前。
        "at",
        "categories",
        "kind",
        "maxTokens",
        "mcpTools",
        "memoryFiles",
        "mode",
        "model",
        "name",
        "percentage",
        "sessionId",
        "skills",
        "source",
        "tokens",
        "totalTokens",
        "usage",
        "v",
        // 行そのものが持つ値。
        "claude-session-1",
        "work",
        // SDK が内訳として返す名前（ここが広げた線）。
        "CLAUDE.md",
        "MCP tools (deferred)",
        "Memory files",
        "Messages",
        "Project",
        "System prompt",
        "System tools",
        "Autocompact buffer",
        "Free space",
        "buffer",
        "claude-opus-5",
        "deferred",
        "free",
        "mcp__tsukumo__speak",
        "tsukumo",
        "used",
        "userSettings",
        "架空のスキル",
      ].toSorted(),
    )
  })
})
