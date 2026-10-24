import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readCharacterPack } from "../../../../src/server/character-pack/adapter/character-pack.ts"
import { createPersonaMemory } from "../../../../src/server/chat/adapter/persona-memory.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const LINE = "苦いお茶より甘いお茶が好き"

const dir = useTempDir("persona-memory-atomic")

describe("persona.md の置き換え", () => {
  it("途中で書けなくなっても、元の persona.md はそのまま残り、一時ファイルも残らない", () => {
    const bundled = join(dir(), "bundled")
    mkdirSync(bundled, { recursive: true })
    writeFileSync(
      join(bundled, "character.json"),
      JSON.stringify({
        name: "架空の精霊",
        license: "テスト用に手で書いたもの",
        portraits: { default: "default.svg" },
      }),
    )
    writeFileSync(join(bundled, "persona.md"), "# 架空の精霊\n")
    writeFileSync(join(bundled, "default.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const home = join(dir(), "home")
    const pack = readCharacterPack(bundled)
    const memory = createPersonaMemory(pack, dir(), home)
    memory.remember(LINE)
    memory.finishTurn()
    const packDir = join(home, pack.name)
    const before = readFileSync(join(packDir, "persona.md"), "utf8")

    chmodSync(packDir, 0o500)
    try {
      expect(memory.forget(LINE)).toBe("failed")
    } finally {
      chmodSync(packDir, 0o700)
    }

    expect(readFileSync(join(packDir, "persona.md"), "utf8")).toBe(before)
    expect(readdirSync(packDir).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })
})
