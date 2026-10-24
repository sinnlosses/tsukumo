import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createTokenUsageLog } from "../../../../src/server/token-usage/adapter/token-usage-log.ts"
import {
  createOpenTaskReader,
  type OpenTaskReader,
  type TwClaimsRunner,
} from "../../../../src/server/token-usage/adapter/tw-claims.ts"
import type { TokenUsageEntry } from "../../../../src/server/token-usage/core/token-usage.ts"
import {
  TOKEN_USAGE_FORMAT_VERSION,
  type ModelTokenUsage,
  type TurnUsageBreakdown,
} from "../../../../src/shared/token-usage/token-usage.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

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

// ツールの名前と長さだけの内訳（結果の本文は入らない）。
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

const dir = useTempDir("token-usage")

/** 書き込み先（本物の `~/.tsukumo/token-usage` の代わり）。 */
function root(): string {
  return join(dir(), "token-usage")
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
  return readJsonLines(join(root(), fileName))
}

/** 着手中のタスクが無い作業ツリー。 */
const NO_TASK: OpenTaskReader = () => undefined

type Claim = { readonly task: string; readonly stage: string | null }

/** 口（`tw status --claims`）が `claims` を返す代役。打った回数も数える。 */
function claimsRunner(claims: readonly Claim[]): { run: TwClaimsRunner; calls: () => number } {
  let calls = 0
  return {
    run: () => {
      calls += 1
      return JSON.stringify({ claims: claims.map((claim) => ({ ...claim, claim: "t" })) })
    },
    calls: () => calls,
  }
}

describe("createTokenUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", async () => {
    const log = createTokenUsageLog(NO_TASK, root())

    log.append(entry(at(10, 30)))
    log.append(entry(at(10, 31)))
    log.append(entry(at(1, 5, 23)))
    await log.flush()

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・モード・モデルごとの数・内訳で、日時は ISO 8601（オフセット付き）", async () => {
    const log = createTokenUsageLog(NO_TASK, root())

    log.append(entry(at(10, 30)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).toEqual(["v", "at", "sessionId", "mode", "models", "breakdown"])
    expect(record).toMatchObject({
      v: 3,
      sessionId: "claude-session-1",
      mode: "work",
      models: MODELS,
      breakdown: BREAKDOWN,
    })
    // オフセットはそのマシンのローカル時刻で決まるので、頭と形だけを見る。
    expect(JSON.stringify(record)).toMatch(/"at":"2026-09-22T10:30:00[+-]\d{2}:\d{2}"/)
  })

  // 文字列で入るのは時刻・セッションID・モード・鍵の名前・モデルの名前だけ
  // （docs/coding-standards.md「会話内容の扱い」）。会話の文面が混ざる余地が無いことを、
  // 行に出てくる文字列を数え上げて固定する。
  it("行に出てくる文字列は、鍵の名前とモデル・ツールの名前・セッションID・モード・時刻だけ", async () => {
    const log = createTokenUsageLog(NO_TASK, root())

    log.append(entry(at(10, 30)))
    await log.flush()

    const [line] = readFileSync(join(root(), "2026-09-22.jsonl"), "utf8").trimEnd().split("\n")
    const strings = [...(line ?? "").matchAll(/"([^"]*)"/g)].flatMap(([, value]) => value ?? [])
    expect(strings.filter((value) => value.startsWith("2026-09-22T")).length).toBe(1)
    // 同じ鍵の名前が内訳の持ち場ごとに繰り返す（`inputTokens` は合計と2つの持ち場に出る）ので、
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

describe("着手中のタスクとの結び付き", () => {
  it("口が着手中のタスクを返せば、行にタスクIDと段が入る", async () => {
    const log = createTokenUsageLog(
      createOpenTaskReader(claimsRunner([{ task: "job-7", stage: "accept" }]).run),
      root(),
    )

    log.append(entry(at(10, 30)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(record).toMatchObject({ v: 3, taskId: "job-7", stage: "accept" })
    expect(keysOf(record)).toEqual([
      "v",
      "at",
      "sessionId",
      "mode",
      "taskId",
      "stage",
      "models",
      "breakdown",
    ])
  })

  it("段が null なら、タスクIDだけが入る", async () => {
    const log = createTokenUsageLog(
      createOpenTaskReader(claimsRunner([{ task: "job-7", stage: null }]).run),
      root(),
    )

    log.append(entry(at(10, 30)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(record).toMatchObject({ taskId: "job-7" })
    expect(keysOf(record)).not.toContain("stage")
  })

  it("着手中のタスクが無ければ、どちらの欄も入らない", async () => {
    const log = createTokenUsageLog(createOpenTaskReader(claimsRunner([]).run), root())

    log.append(entry(at(10, 30)))
    await log.flush()

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).not.toContain("taskId")
    expect(keysOf(record)).not.toContain("stage")
  })

  it("着手中が2件あるときは、どのタスクか決められないので入れない", async () => {
    const log = createTokenUsageLog(
      createOpenTaskReader(
        claimsRunner([
          { task: "job-7", stage: "delegate" },
          { task: "job-8", stage: "ship" },
        ]).run,
      ),
      root(),
    )

    log.append(entry(at(10, 30)))
    await log.flush()

    expect(keysOf(readLines("2026-09-22.jsonl")[0])).not.toContain("taskId")
  })

  it("口が打てない・JSON が読めないときは、どちらの欄も入らない", async () => {
    const broken = createTokenUsageLog(
      createOpenTaskReader(() => "not json"),
      root(),
    )
    const unavailable = createTokenUsageLog(
      createOpenTaskReader(() => undefined),
      root(),
    )

    broken.append(entry(at(10, 30)))
    await broken.flush()
    unavailable.append(entry(at(10, 31)))
    await unavailable.flush()

    for (const record of readLines("2026-09-22.jsonl")) {
      expect(keysOf(record)).not.toContain("taskId")
      expect(keysOf(record)).not.toContain("stage")
    }
  })

  it("控えの時間（10秒）のあいだは口を打ち直さず、過ぎたら打ち直す", () => {
    const runner = claimsRunner([{ task: "job-7", stage: "delegate" }])
    const log = createTokenUsageLog(createOpenTaskReader(runner.run), root())

    log.append(entry(at(10, 30)))
    log.append(entry(at(10, 30) + 9_000))
    expect(runner.calls()).toBe(1)

    log.append(entry(at(10, 30) + 10_000))
    expect(runner.calls()).toBe(2)
  })

  it("失敗も控える", () => {
    let calls = 0
    const reader = createOpenTaskReader(() => {
      calls += 1
      return undefined
    })

    reader(at(10, 30))
    reader(at(10, 30) + 1_000)

    expect(calls).toBe(1)
  })
})

describe("readRange", () => {
  it("日またぎの境界: 期間に入る日のファイルだけを読む", async () => {
    const log = createTokenUsageLog(NO_TASK, root())
    log.append(entry(at(23, 59, 21)))
    log.append(entry(at(0, 0, 22)))
    log.append(entry(at(0, 0, 23)))
    await log.flush()

    const records = log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })

    expect(records.length).toBe(1)
    expect(records[0]?.at.slice(0, 10)).toBe("2026-09-22")
  })

  it("複数日にまたがる期間は、古い→新しい順に日をまたいで返す", async () => {
    const log = createTokenUsageLog(NO_TASK, root())
    log.append(entry(at(9, 0, 23)))
    log.append(entry(at(9, 0, 21)))
    log.append(entry(at(9, 0, 22)))
    await log.flush()

    const records = log.readRange({ startDate: "2026-09-21", endDate: "2026-09-23" })

    expect(records.map((record) => record.at.slice(0, 10))).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ])
  })

  // 中身だけを差し替えて mtime と size を戻す。開き直せば差し替えた中身が見え、開かなければ前の中身のまま。
  it("2回目の読みで (mtime, size) が同じファイルは開かず、変わったファイルは読み直す", async () => {
    const log = createTokenUsageLog(NO_TASK, root())
    log.append(entry(at(9, 0, 21)))
    log.append(entry(at(9, 0, 22)))
    await log.flush()
    const period = { startDate: "2026-09-21", endDate: "2026-09-22" }
    const unchangedPath = join(root(), "2026-09-21.jsonl")
    // 秒に丸めた時刻にしておくと、書き戻した mtime が桁落ちで食い違わない。
    const fixedSeconds = 1_790_000_000
    utimesSync(unchangedPath, fixedSeconds, fixedSeconds)
    expect(log.readRange(period).length).toBe(2)

    const before = statSync(unchangedPath)
    const replaced = readFileSync(unchangedPath, "utf8").replace('"work"', '"chat"')
    writeFileSync(unchangedPath, replaced)
    utimesSync(unchangedPath, fixedSeconds, fixedSeconds)
    expect(statSync(unchangedPath).size).toBe(before.size)

    expect(log.readRange(period).map((record) => record.mode)).toEqual(["work", "work"])

    log.append(entry(at(9, 1, 22)))
    await log.flush()
    expect(log.readRange(period).length).toBe(3)
  })

  it("記録が無い期間・置き場がまだ無いときは空の並びを返す（例外にならない）", () => {
    const log = createTokenUsageLog(NO_TASK, root())

    expect(log.readRange({ startDate: "2026-09-01", endDate: "2026-09-30" })).toEqual([])
  })

  // 版1・壊れた行は読まずに落とす（版1を残す価値が無いという判断。
  // まだ開発中で「内訳を空として読む」ことはしない）。1行ずつ検証するので、他の正しい行は
  // 生き残る。版2（`taskId`・`stage` の欄が無い）は読める。
  it("壊れた行や版1の行が混じっても落として続け、版2の行は欄なしで読める", () => {
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
    const version2Line = JSON.stringify({
      v: 2,
      at: "2026-09-22T09:03:00+09:00",
      sessionId: "claude-session-1",
      mode: "work",
      models: MODELS,
      breakdown: BREAKDOWN,
    })
    mkdirSync(root(), { recursive: true })
    appendFileSync(
      join(root(), "2026-09-22.jsonl"),
      `${validLine}\n${oldVersionLine}\nこれはJSONではない\n${missingKeyLine}\n${version2Line}\n\n`,
    )
    const log = createTokenUsageLog(NO_TASK, root())

    const records = log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })

    expect(records.map((record) => record.at)).toEqual([
      "2026-09-22T09:00:00+09:00",
      "2026-09-22T09:03:00+09:00",
    ])
    expect(records[1]).toMatchObject({ v: 2, taskId: undefined, stage: undefined })
  })
})
