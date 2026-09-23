import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  appendJsonLine,
  dateFileNames,
  readJsonLines,
} from "../../../../src/server/adapter/lib/jsonl.ts"

// 数も文面もすべて手で書いた架空のもの（会話の実物は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-jsonl-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("appendJsonLine", () => {
  it("ディレクトリが無ければ作り、JSON を1行追記する", () => {
    const path = join(dir, "nested", "2026-01-01.jsonl")

    appendJsonLine(path, { name: "架空の値", count: 1 })

    expect(readFileSync(path, "utf8")).toBe('{"name":"架空の値","count":1}\n')
  })

  it("2回目以降は末尾に積み重ねる", () => {
    const path = join(dir, "2026-01-01.jsonl")

    appendJsonLine(path, { seq: 1 })
    appendJsonLine(path, { seq: 2 })

    expect(readFileSync(path, "utf8")).toBe('{"seq":1}\n{"seq":2}\n')
  })

  it("書けなくても例外を投げない（常駐プロセスを落とさない）", () => {
    // 置き場の名前でファイルを作っておくと、その下にディレクトリを作れない。
    const blocked = join(dir, "blocked")
    writeFileSync(blocked, "")
    const path = join(blocked, "2026-01-01.jsonl")

    expect(() => appendJsonLine(path, { seq: 1 })).not.toThrow()
  })
})

describe("readJsonLines", () => {
  it("書いた順のまま JSON として読む", () => {
    const path = join(dir, "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\n{"seq":2}\n{"seq":3}\n')

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }])
  })

  it("壊れた JSON の行は1行だけ読み飛ばす（他の行は生き残る）", () => {
    const path = join(dir, "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\nこれはJSONではない\n{"seq":3}\n')

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 3 }])
  })

  it("空行は読み飛ばす", () => {
    const path = join(dir, "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\n\n\n{"seq":2}\n')

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 2 }])
  })

  it("読めないファイルは空の並びを返す（例外にならない）", () => {
    expect(readJsonLines(join(dir, "no-such-file.jsonl"))).toEqual([])
  })
})

describe("dateFileNames", () => {
  it("YYYY-MM-DD.jsonl の形のファイル名だけを古い→新しい順に並べる", () => {
    for (const name of ["2026-01-03.jsonl", "2026-01-01.jsonl", "2026-01-02.jsonl"]) {
      writeFileSync(join(dir, name), "")
    }
    writeFileSync(join(dir, "index.jsonl"), "")
    writeFileSync(join(dir, "notes.txt"), "")

    expect(dateFileNames(dir)).toEqual(["2026-01-01.jsonl", "2026-01-02.jsonl", "2026-01-03.jsonl"])
  })

  it("読めないディレクトリは空の並びを返す（例外にならない）", () => {
    expect(dateFileNames(join(dir, "no-such-dir"))).toEqual([])
  })
})
