import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readRememberedCharacter,
  readRememberedSessionDefault,
  writeRememberedCharacter,
  writeRememberedSessionDefault,
} from "../../../../src/server/session/adapter/remembered-default.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("remembered-default")

function statePath(): string {
  return join(dir(), "state.json")
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

// 起動時の初期パックの決め方（一覧に無い名前は既定へ落ちる／`TSUKUMO_CHARACTER` が
// 覚えた値より優先される、など）は `selectInitialCharacterPack` の契約で、
// そちらが持ち主として検査する。
// ここで確かめるのは `readRememberedCharacter` 自身の読み取りまで（このファイル冒頭の describe）。

describe("writeRememberedCharacter", () => {
  it("書いた値を readRememberedCharacter で読み返せる", () => {
    writeRememberedCharacter("tsukumo-spirit", statePath())
    expect(readRememberedCharacter(statePath())).toBe("tsukumo-spirit")
  })
})

// 新しいセッションの既定（モデル・effort・許可モード。docs/architecture/screen-design.md「設定の置き場所」）。壊れた
// state.json でも起動を止めないので、読めないときは同梱の既定へ畳む。
describe("readRememberedSessionDefault", () => {
  it("ファイルが無いときは同梱の既定", () => {
    expect(readRememberedSessionDefault(statePath())).toEqual(BUILTIN_SESSION_DEFAULT)
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

  // effort だけ、無い古い state.json でも他の2つを読める（欄が無い＝ effort を足す前に
  // 覚えたファイル）。model / permissionMode は今までどおり1組のまま——effort だけ optional
  // にしてある（`sessionDefaultStateSchema`）。
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

  // ディレクトリが無ければ作って書く／書き込み先が塞がっていても例外を投げないのは
  // `writeJsonFile` の契約で、
  // 2つの覚える口（character・sessionDefault）はどちらもその薄いラッパー。

  // 同じファイルを2つの口が書くので、片方の書き込みがもう片方を消さないことを見る
  // （書き込みはファイル丸ごとの置き換え。`writeRememberedSessionDefault`）。
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
})
