import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readRememberedCharacter,
  readRememberedSessionDefault,
  readRememberedVisitEnabled,
  writeRememberedCharacter,
  writeRememberedSessionDefault,
  writeRememberedVisitEnabled,
} from "../../../src/server/adapter/remembered-default.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../src/shared/session-default.ts"
import { DEFAULT_VISIT_ENABLED } from "../../../src/shared/visit.ts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-remembered-default-"))
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
// ＝ src/current-character.ts の仕事）。ここでは同じ組み立て方
// （`packs.find(...) ?? defaultPack` / `config.character` があれば読みに行かない）を
// 使って、覚えた値の使われ方を確かめる。
describe("覚えた値の使いどころ（src/current-character.ts の組み立て方を模して確かめる）", () => {
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

// 新しいセッションの既定（モデル・effort・許可モード。docs/screen-design.md 13.6）。**壊れた
// state.json でも起動を止めない**ので、読めないときは同梱の既定へ畳む。
describe("readRememberedSessionDefault", () => {
  it("ファイルが無いときは同梱の既定（Opus・medium・auto）", () => {
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "opus",
      effort: "medium",
      permissionMode: "auto",
    })
  })

  it("JSON が壊れているときは同梱の既定", () => {
    writeFileSync(statePath(), "{ 壊れた")
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("欄が無いときは同梱の既定", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo-spirit" }))
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("知らないモデル名のときは同梱の既定", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "no-such-model", effort: "high", permissionMode: "plan" },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("「全部許す」が書かれていても受け付けない（同梱の既定に落ちる）", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "sonnet", effort: "high", permissionMode: "bypassPermissions" },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("既定の欄が壊れていても、覚えたキャラクターは読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({ character: "tsukumo", sessionDefault: { model: "no-such-model" } }),
    )

    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  // **effort だけ、無い古い state.json でも他の2つを読める**（欄が無い＝ effort を足す前に
  // 覚えたファイル）。model / permissionMode は今までどおり1組のまま——effort だけ optional
  // にしてある（src/server/adapter/remembered-default.ts の sessionDefaultStateSchema）。
  it("effort の無い古い state.json でも、モデル・許可モードは読めて effort だけ同梱の既定に落ちる", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({ sessionDefault: { model: "sonnet", permissionMode: "plan" } }),
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "medium",
      permissionMode: "plan",
    })
  })

  it("知らない effort が書かれているときは3つとも同梱の既定に落ちる", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "sonnet", effort: "no-such-effort", permissionMode: "plan" },
      }),
    )
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
  })

  it("effort が書かれているときはその値を読める", () => {
    writeFileSync(
      statePath(),
      JSON.stringify({
        sessionDefault: { model: "sonnet", effort: "high", permissionMode: "plan" },
      }),
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
  })
})

describe("writeRememberedSessionDefault", () => {
  it("書いた値を読み返せる", () => {
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan" },
      statePath(),
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
  })

  it("ディレクトリが無ければ作って書く", () => {
    const path = join(dir, "nested", "state.json")
    writeRememberedSessionDefault(
      { model: "haiku", effort: "low", permissionMode: "default" },
      path,
    )

    expect(readRememberedSessionDefault(path)).toEqual({
      model: "haiku",
      effort: "low",
      permissionMode: "default",
    })
  })

  it("書き込み先がディレクトリで塞がっていても例外を投げない", () => {
    const path = statePath()
    mkdirSync(path)

    expect(() =>
      writeRememberedSessionDefault(
        { model: "sonnet", effort: "high", permissionMode: "plan" },
        path,
      ),
    ).not.toThrow()
  })

  // **同じファイルを2つの口が書く**ので、片方の書き込みがもう片方を消さないことを見る
  // （書き込みはファイル丸ごとの置き換え。src/server/adapter/remembered-default.ts）。
  it("既定を書いても覚えたキャラクターは残る", () => {
    writeRememberedCharacter("tsukumo", statePath())
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan" },
      statePath(),
    )

    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
  })

  it("キャラクターを覚え直しても既定は残る", () => {
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan" },
      statePath(),
    )
    writeRememberedCharacter("kagami", statePath())

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
    expect(readRememberedCharacter(statePath())).toBe("kagami")
  })

  // ホームを分けて動かしたとき（`TSUKUMO_HOME`）に、別のホームの値が混ざらないこと
  // （置き場所の差し替えは `path` 引数1つで、読むのも書くのも同じ引数を通る）。
  it("別の置き場所の state.json とは混ざらない", () => {
    const otherPath = join(dir, "other-home", "state.json")
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan" },
      statePath(),
    )
    writeRememberedSessionDefault(
      { model: "haiku", effort: "low", permissionMode: "acceptEdits" },
      otherPath,
    )

    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
    expect(readRememberedSessionDefault(otherPath)).toEqual({
      model: "haiku",
      effort: "low",
      permissionMode: "acceptEdits",
    })
  })
})

// 歯車の「訪問」のオン・オフ（docs/screen-design.md 13.6）。覚え方は「新しいセッションの既定」と
// 同じ1ファイルだが、値そのものはブール1つだけ。**壊れた state.json でも起動を止めない**ので、
// 読めないときは同梱の既定（する = true）へ畳む。
describe("readRememberedVisitEnabled", () => {
  it("ファイルが無いときは同梱の既定（する）", () => {
    expect(readRememberedVisitEnabled(statePath())).toBe(DEFAULT_VISIT_ENABLED)
    expect(readRememberedVisitEnabled(statePath())).toBe(true)
  })

  it("JSON が壊れているときは同梱の既定", () => {
    writeFileSync(statePath(), "{ 壊れた")
    expect(readRememberedVisitEnabled(statePath())).toBe(true)
  })

  it("欄が無いときは同梱の既定", () => {
    writeFileSync(statePath(), JSON.stringify({ character: "tsukumo-spirit" }))
    expect(readRememberedVisitEnabled(statePath())).toBe(true)
  })

  it("真偽値でない値のときは同梱の既定", () => {
    writeFileSync(statePath(), JSON.stringify({ visitEnabled: "yes" }))
    expect(readRememberedVisitEnabled(statePath())).toBe(true)
  })

  it("書いた false を読み返せる", () => {
    writeFileSync(statePath(), JSON.stringify({ visitEnabled: false }))
    expect(readRememberedVisitEnabled(statePath())).toBe(false)
  })
})

describe("writeRememberedVisitEnabled", () => {
  it("書いた値を読み返せる", () => {
    writeRememberedVisitEnabled(false, statePath())
    expect(readRememberedVisitEnabled(statePath())).toBe(false)

    writeRememberedVisitEnabled(true, statePath())
    expect(readRememberedVisitEnabled(statePath())).toBe(true)
  })

  it("ディレクトリが無ければ作って書く", () => {
    const path = join(dir, "nested", "state.json")
    writeRememberedVisitEnabled(false, path)

    expect(readRememberedVisitEnabled(path)).toBe(false)
  })

  it("書き込み先がディレクトリで塞がっていても例外を投げない", () => {
    const path = statePath()
    mkdirSync(path)

    expect(() => writeRememberedVisitEnabled(false, path)).not.toThrow()
  })

  // **3つの欄を同じファイルが持つ**ので、どれか1つを書いてもほかの2つを消さないことを見る
  // （書き込みはファイル丸ごとの置き換え。src/server/adapter/remembered-default.ts）。
  it("訪問のオン・オフを書いても、覚えたキャラクターと既定は残る", () => {
    writeRememberedCharacter("tsukumo", statePath())
    writeRememberedSessionDefault(
      { model: "sonnet", effort: "high", permissionMode: "plan" },
      statePath(),
    )
    writeRememberedVisitEnabled(false, statePath())

    expect(readRememberedCharacter(statePath())).toBe("tsukumo")
    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })
    expect(readRememberedVisitEnabled(statePath())).toBe(false)
  })

  it("既定を書き直しても、覚えた訪問のオン・オフは残る", () => {
    writeRememberedVisitEnabled(false, statePath())
    writeRememberedSessionDefault(
      { model: "haiku", effort: "low", permissionMode: "auto" },
      statePath(),
    )

    expect(readRememberedVisitEnabled(statePath())).toBe(false)
    expect(readRememberedSessionDefault(statePath())).toEqual({
      model: "haiku",
      effort: "low",
      permissionMode: "auto",
    })
  })

  // ホームを分けて動かしたとき（`TSUKUMO_HOME`）に、別のホームの値が混ざらないこと。
  it("別の置き場所の state.json とは混ざらない", () => {
    const otherPath = join(dir, "other-home", "state.json")
    writeRememberedVisitEnabled(false, statePath())
    writeRememberedVisitEnabled(true, otherPath)

    expect(readRememberedVisitEnabled(statePath())).toBe(false)
    expect(readRememberedVisitEnabled(otherPath)).toBe(true)
  })
})
