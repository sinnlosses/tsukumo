import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import type * as NodeFs from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  appendJsonLine,
  createJsonLinesAppender,
  dateFileNames,
  dateFileNamesBetween,
  dateFilePath,
  readJsonLines,
  readValidLines,
} from "../../../../src/server/adapter/lib/jsonl.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

/** `node:fs` の呼び出しを数える状態で JSONL の口を読み込み直す（モジュールの記憶は共有なので、あとで戻す）。 */
async function loadCountingAppender(): Promise<{
  readonly createJsonLinesAppender: typeof createJsonLinesAppender
  readonly fsCalls: () => Record<string, number>
}> {
  vi.resetModules()
  const actual = await vi.importActual<typeof NodeFs>("node:fs")
  const spies = {
    mkdirSync: vi.fn<typeof actual.mkdirSync>(actual.mkdirSync),
    openSync: vi.fn<typeof actual.openSync>(actual.openSync),
    fstatSync: vi.fn<typeof actual.fstatSync>(actual.fstatSync),
    readSync: vi.fn<typeof actual.readSync>(actual.readSync),
    createWriteStream: vi.fn<typeof actual.createWriteStream>(actual.createWriteStream),
  }
  vi.doMock("node:fs", () => ({ ...actual, ...spies }))
  const loaded = await import("../../../../src/server/adapter/lib/jsonl.ts")
  return {
    createJsonLinesAppender: loaded.createJsonLinesAppender,
    fsCalls: () => ({
      mkdirSync: spies.mkdirSync.mock.calls.length,
      openSync: spies.openSync.mock.calls.length,
      fstatSync: spies.fstatSync.mock.calls.length,
      readSync: spies.readSync.mock.calls.length,
      createWriteStream: spies.createWriteStream.mock.calls.length,
    }),
  }
}

const dir = useTempDir("jsonl")

describe("createJsonLinesAppender", () => {
  afterEach(() => {
    vi.doUnmock("node:fs")
    vi.resetModules()
  })

  it("同じ日付への2回目以降は、ディレクトリ作成・開き直し・末尾の確認を打たない", async () => {
    const { createJsonLinesAppender: createCounted, fsCalls } = await loadCountingAppender()
    const appender = createCounted(join(dir(), "log"))

    appender.append("2026-01-01", [{ seq: 1 }])
    const afterFirst = fsCalls()
    appender.append("2026-01-01", [{ seq: 2 }, { seq: 3 }])
    appender.append("2026-01-01", [{ seq: 4 }])
    await appender.close()

    expect(afterFirst["createWriteStream"]).toBe(1)
    expect(fsCalls()).toEqual(afterFirst)
    expect(readJsonLines(join(dir(), "log", "2026-01-01.jsonl"))).toEqual([
      { seq: 1 },
      { seq: 2 },
      { seq: 3 },
      { seq: 4 },
    ])
  })

  it("日付が変わると前のファイルを閉じ、新しい日のファイルへ書く", async () => {
    const { createJsonLinesAppender: createCounted, fsCalls } = await loadCountingAppender()
    const root = join(dir(), "log")
    const appender = createCounted(root)

    appender.append("2026-01-01", [{ day: 1 }])
    appender.append("2026-01-02", [{ day: 2 }])
    await appender.flush()
    appender.append("2026-01-02", [{ day: 3 }])
    await appender.close()

    expect(fsCalls()["createWriteStream"]).toBe(2)
    expect(readJsonLines(join(root, "2026-01-01.jsonl"))).toEqual([{ day: 1 }])
    expect(readJsonLines(join(root, "2026-01-02.jsonl"))).toEqual([{ day: 2 }, { day: 3 }])
  })

  it("末尾が改行で終わっていないファイルには、開いたときに改行を補う", async () => {
    const root = join(dir(), "log")
    const path = dateFilePath(root, "2026-01-01")
    const appender = createJsonLinesAppender(root)
    writeFileSyncCreatingDir(root, path, '{"seq":1}\n{"se')

    appender.append("2026-01-01", [{ seq: 2 }])
    await appender.close()

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 2 }])
  })

  it("置き場を作れなくても例外を投げず、障害が消えた次の追記で書ける", async () => {
    const blocked = join(dir(), "blocked")
    writeFileSync(blocked, "")
    const appender = createJsonLinesAppender(blocked)

    expect(() => {
      appender.append("2026-01-01", [{ seq: 1 }])
    }).not.toThrow()
    rmSync(blocked)
    appender.append("2026-01-01", [{ seq: 2 }])
    await appender.close()

    expect(readJsonLines(join(blocked, "2026-01-01.jsonl"))).toEqual([{ seq: 2 }])
  })

  it("閉じたあとの追記は開き直して書く", async () => {
    const root = join(dir(), "log")
    const appender = createJsonLinesAppender(root)

    appender.append("2026-01-01", [{ seq: 1 }])
    await appender.close()
    appender.append("2026-01-01", [{ seq: 2 }])
    await appender.close()

    expect(readJsonLines(dateFilePath(root, "2026-01-01"))).toEqual([{ seq: 1 }, { seq: 2 }])
  })
})

function writeFileSyncCreatingDir(root: string, path: string, content: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(path, content)
}

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

  it("書けなくても例外を投げず、false を返す（常駐プロセスを落とさない）", () => {
    // 置き場の名前でファイルを作っておくと、その下にディレクトリを作れない。
    const blocked = join(dir(), "blocked")
    writeFileSync(blocked, "")
    const path = join(blocked, "2026-01-01.jsonl")

    expect(appendJsonLine(path, { seq: 1 })).toBe(false)
  })

  it("末尾が改行で終わっていない（書きかけで落ちた）ファイルには、改行を補ってから足す", () => {
    const path = join(dir(), "2026-01-01.jsonl")
    writeFileSync(path, '{"seq":1}\n{"se')

    expect(appendJsonLine(path, { seq: 2 })).toBe(true)

    expect(readJsonLines(path)).toEqual([{ seq: 1 }, { seq: 2 }])
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
