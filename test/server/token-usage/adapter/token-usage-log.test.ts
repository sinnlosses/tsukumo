import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createTokenUsageLog,
  resolveTaskPlace,
  type TaskPlace,
} from "../../../../src/server/token-usage/adapter/token-usage-log.ts"
import type { TokenUsageEntry } from "../../../../src/server/token-usage/core/token-usage.ts"
import {
  TOKEN_USAGE_FORMAT_VERSION,
  type ModelTokenUsage,
  type TurnUsageBreakdown,
} from "../../../../src/shared/token-usage/token-usage.ts"
import { keysOf, readJsonLines } from "../../../fixture/jsonl.ts"
import { runSubprocess } from "../../../fixture/subprocess.ts"
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

/** 着手の印の無い作業ツリー（`.git` だけがある）。台帳の置き場も同じ下に作る。 */
function worktree(): TaskPlace {
  const path = join(dir(), "worktree")
  mkdirSync(join(path, ".git"), { recursive: true })
  return { worktreeRoot: path, gitCommonDir: join(path, ".git") }
}

type Lap = { readonly task: string; readonly stage: string }

/** 台帳の1か月ぶん（`flow/<month>.jsonl`）に `lap` の出来事を並べる。 */
function writeFlow(place: TaskPlace, month: string, laps: readonly Lap[]): void {
  const flow = join(place.gitCommonDir, "task-workflow", "flow")
  mkdirSync(flow, { recursive: true })
  writeFileSync(
    join(flow, `${month}.jsonl`),
    laps.map((lap) => `${JSON.stringify({ event: "lap", edge: "start", ...lap })}\n`).join(""),
  )
}

/** `worktree()` の作業ツリーに着手の印を置き、台帳（既定は9月）の `lap` の出来事を並べる。 */
function claimTask(taskId: string, laps: readonly Lap[], month = "2026-09"): TaskPlace {
  const place = worktree()
  mkdirSync(join(place.worktreeRoot, ".tw", "local", "task-open-claims"), { recursive: true })
  writeFileSync(join(place.worktreeRoot, ".tw", "local", "task-open-claims", taskId), "")
  writeFlow(place, month, laps)
  return place
}

/** 指定の日のローカル 10:30 のエポックミリ秒（月・年をまたぐ場面用）。 */
function atDate(year: number, month: number, day: number): number {
  return Temporal.ZonedDateTime.from({
    year,
    month,
    day,
    hour: 10,
    minute: 30,
    second: 0,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

describe("createTokenUsageLog", () => {
  it("日付ごとのファイルに1行ずつ追記する", () => {
    const log = createTokenUsageLog(worktree(), root())

    log.append(entry(at(10, 30)))
    log.append(entry(at(10, 31)))
    log.append(entry(at(1, 5, 23)))

    expect(readdirSync(root()).toSorted()).toEqual(["2026-09-22.jsonl", "2026-09-23.jsonl"])
    expect(readLines("2026-09-22.jsonl").length).toBe(2)
    expect(readLines("2026-09-23.jsonl").length).toBe(1)
  })

  it("1行の鍵は版・日時・セッションID・モード・モデルごとの数・内訳で、日時は ISO 8601（オフセット付き）", () => {
    const log = createTokenUsageLog(worktree(), root())

    log.append(entry(at(10, 30)))

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
  it("行に出てくる文字列は、鍵の名前とモデル・ツールの名前・セッションID・モード・時刻だけ", () => {
    const log = createTokenUsageLog(worktree(), root())

    log.append(entry(at(10, 30)))

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
  it("着手の印があれば、行にタスクIDと台帳の最新の lap の段が入る", () => {
    const place = claimTask("job-7", [
      { task: "job-7", stage: "delegate" },
      { task: "job-8", stage: "ship" },
      { task: "job-7", stage: "accept" },
    ])
    const log = createTokenUsageLog(place, root())

    log.append(entry(at(10, 30)))

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

  it("台帳にそのタスクの lap が無ければ、タスクIDだけが入る", () => {
    const place = claimTask("job-7", [])
    const log = createTokenUsageLog(place, root())

    log.append(entry(at(10, 30)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(record).toMatchObject({ taskId: "job-7" })
    expect(keysOf(record)).not.toContain("stage")
  })

  it("着手の印が無ければ、どちらの欄も入らない", () => {
    const log = createTokenUsageLog(worktree(), root())

    log.append(entry(at(10, 30)))

    const [record] = readLines("2026-09-22.jsonl")
    expect(keysOf(record)).not.toContain("taskId")
    expect(keysOf(record)).not.toContain("stage")
  })

  it("着手の印が2件あるときは、どのタスクか決められないので入れない", () => {
    const place = claimTask("job-7", [{ task: "job-7", stage: "delegate" }])
    writeFileSync(join(place.worktreeRoot, ".tw", "local", "task-open-claims", "job-8"), "")
    const log = createTokenUsageLog(place, root())

    log.append(entry(at(10, 30)))

    expect(keysOf(readLines("2026-09-22.jsonl")[0])).not.toContain("taskId")
  })

  it("作業ツリーが決まらない（git の作業ツリーでない）ときは、どちらの欄も入らない", () => {
    const log = createTokenUsageLog(undefined, root())

    log.append(entry(at(10, 30)))

    expect(keysOf(readLines("2026-09-22.jsonl")[0])).not.toContain("taskId")
  })

  describe("月をまたぐ台帳", () => {
    const LAPS = [{ task: "job-7", stage: "accept" }]

    it("書く月のファイルがあっても、そのタスクの lap が無ければ前月を読む", () => {
      const place = claimTask("job-7", LAPS, "2026-09")
      writeFlow(place, "2026-10", [{ task: "job-8", stage: "ship" }])
      const log = createTokenUsageLog(place, root())

      log.append(entry(atDate(2026, 10, 1)))

      expect(readLines("2026-10-01.jsonl")[0]).toMatchObject({ stage: "accept" })
    })

    it("書く月に lap があれば、前月より書く月の段を使う", () => {
      const place = claimTask("job-7", LAPS, "2026-09")
      writeFlow(place, "2026-10", [{ task: "job-7", stage: "ship" }])
      const log = createTokenUsageLog(place, root())

      log.append(entry(atDate(2026, 10, 2)))

      expect(readLines("2026-10-02.jsonl")[0]).toMatchObject({ stage: "ship" })
    })

    it("年をまたぐ（1月に前年12月の段を読む）", () => {
      const place = claimTask("job-7", LAPS, "2026-12")
      const log = createTokenUsageLog(place, root())

      log.append(entry(atDate(2027, 1, 1)))

      expect(readLines("2027-01-01.jsonl")[0]).toMatchObject({ stage: "accept" })
    })
  })
})

describe("resolveTaskPlace", () => {
  it("git の作業ツリーでは、根と共有の git dir を返す", async () => {
    const repo = realpathSync(dir())
    await runSubprocess("git", ["init", "-q"], { cwd: repo })
    mkdirSync(join(repo, "src", "deep"), { recursive: true })

    const place = await resolveTaskPlace(join(repo, "src", "deep"))

    expect(place).toEqual({ worktreeRoot: repo, gitCommonDir: join(repo, ".git") })
  })

  it("リンクした作業ツリーでは、根は作業ツリー自身で、git dir は本体の .git", async () => {
    const repo = join(realpathSync(dir()), "main")
    mkdirSync(repo)
    await runSubprocess("git", ["init", "-q"], { cwd: repo })
    await runSubprocess(
      "git",
      [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "x",
      ],
      { cwd: repo },
    )
    const linked = join(realpathSync(dir()), "linked")
    await runSubprocess("git", ["worktree", "add", "-q", linked, "-b", "linked"], { cwd: repo })

    const place = await resolveTaskPlace(linked)

    expect(place).toEqual({ worktreeRoot: linked, gitCommonDir: join(repo, ".git") })
  })

  it("git の作業ツリーでなければ undefined", async () => {
    expect(await resolveTaskPlace(dir())).toBeUndefined()
  })
})

describe("readRange", () => {
  it("日またぎの境界: 期間に入る日のファイルだけを読む", () => {
    const log = createTokenUsageLog(worktree(), root())
    log.append(entry(at(23, 59, 21)))
    log.append(entry(at(0, 0, 22)))
    log.append(entry(at(0, 0, 23)))

    const records = log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })

    expect(records.length).toBe(1)
    expect(records[0]?.at.slice(0, 10)).toBe("2026-09-22")
  })

  it("複数日にまたがる期間は、古い→新しい順に日をまたいで返す", () => {
    const log = createTokenUsageLog(worktree(), root())
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
    const log = createTokenUsageLog(worktree(), root())

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
    const log = createTokenUsageLog(worktree(), root())

    const records = log.readRange({ startDate: "2026-09-22", endDate: "2026-09-22" })

    expect(records.map((record) => record.at)).toEqual([
      "2026-09-22T09:00:00+09:00",
      "2026-09-22T09:03:00+09:00",
    ])
    expect(records[1]).toMatchObject({ v: 2, taskId: undefined, stage: undefined })
  })
})
