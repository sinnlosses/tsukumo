import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { tsukumoHomeDir } from "../../../src/server/adapter/tsukumo-home.ts"
import { homeCharacterDir } from "../../../src/server/character-pack/adapter/character-pack.ts"
import { chatArchiveDir } from "../../../src/server/chat/adapter/chat-archive.ts"
import { chatSummaryDir } from "../../../src/server/chat/adapter/chat-summary.ts"
import { readRememberedCharacter } from "../../../src/server/session/adapter/remembered-default.ts"
import { tokenUsageDir } from "../../../src/server/token-usage/adapter/token-usage-log.ts"

// ホームの差し替え口（`TSUKUMO_HOME`）は `process.env` から読むので、ここだけは環境変数を
// 書き換えて確かめる（`bun test --isolate` はファイルごとに別プロセスなので、他のテストには
// 漏れない）。**本物の `~/.tsukumo/` には触らない** — 渡さないときの検査はパスの組み立てだけを
// 見て、ファイルは読み書きしない。

const HOME_ENV_NAME = "TSUKUMO_HOME"

let dir: string
let original: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-home-"))
  original = process.env[HOME_ENV_NAME]
  delete process.env[HOME_ENV_NAME]
})

afterEach(() => {
  if (original === undefined) {
    delete process.env[HOME_ENV_NAME]
  } else {
    process.env[HOME_ENV_NAME] = original
  }
  rmSync(dir, { recursive: true, force: true })
})

describe("TSUKUMO_HOME を渡すとホームがそこへ移る", () => {
  it("ホームそのものが渡した絶対パスになる", () => {
    process.env[HOME_ENV_NAME] = dir
    expect(tsukumoHomeDir()).toBe(dir)
  })

  it("ホームの下に並ぶ置き場（パック・雑談の要約・アーカイブ・トークンの記録）が揃って移る", () => {
    process.env[HOME_ENV_NAME] = dir

    expect(homeCharacterDir()).toBe(join(dir, "characters"))
    expect(chatSummaryDir()).toBe(join(dir, "chat-summary"))
    expect(chatArchiveDir()).toBe(join(dir, "chat-archive"))
    expect(tokenUsageDir()).toBe(join(dir, "token-usage"))
  })

  it("覚えたキャラクター（state.json）も移った先から読まれる", () => {
    process.env[HOME_ENV_NAME] = dir
    writeFileSync(join(dir, "state.json"), JSON.stringify({ character: "moved-pack" }))

    expect(readRememberedCharacter()).toBe("moved-pack")
  })

  it("相対パスは cwd 相対、絶対パスはそのまま（TSUKUMO_CHARACTER と同じ規則）", () => {
    process.env[HOME_ENV_NAME] = "tmp/home"
    expect(tsukumoHomeDir()).toBe(join(process.cwd(), "tmp", "home"))
  })

  it("`~` は展開しない（展開するのはシェルの仕事）", () => {
    process.env[HOME_ENV_NAME] = "~/elsewhere"
    expect(tsukumoHomeDir()).toBe(join(process.cwd(), "~", "elsewhere"))
  })
})

describe("TSUKUMO_HOME を渡さないときの置き場は今までと同じ", () => {
  it("未設定なら ~/.tsukumo とその下の4つの置き場", () => {
    const home = join(homedir(), ".tsukumo")

    expect(tsukumoHomeDir()).toBe(home)
    expect(homeCharacterDir()).toBe(join(home, "characters"))
    expect(chatSummaryDir()).toBe(join(home, "chat-summary"))
    expect(chatArchiveDir()).toBe(join(home, "chat-archive"))
    expect(tokenUsageDir()).toBe(join(home, "token-usage"))
  })

  it("空文字・空白だけのときも既定へ倒す（resolveViewPort と同じ扱い）", () => {
    process.env[HOME_ENV_NAME] = ""
    expect(tsukumoHomeDir()).toBe(join(homedir(), ".tsukumo"))

    process.env[HOME_ENV_NAME] = "   "
    expect(tsukumoHomeDir()).toBe(join(homedir(), ".tsukumo"))
  })
})
