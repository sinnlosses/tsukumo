import { existsSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  TSUKUMO_HOME_PLACES,
  tsukumoHomeDir,
  tsukumoHomePath,
  type TsukumoHomePlace,
} from "../../../src/server/adapter/tsukumo-home.ts"
import { homeCharacterDir } from "../../../src/server/character-pack/adapter/character-pack.ts"
import { chatArchiveDir } from "../../../src/server/chat/adapter/chat-archive.ts"
import { createChatSummary } from "../../../src/server/chat/adapter/chat-summary.ts"
import { ENV_NAMES } from "../../../src/server/core/config.ts"
import { readRememberedCharacter } from "../../../src/server/session/adapter/remembered-default.ts"
import { tokenUsageDir } from "../../../src/server/token-usage/adapter/token-usage-log.ts"
import { characterPackName } from "../../fixture/character.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

// ホームの差し替え口（`TSUKUMO_HOME`）は `process.env` から読むので、ここだけは環境変数を
// 書き換えて確かめる（Vitest はテストファイルごとに別のワーカーで走らせるので、他のテストには
// 漏れない）。本物の `~/.tsukumo/` には触らない — 渡さないときの検査はパスの組み立てだけを
// 見て、ファイルは読み書きしない。

const dir = useTempDir("home")
let original: string | undefined

beforeEach(() => {
  original = process.env[ENV_NAMES.home.name]
  delete process.env[ENV_NAMES.home.name]
})

afterEach(() => {
  if (original === undefined) {
    delete process.env[ENV_NAMES.home.name]
  } else {
    process.env[ENV_NAMES.home.name] = original
  }
})

describe("TSUKUMO_HOME を渡すとホームがそこへ移る", () => {
  it("ホームそのものが渡した絶対パスになる", () => {
    process.env[ENV_NAMES.home.name] = dir()
    expect(tsukumoHomeDir()).toBe(dir())
  })

  it("ホームの下に並ぶ置き場（パック・あらすじ・会話のアーカイブ・トークンの記録）が揃って移る", () => {
    process.env[ENV_NAMES.home.name] = dir()

    expect(homeCharacterDir()).toBe(join(dir(), "characters"))
    expect(chatArchiveDir()).toBe(join(dir(), "chat-archive"))
    expect(tokenUsageDir()).toBe(join(dir(), "token-usage"))
  })

  it("あらすじは移った先の chat-summary の下へ書かれる", () => {
    process.env[ENV_NAMES.home.name] = dir()

    createChatSummary(characterPackName("moved-pack")).write(
      "架空の要約",
      [],
      "2026-09-20T10:00:00+09:00",
    )

    expect(existsSync(join(dir(), "chat-summary", "moved-pack.summary.json"))).toBe(true)
  })

  it("覚えたキャラクター（state.json）も移った先から読まれる", () => {
    process.env[ENV_NAMES.home.name] = dir()
    writeFileSync(join(dir(), "state.json"), JSON.stringify({ character: "moved-pack" }))

    expect(readRememberedCharacter()).toBe("moved-pack")
  })

  it("相対パスは cwd 相対、絶対パスはそのまま（TSUKUMO_CHARACTER と同じ規則）", () => {
    process.env[ENV_NAMES.home.name] = "tmp/home"
    expect(tsukumoHomeDir()).toBe(join(process.cwd(), "tmp", "home"))
  })

  it("`~` は展開しない（展開するのはシェルの仕事）", () => {
    process.env[ENV_NAMES.home.name] = "~/elsewhere"
    expect(tsukumoHomeDir()).toBe(join(process.cwd(), "~", "elsewhere"))
  })
})

describe("tsukumoHomePath", () => {
  it("全部の置き場がホームの下の表の実名になり、home を渡すとそれが根になる", () => {
    process.env[ENV_NAMES.home.name] = dir()

    for (const place of Object.keys(TSUKUMO_HOME_PLACES).filter(isPlace)) {
      const name = TSUKUMO_HOME_PLACES[place]
      expect(tsukumoHomePath(place)).toBe(join(dir(), name))
      expect(tsukumoHomePath(place, "/other")).toBe(join("/other", name))
    }
  })
})

function isPlace(key: string): key is TsukumoHomePlace {
  return key in TSUKUMO_HOME_PLACES
}

describe("TSUKUMO_HOME を渡さないときの置き場は今までと同じ", () => {
  it("未設定なら ~/.tsukumo とその下の3つの置き場", () => {
    const home = join(homedir(), ".tsukumo")

    expect(tsukumoHomeDir()).toBe(home)
    expect(homeCharacterDir()).toBe(join(home, "characters"))
    expect(chatArchiveDir()).toBe(join(home, "chat-archive"))
    expect(tokenUsageDir()).toBe(join(home, "token-usage"))
  })

  it("空文字・空白だけのときも既定へ倒す（resolveViewPort と同じ扱い）", () => {
    process.env[ENV_NAMES.home.name] = ""
    expect(tsukumoHomeDir()).toBe(join(homedir(), ".tsukumo"))

    process.env[ENV_NAMES.home.name] = "   "
    expect(tsukumoHomeDir()).toBe(join(homedir(), ".tsukumo"))
  })
})
