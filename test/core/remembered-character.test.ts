import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readRememberedCharacter,
  writeRememberedCharacter,
} from "../../src/core/remembered-character.ts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-remembered-character-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function statePath(): string {
  return join(dir, "state.json")
}

describe("readRememberedCharacter", () => {
  it("ファイルが無いときは undefined", () => {
    expect(readRememberedCharacter(statePath())).toBeUndefined()
  })

  it("JSON が壊れているときは undefined", () => {
    writeFileSync(statePath(), "{ 壊れた")
    expect(readRememberedCharacter(statePath())).toBeUndefined()
  })

  it("形が違う JSON（character が無い）のときは undefined", () => {
    writeFileSync(statePath(), JSON.stringify({ other: "value" }))
    expect(readRememberedCharacter(statePath())).toBeUndefined()
  })
})

// `readRememberedCharacter` 自身はパックの一覧を知らない（一覧との突き合わせは呼び出し側
// ＝ src/cli.ts の `selectPack` の仕事）。ここでは cli.ts と同じ組み立て方
// （`packs.find(...) ?? defaultPack` / `config.character` があれば読みに行かない）を
// 使って、覚えた値の使われ方を確かめる。
describe("覚えた値の使いどころ（src/cli.ts の組み立て方を模して確かめる）", () => {
  type Pack = { readonly name: string }
  const defaultPack: Pack = { name: "tsukumo-spirit" }

  function selectInitialPack(configCharacter: string | undefined, packs: readonly Pack[]): Pack {
    if (configCharacter !== undefined) {
      return defaultPack
    }
    const remembered = readRememberedCharacter(statePath())
    return packs.find((pack) => pack.name === remembered) ?? defaultPack
  }

  it("指すパックが一覧に無いときは既定に落ちる", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "no-such-pack" }))

    const initialPack = selectInitialPack(undefined, [defaultPack, { name: "tsukumo" }])

    expect(initialPack).toEqual(defaultPack)
  })

  it("指すパックが一覧にあるときはその名前が使われる", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo" }))

    const initialPack = selectInitialPack(undefined, [defaultPack, { name: "tsukumo" }])

    expect(initialPack).toEqual({ name: "tsukumo" })
  })

  it("TSUKUMO_CHARACTER（環境変数）があるときは覚えた値より優先される", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo" }))

    const initialPack = selectInitialPack("characters/tsukumo-spirit", [
      defaultPack,
      { name: "tsukumo" },
    ])

    expect(initialPack).toEqual(defaultPack)
  })
})

describe("writeRememberedCharacter", () => {
  it("ディレクトリが無ければ作って書く", () => {
    const path = join(dir, "nested", "state.json")
    writeRememberedCharacter("tsukumo-spirit", path)

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ character: "tsukumo-spirit" })
  })

  it("書いた値を readRememberedCharacter で読み返せる", () => {
    writeRememberedCharacter("tsukumo-spirit", statePath())
    expect(readRememberedCharacter(statePath())).toBe("tsukumo-spirit")
  })

  it("書き込み先がディレクトリで塞がっていても例外を投げない", () => {
    const path = statePath()
    mkdirSync(path)

    expect(() => writeRememberedCharacter("tsukumo-spirit", path)).not.toThrow()
  })
})
