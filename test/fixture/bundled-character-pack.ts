import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// フィクスチャは手で書いた架空のパック（実物の素材・人格は使わない）。
export const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  portraits: { default: "default.svg", thinking: "thinking.svg", proud: "proud.svg" },
})

export const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
export const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

/** 同梱のパックを `root` の下に `name` で1つ置く（定義・人格・立ち絵3枚）。 */
export function writeBundledPackUnder(root: string, name: string): string {
  const packDir = join(root, name)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, "character.json"), DEFINITION_JSON)
  writeFileSync(join(packDir, "persona.md"), PERSONA)
  for (const fileName of ["default.svg", "thinking.svg", "proud.svg"]) {
    writeFileSync(join(packDir, fileName), PLAUSIBLE_SVG)
  }
  return packDir
}
