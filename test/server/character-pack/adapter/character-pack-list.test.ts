import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { listCharacterPacks } from "../../../../src/server/character-pack/adapter/character-pack.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("character-pack-list")

function writePack(root: string, name: string): void {
  const packDir = join(root, name)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(
    join(packDir, "character.json"),
    JSON.stringify({ portraits: { default: "a.svg" } }),
  )
}

describe("listCharacterPacks の名前の検査", () => {
  it("名前がパックの名前として通らないディレクトリは、定義があっても一覧に出ない", () => {
    const roots = { bundled: join(dir(), "bundled"), home: join(dir(), "home") }
    writePack(roots.bundled, "spirit")
    writePack(roots.home, "日本語の名前")
    writePack(roots.home, "with space")

    expect(listCharacterPacks(join(dir(), "cwd"), roots).map((pack) => pack.name)).toEqual([
      "spirit",
    ])
  })
})
