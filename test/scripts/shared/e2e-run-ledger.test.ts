// サブエージェントが E2E を全部流した回数の台帳を、一時ディレクトリの作業ツリーと git dir で確かめる。
// 着手の同一性の鍵は口（`tw status --claims`）の代役で渡す。

import { cpSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  type E2eRunPlace,
  hasFreshSubagentMark,
  recordE2eRun,
  RUN_LIMIT,
} from "../../../scripts/shared/e2e-run-ledger.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const SUBAGENT_BASH_MARK_DIRECTORY = "subagent-bash"
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

  function markSubagentBash(place: E2eRunPlace, ageMs = 0): void {
    const directory = join(place.gitDir, SUBAGENT_BASH_MARK_DIRECTORY)
    mkdirSync(directory, { recursive: true })
    const path = join(directory, "toolu_fictional")
    writeFileSync(path, "")
    const seconds = (NOW_MS - ageMs) / 1000
    utimesSync(path, seconds, seconds)
  }

  const claimA = () => "2026-10-21T17:18:11Z"

  function recordTimes(
    place: E2eRunPlace,
    times: number,
    readClaimKey: (workRoot: string) => string | undefined = claimA,
  ): readonly string[] {
    return Array.from({ length: times }, () => recordE2eRun(place, NOW_MS, readClaimKey))
  }

  test("上限の回数までは数えて通し、その次を止める", () => {
    const place = newPlace()
    markSubagentBash(place)
    expect(recordTimes(place, RUN_LIMIT)).toEqual(
      Array.from({ length: RUN_LIMIT }, () => "counted"),
    )
    expect(recordE2eRun(place, NOW_MS, claimA)).toBe("over-limit")
    expect(recordE2eRun(place, NOW_MS, claimA)).toBe("over-limit")
  })

  test("台帳は {鍵, 回数} の JSON で、一時ファイルを残さない", () => {
    const place = newPlace()
    markSubagentBash(place)
    recordTimes(place, 2)

    expect(JSON.parse(readFileSync(join(place.gitDir, "e2e-full-runs"), "utf8"))).toEqual({
      key: "2026-10-21T17:18:11Z",
      count: 2,
    })
    expect(readdirSync(place.gitDir).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })

  test("鍵が変わる（着手し直す）と数が戻る", () => {
    const place = newPlace()
    markSubagentBash(place)
    recordTimes(place, RUN_LIMIT)
    expect(recordE2eRun(place, NOW_MS, claimA)).toBe("over-limit")

    expect(recordE2eRun(place, NOW_MS, () => "2026-10-22T09:00:00Z")).toBe("counted")
  })

  test("印のファイルを別の場所へ写しても、回数は戻らない", () => {
    const place = newPlace()
    markSubagentBash(place)
    recordTimes(place, RUN_LIMIT)

    cpSync(join(place.gitDir, SUBAGENT_BASH_MARK_DIRECTORY), join(tempDir(), "copy"), {
      recursive: true,
    })
    expect(recordE2eRun(place, NOW_MS, claimA)).toBe("over-limit")
  })

  test("口が鍵を返さない（打てない・読めない・1件でない）なら数えない", () => {
    const place = newPlace()
    markSubagentBash(place)
    expect(recordTimes(place, RUN_LIMIT + 1, () => undefined)).toEqual(
      Array.from({ length: RUN_LIMIT + 1 }, () => "uncounted"),
    )
  })

  test("台帳が壊れていれば0から数える", () => {
    const place = newPlace()
    markSubagentBash(place)
    writeFileSync(join(place.gitDir, "e2e-full-runs"), "key\nx\nx\n")
    expect(recordE2eRun(place, NOW_MS, claimA)).toBe("counted")
  })

  test("サブエージェントの Bash の印が無ければ数えない", () => {
    const place = newPlace()
    expect(recordTimes(place, RUN_LIMIT + 1)).toEqual(
      Array.from({ length: RUN_LIMIT + 1 }, () => "uncounted"),
    )
  })

  test("消し損ねて古くなったサブエージェントの印は、無いものとみなす", () => {
    const place = newPlace()
    markSubagentBash(place, STALE_AGE_MS)
    expect(hasFreshSubagentMark(place.gitDir, NOW_MS)).toBe(false)
    expect(recordE2eRun(place, NOW_MS, claimA)).toBe("uncounted")

    markSubagentBash(place, STALE_AGE_MS - 1000)
    expect(hasFreshSubagentMark(place.gitDir, NOW_MS)).toBe(true)
  })
})
