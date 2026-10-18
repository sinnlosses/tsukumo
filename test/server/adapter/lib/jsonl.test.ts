import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  appendJsonLine,
  dateFileNames,
  dateFileNamesBetween,
  dateFilePath,
  readJsonLines,
  readValidLines,
} from "../../../../src/server/adapter/lib/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("jsonl")

describe("appendJsonLine", () => {
  it("ディレクトリが無ければ作り、JSON を1行追記する", () => {
    const path = join(dir(), "nested", "2026-01-01.jsonl")

    appendJsonLine(path, { name: "架空の値", count: 1 })

    expect(readFileSync(path, "utf8")).toBe('{"name":"架空の値","count":1}\n')
  })

  it("2回目以降は末尾に積み重ねる", () => {
    const path = join(dir(), "2026-01-01.jsonl")

    appendJsonLine(path, { seq: 1 })
    appendJsonLine(path, { seq: 2 })

    expect(readFileSync(path, "utf8")).toBe('{"seq":1}\n{"seq":2}\n')
  })

  it("書けなくても例外を投げない（常駐プロセスを落とさない）", () => {
    // 置き場の名前でファイルを作っておくと、その下にディレクトリを作れない。
    const blocked = join(dir(), "blocked")
    writeFileSync(blocked, "")
    const path = join(blocked, "2026-01-01.jsonl")

    expect(() => appendJsonLine(path, { seq: 1 })).not.toThrow()
  })
})

describe("readJsonLines", () => {
  it("書いた順のまま JSON として読む", () => {
    const path = join(dir(), "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\n{"seq":2}\n{"seq":3}\n')

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }])
  })

  it("壊れた JSON の行は1行だけ読み飛ばす（他の行は生き残る）", () => {
    const path = join(dir(), "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\nこれはJSONではない\n{"seq":3}\n')

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 3 }])
  })

  it("空行は読み飛ばす", () => {
    const path = join(dir(), "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\n\n\n{"seq":2}\n')

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 2 }])
  })

  it("読めないファイルは空の並びを返す（例外にならない）", () => {
    expect(readJsonLines(join(dir(), "no-such-file.jsonl"))).toEqual([])
  })
})

describe("dateFilePath", () => {
  it("日付キーから dateFileNames が拾う形のファイル名のパスを作る", () => {
    const path = dateFilePath(dir(), "2026-01-02")
    writeFileSync(path, "")

    expect(path).toBe(join(dir(), "2026-01-02.jsonl"))
    expect(dateFileNames(dir())).toEqual(["2026-01-02.jsonl"])
  })
})

describe("readValidLines", () => {
  it("壊れた行とスキーマに通らない行を落とし、通った行の data だけを返す", () => {
    const path = join(dir(), "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\nこれはJSONではない\n{"seq":"x"}\n{"seq":3}\n')
    const schema = z.object({ seq: z.number() })

    expect(readValidLines(path, schema)).toEqual([{ seq: 1 }, { seq: 3 }])
  })
})

describe("dateFileNamesBetween", () => {
  it.each([
    { name: "両端を含む", from: "2026-01-02", to: "2026-01-03", expected: [2, 3] },
    { name: "from を省くと先頭から", from: undefined, to: "2026-01-02", expected: [1, 2] },
    { name: "to を省くと末尾まで", from: "2026-01-03", to: undefined, expected: [3, 4] },
    { name: "両方省くと全部", from: undefined, to: undefined, expected: [1, 2, 3, 4] },
  ])("$name", ({ from, to, expected }) => {
    for (const day of [4, 1, 3, 2]) {
      writeFileSync(join(dir(), `2026-01-0${day}.jsonl`), "")
    }

    expect(dateFileNamesBetween(dir(), from, to)).toEqual(
      expected.map((day) => `2026-01-0${day}.jsonl`),
    )
  })
})

describe("dateFileNames", () => {
  it("YYYY-MM-DD.jsonl の形のファイル名だけを古い→新しい順に並べる", () => {
    for (const name of ["2026-01-03.jsonl", "2026-01-01.jsonl", "2026-01-02.jsonl"]) {
      writeFileSync(join(dir(), name), "")
    }
    writeFileSync(join(dir(), "index.jsonl"), "")
    writeFileSync(join(dir(), "notes.txt"), "")

    expect(dateFileNames(dir())).toEqual([
      "2026-01-01.jsonl",
      "2026-01-02.jsonl",
      "2026-01-03.jsonl",
    ])
  })

  it("読めないディレクトリは空の並びを返す（例外にならない）", () => {
    expect(dateFileNames(join(dir(), "no-such-dir()"))).toEqual([])
  })
})
