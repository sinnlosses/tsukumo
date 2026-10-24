// 起動時の既定のパックが、ホームに写しがあるときは写しになること（`createCurrentCharacter` の組み立てを通して確かめる）。

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCurrentCharacter } from "../src/current-character.ts"
import { bundledFilePath } from "../src/server/adapter/bundled-path.ts"
import { DEFAULT_CHARACTER_DIR_RELATIVE_PATH } from "../src/server/character-pack/adapter/character-pack.ts"
import { ENV_NAMES, readConfig } from "../src/server/core/config.ts"
import { useTempDir } from "./fixture/temp-dir.ts"

const HOME_COPY_LABEL = "ホームの写しの精霊"
const HOME_COPY_PERSONA = "# 写し\n\n語尾に「なのじゃ」と付ける。"

const dir = useTempDir("current-character")

beforeEach(() => {
  vi.stubEnv(ENV_NAMES.home.name, join(dir(), "home"))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function writeHomeCopy(): void {
  const name = DEFAULT_CHARACTER_DIR_RELATIVE_PATH.at(-1) ?? ""
  const packDir = join(dir(), "home", "characters", name)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(
    join(packDir, "character.json"),
    JSON.stringify({
      name: HOME_COPY_LABEL,
      license: "テスト用に手で書いたもの",
      portraits: { default: "default.svg" },
    }),
  )
  writeFileSync(join(packDir, "persona.md"), HOME_COPY_PERSONA)
  writeFileSync(join(packDir, "default.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
}

function startedPack(environment: Record<string, string>): {
  readonly label: string | undefined
  readonly personaBody: string | undefined
} {
  const current = createCurrentCharacter(readConfig(environment), dir(), () => {})
  current.choose({ by: "initial" })
  const event = current.event()
  if (event.kind !== "character-changed") {
    throw new Error("character-changed でない")
  }
  const inUse = event.packs.find((pack) => pack.inUse)
  return { label: inUse?.label, personaBody: inUse?.personaBody }
}

const bundledDefaultDir = bundledFilePath(...DEFAULT_CHARACTER_DIR_RELATIVE_PATH)

describe("起動時の既定のパック", () => {
  it("ホームに写しがあり覚えた名前が無いときは、写しが配られる", () => {
    writeHomeCopy()
    const started = startedPack({})
    expect(started.label).toBe(HOME_COPY_LABEL)
    expect(started.personaBody).toContain("なのじゃ")
  })

  it("ホームに写しがあるとき、TSUKUMO_CHARACTER で同じ名前の同梱を指しても写しが配られる", () => {
    writeHomeCopy()
    const started = startedPack({ TSUKUMO_CHARACTER: bundledDefaultDir })
    expect(started.label).toBe(HOME_COPY_LABEL)
    expect(started.personaBody).toContain("なのじゃ")
  })

  it("ホームに写しが無いときは、同梱のパックが配られる", () => {
    const started = startedPack({})
    expect(started.label).not.toBe(HOME_COPY_LABEL)
    expect(started.label).toBeDefined()
  })
})
