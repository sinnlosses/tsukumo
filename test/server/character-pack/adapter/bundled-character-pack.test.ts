import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { bundledFilePath } from "../../../../src/server/adapter/bundled-path.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"

// 同梱パックのうち実物の素材を使うものは、フィクスチャでなく
// リポジトリ上の実ファイルを読んで definition の読み取りとポートレートの存在を確かめる。
describe.each([
  { dirName: "chou", name: "帳" },
  { dirName: "shirasuzu", name: "白鈴" },
  { dirName: "andon", name: "行灯" },
  { dirName: "karakasa", name: "唐傘" },
  { dirName: "kureha", name: "くれは" },
])("同梱パック $dirName（characters/$dirName/）", ({ dirName, name }) => {
  it("character.json が読め、portraits と face に挙げたファイルが実在する", () => {
    const packDir = bundledFilePath("characters", dirName)
    const pack = readPackAt(packDir)

    expect(pack.definition?.name).toBe(name)
    expect(pack.definition?.portraits.default).toBe("default.png")
    expect(pack.definition?.face).toBe("face.png")

    const fileNames = [...Object.values(pack.definition?.portraits ?? {}), pack.definition?.face]
    for (const fileName of fileNames) {
      if (fileName === undefined) {
        continue
      }
      expect(existsSync(join(packDir, fileName))).toBe(true)
    }
  })
})
