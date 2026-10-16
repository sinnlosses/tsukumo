// サブエージェントが E2E を全部流した回数の台帳を、一時ディレクトリの作業ツリーと git dir で確かめる。

import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  type E2eRunPlace,
  hasFreshSubagentMark,
  recordE2eRun,
  RUN_LIMIT,
  SUBAGENT_BASH_MARK_DIRECTORY,
} from "../../../scripts/shared/e2e-run-ledger.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const NOW_MS = 1_800_000_000_000
const STALE_AGE_MS = 600_000

describe("E2E の回数の台帳", () => {
  const tempDir = useTempDir("e2e-run-ledger")

  function newPlace(): E2eRunPlace {
    const place = { workRoot: join(tempDir(), "work"), gitDir: join(tempDir(), "git") }
    mkdirSync(place.workRoot, { recursive: true })
    mkdirSync(place.gitDir, { recursive: true })
    return place
  }

  function claimsDirectory(place: E2eRunPlace): string {
    return join(place.workRoot, ".tw", "local", "task-open-claims")
  }

  function claim(directory: string, taskId: string): void {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, taskId), "")
  }

  function markSubagentBash(place: E2eRunPlace, ageMs = 0): void {
    const directory = join(place.gitDir, SUBAGENT_BASH_MARK_DIRECTORY)
    mkdirSync(directory, { recursive: true })
    const path = join(directory, "toolu_fictional")
    writeFileSync(path, "")
    const seconds = (NOW_MS - ageMs) / 1000
    utimesSync(path, seconds, seconds)
  }

  function recordTimes(place: E2eRunPlace, times: number): readonly string[] {
    return Array.from({ length: times }, () => recordE2eRun(place, NOW_MS))
  }

  test("上限の回数までは数えて通し、その次を止める", () => {
    const place = newPlace()
    claim(claimsDirectory(place), "TASK-A")
    markSubagentBash(place)
    expect(recordTimes(place, RUN_LIMIT)).toEqual(
      Array.from({ length: RUN_LIMIT }, () => "counted"),
    )
    expect(recordE2eRun(place, NOW_MS)).toBe("over-limit")
    expect(recordE2eRun(place, NOW_MS)).toBe("over-limit")
  })

  test("着手の印は tw の控えの置き場の .tw/local/ から読む", () => {
    const place = newPlace()
    claim(claimsDirectory(place), "TASK-A")
    claim(join(place.gitDir, "task-open-claims"), "TASK-OLD")
    markSubagentBash(place)
    recordTimes(place, RUN_LIMIT)
    expect(recordE2eRun(place, NOW_MS)).toBe("over-limit")

    rmSync(join(claimsDirectory(place), "TASK-A"))
    expect(recordE2eRun(place, NOW_MS)).toBe("uncounted")
  })

  test(".tw/local/ が無く .tw/ 直下に旧い控えがあれば、.tw/ 直下の印を読む", () => {
    const place = newPlace()
    claim(join(place.workRoot, ".tw", "task-open-claims"), "TASK-A")
    markSubagentBash(place)
    expect(recordE2eRun(place, NOW_MS)).toBe("counted")
  })

  test(".tw/ 直下に旧いログしか無ければ、tw と同じく .tw/ でなく git dir の印を読む", () => {
    const place = newPlace()
    mkdirSync(join(place.workRoot, ".tw"), { recursive: true })
    writeFileSync(join(place.workRoot, ".tw", "task-verify.log"), "")
    writeFileSync(join(place.workRoot, ".tw", "task-verify.failed-20261016T000000Z.log"), "")
    claim(join(place.gitDir, "task-open-claims"), "TASK-A")
    markSubagentBash(place)
    expect(recordE2eRun(place, NOW_MS)).toBe("counted")
  })

  test(".tw/ に控えが無ければ、git dir の印を読む", () => {
    const place = newPlace()
    mkdirSync(join(place.workRoot, ".tw"), { recursive: true })
    writeFileSync(join(place.workRoot, ".tw", "config.toml"), "")
    claim(join(place.gitDir, "task-open-claims"), "TASK-A")
    markSubagentBash(place)
    expect(recordE2eRun(place, NOW_MS)).toBe("counted")
  })

  test("着手の印が無ければ数えない", () => {
    const place = newPlace()
    markSubagentBash(place)
    expect(recordTimes(place, RUN_LIMIT + 1)).toEqual(
      Array.from({ length: RUN_LIMIT + 1 }, () => "uncounted"),
    )
  })

  test("サブエージェントの Bash の印が無ければ数えない", () => {
    const place = newPlace()
    claim(claimsDirectory(place), "TASK-A")
    expect(recordTimes(place, RUN_LIMIT + 1)).toEqual(
      Array.from({ length: RUN_LIMIT + 1 }, () => "uncounted"),
    )
  })

  test("消し損ねて古くなったサブエージェントの印は、無いものとみなす", () => {
    const place = newPlace()
    claim(claimsDirectory(place), "TASK-A")
    markSubagentBash(place, STALE_AGE_MS)
    expect(hasFreshSubagentMark(place.gitDir, NOW_MS)).toBe(false)
    expect(recordE2eRun(place, NOW_MS)).toBe("uncounted")

    markSubagentBash(place, STALE_AGE_MS - 1000)
    expect(hasFreshSubagentMark(place.gitDir, NOW_MS)).toBe(true)
  })

  test("着手し直す（印を消して作り直す）と数が戻る", () => {
    const place = newPlace()
    const claimPath = join(claimsDirectory(place), "TASK-A")
    claim(claimsDirectory(place), "TASK-A")
    markSubagentBash(place)
    recordTimes(place, RUN_LIMIT)
    expect(recordE2eRun(place, NOW_MS)).toBe("over-limit")

    const before = statSync(claimPath).birthtimeMs
    do {
      rmSync(claimPath)
      claim(claimsDirectory(place), "TASK-A")
    } while (statSync(claimPath).birthtimeMs === before)
    expect(recordE2eRun(place, NOW_MS)).toBe("counted")
  })
})
