import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createTokenUsageLog } from "../../../../src/server/token-usage/adapter/token-usage-log.ts"
import { type TokenUsageEntry } from "../../../../src/server/token-usage/core/token-usage.ts"
import {
  TOKEN_USAGE_FORMAT_VERSION,
  type ModelTokenUsage,
  type TurnUsageBreakdown,
} from "../../../../src/shared/token-usage.ts"

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

// ツールの名前と長さだけの内訳（**結果の本文は入らない**）。
const BREAKDOWN: TurnUsageBreakdown = {
  main: {
    steps: 3,
    tokens: {
      inputTokens: 1_100,
      outputTokens: 300,
      cacheReadInputTokens: 8_000,
      cacheCreationInputTokens: 700,
    },
    tools: [
      { name: "Bash", calls: 2, resultBytes: 4_096 },
      { name: "Read", calls: 1, resultBytes: 512 },
    ],
  },
  subagent: {
    steps: 2,
    tokens: {
      inputTokens: 100,
      outputTokens: 40,
      cacheReadInputTokens: 1_000,
      cacheCreationInputTokens: 100,
    },
    tools: [{ name: "Grep", calls: 1, resultBytes: 64 }],
  },
}

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

function entry(when: number, models: readonly ModelTokenUsage[] = MODELS): TokenUsageEntry {
  return { at: when, sessionId: "claude-session-1", mode: "work", models, breakdown: BREAKDOWN }
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

  it("1行の鍵は版・日時・セッションID・モード・モデルごとの数・内訳で、日時は ISO 8601（オフセット付き）", () => {
    const log = createTokenUsageLog(root())

    log.append(entry(at(10, 30)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "mode", "models", "breakdown"])
    expect(record).toMatchObject({
      v: 2,
      sessionId: "claude-session-1",
      mode: "work",
      models: MODELS,
      breakdown: BREAKDOWN,
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭だけを見る。
    expect(JSON.stringify(record)).toContain('"at":"2026-09-22T10:30:00')
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T10:30:00[+-]\d{2}:\d{2}"/)
  })

  // **文字列で入るのは時刻・セッションID・モード・鍵の名前・モデルの名前だけ**
  // （docs/coding-standards.md「会話内容の扱い」）。会話の文面が混ざる余地が無いことを、
  // 行に出てくる文字列を数え上げて固定する。
  it("行に出てくる文字列は、鍵の名前とモデル・ツールの名前・セッションID・モード・時刻だけ", () => {
    const log = createTokenUsageLog(root())

    log.append(entry(at(10, 30)))

    const [line] = readFileSync(join(root(), "2026-09-22.jsonl"), "utf8").trimEnd().split("\n")
    const strings = [...(line ?? "").matchAll(/"([^"]*)"/g)].flatMap(([, value]) => value ?? [])
    expect(strings.filter((value) => value.startsWith("2026-09-22T")).length).toBe(1)
    // **同じ鍵の名前が内訳の持ち場ごとに繰り返す**（`inputTokens` は合計と2つの持ち場に出る）ので、
    // 種類を数え上げる。見たいのは「知らない文字列が1つも無い」こと。
    const kinds = [...new Set(strings.filter((value) => !value.startsWith("2026-09-22T")))]
    expect(kinds.toSorted()).toEqual(
      [
        "Bash",
        "Grep",
        "Read",
        "at",
        "breakdown",
        "cacheCreationInputTokens",
        "cacheReadInputTokens",
        "calls",
        "claude-opus-fictional",
        "claude-session-1",
        "costUsd",
        "inputTokens",
        "main",
        "mode",
        "model",
        "models",
        "name",
        "outputTokens",
        "resultBytes",
        "sessionId",
        "steps",
        "subagent",
        "thinkingTokens",
        "tokens",
        "tools",
        "v",
        "work",
      ].toSorted(),
    )
  })
})

describe("readRange", () => {
  it("日またぎの境界: 期間に入る日のファイルだけを読む", () => {
    const log = createTokenUsageLog(root())
    log.append(entry(at(23, 59, 21)))
    log.append(entry(at(0, 0, 22)))
    log.append(entry(at(0, 0, 23)))

    const records = log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })

    expect(records.length).toBe(1)
    expect(records[0]?.at.slice(0, 10)).toBe("2026-09-22")
  })

  it("複数日にまたがる期間は、古い→新しい順に日をまたいで返す", () => {
    const log = createTokenUsageLog(root())
    log.append(entry(at(9, 0, 23)))
    log.append(entry(at(9, 0, 21)))
    log.append(entry(at(9, 0, 22)))

    const records = log.readRange({ startDate: "2026-09-21", endDate: "2026-09-23" })

    expect(records.map((record) => record.at.slice(0, 10))).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ])
  })

  it("記録が無い期間・置き場がまだ無いときは空の並びを返す（例外にならない）", () => {
    const log = createTokenUsageLog(root())

    expect(log.readRange({ startDate: "2026-09-01", endDate: "2026-09-30" })).toEqual([])
  })

  it("記録した期間の外を指定すると空の並びを返す", () => {
    const log = createTokenUsageLog(root())
    log.append(entry(at(9, 0, 22)))

    expect(log.readRange({ startDate: "2026-10-01", endDate: "2026-10-31" })).toEqual([])
  })

  // **`v` が2以外の行・壊れた行は読まずに落とす**（版1を残す価値が無いという判断。
  // まだ開発中で「内訳を空として読む」ことはしない）。1行ずつ検証するので、他の正しい行は
  // 生き残る。
  it("壊れた行や v が2以外の行が混じっても、落として続ける", () => {
    const validLine = JSON.stringify({
      v: TOKEN_USAGE_FORMAT_VERSION,
      at: "2026-09-22T09:00:00+09:00",
      sessionId: "claude-session-1",
      mode: "work",
      models: MODELS,
      breakdown: BREAKDOWN,
    })
    const oldVersionLine = JSON.stringify({
      v: 1,
      at: "2026-09-22T09:01:00+09:00",
      sessionId: "claude-session-1",
      mode: "work",
      models: MODELS,
      breakdown: BREAKDOWN,
    })
    const missingKeyLine = JSON.stringify({
      v: TOKEN_USAGE_FORMAT_VERSION,
      at: "2026-09-22T09:02:00+09:00",
    })
    mkdirSync(root(), { recursive: true })
    appendFileSync(
      join(root(), "2026-09-22.jsonl"),
      `${validLine}\n${oldVersionLine}\nこれはJSONではない\n${missingKeyLine}\n\n`,
    )
    const log = createTokenUsageLog(root())

    const records = log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })

    expect(records.length).toBe(1)
    expect(records[0]?.at).toBe("2026-09-22T09:00:00+09:00")
  })
})
