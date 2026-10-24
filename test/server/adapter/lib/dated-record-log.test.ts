import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createDatedRecordLog } from "../../../../src/server/adapter/lib/dated-record-log.ts"
import { appendJsonLine } from "../../../../src/server/adapter/lib/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("dated-record-log")

const schema = z.object({ seq: z.number() })

function root(): string {
  return join(dir(), "records")
}

function create(retentionDays: number | undefined = undefined) {
  return createDatedRecordLog({ schema, retentionDays }, root())
}

function touch(name: string): void {
  mkdirSync(root(), { recursive: true })
  writeFileSync(join(root(), name), '{"seq":1}\n')
}

const EVERYTHING = { startDate: undefined, endDate: undefined }

describe("createDatedRecordLog", () => {
  it("追記した行を日付の範囲で読み戻し、範囲の外の日は開かない", async () => {
    const log = create()
    log.append("2026-10-01", [{ seq: 1 }])
    log.append("2026-10-02", [{ seq: 2 }])
    log.append("2026-10-03", [{ seq: 3 }])
    await log.close()

    expect(log.readRange(EVERYTHING)).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }])
    expect(log.readRange({ startDate: "2026-10-02", endDate: "2026-10-02" })).toEqual([{ seq: 2 }])
  })

  it("schema を通らない行と壊れた行は1行ずつ落とす", () => {
    mkdirSync(root(), { recursive: true })
    writeFileSync(
      join(root(), "2026-10-01.jsonl"),
      `${JSON.stringify({ seq: 1 })}\n{broken\n${JSON.stringify({ seq: "x" })}\n${JSON.stringify({ seq: 2 })}\n`,
    )

    expect(create().readRange(EVERYTHING)).toEqual([{ seq: 1 }, { seq: 2 }])
  })

  it("ディレクトリが無ければ空を返し、置き場も作らない", () => {
    expect(create().readRange(EVERYTHING)).toEqual([])
    expect(existsSync(root())).toBe(false)
  })

  it("ファイルが変わらない間は読み直さず、追記されたら読み直す", () => {
    const log = create()
    const path = join(root(), "2026-10-01.jsonl")
    appendJsonLine(path, { seq: 1 })
    const first = log.readRange(EVERYTHING)

    expect(log.readRange(EVERYTHING)[0]).toBe(first[0])

    appendJsonLine(path, { seq: 2 })
    expect(log.readRange(EVERYTHING)).toEqual([{ seq: 1 }, { seq: 2 }])
  })

  describe("pruneExpired", () => {
    it("保持の日数を過ぎた日付のファイルだけを消す", () => {
      touch("2026-09-30.jsonl")
      touch("2026-10-01.jsonl")
      touch("2026-10-04.jsonl")

      create(3).pruneExpired("2026-10-04")

      expect(existsSync(join(root(), "2026-09-30.jsonl"))).toBe(false)
      expect(existsSync(join(root(), "2026-10-01.jsonl"))).toBe(true)
      expect(existsSync(join(root(), "2026-10-04.jsonl"))).toBe(true)
    })

    it("日付の名前でないファイルには触らない", () => {
      touch("2020-01-01.jsonl")
      touch("notes.jsonl")
      touch("2020-01-01.txt")
      utimesSync(join(root(), "notes.jsonl"), 0, 0)

      create(3).pruneExpired("2026-10-04")

      expect(existsSync(join(root(), "2020-01-01.jsonl"))).toBe(false)
      expect(existsSync(join(root(), "notes.jsonl"))).toBe(true)
      expect(existsSync(join(root(), "2020-01-01.txt"))).toBe(true)
    })

    it("保持の日数が無ければ何も消さない", () => {
      touch("2020-01-01.jsonl")

      create(undefined).pruneExpired("2026-10-04")

      expect(existsSync(join(root(), "2020-01-01.jsonl"))).toBe(true)
    })

    it("置き場が無くても投げない", () => {
      expect(() => {
        create(3).pruneExpired("2026-10-04")
      }).not.toThrow()
    })
  })
})
