// persona-memory の単体テストが共有する下ごしらえ（書き込み先のホーム・同梱パック・人格の読み出し）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REMEMBERED_SECTION_HEADING } from "../../src/shared/character-pack/persona-section.ts"
import { PLAUSIBLE_SVG } from "./bundled-character-pack.ts"
import { useTempDir } from "./temp-dir.ts"

export const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  portraits: { default: "default.svg" },
})

/** 同梱のパックが持っている人格（見出しと表を含む形）。 */
export const PERSONA = `# 架空の精霊

語尾に「なのじゃ」と付ける。

## 好きなもの

| もの | 度合い |
| ---- | ------ |
| 星   | とても |
`

/** 書き足す1行（キャラクター自身の設定。手で書いた架空のもの）。 */
export const LINE = "苦いお茶より甘いお茶が好き"

/** ファイルの最上位で呼ぶ。テストごとの一時ディレクトリの下に、書き込み先のホームと同梱側を用意する。 */
export function usePersonaMemoryHarness(name: string) {
  const dir = useTempDir(name)

  /** 書き込み先の親（本物の `~/.tsukumo/characters` の代わり）。 */
  function home(): string {
    return join(dir(), "home")
  }

  /** 同梱のパックを1つ置く（定義・人格・立ち絵1枚）。 */
  function writeBundledPack(packName: string, persona: string = PERSONA): string {
    const packDir = join(dir(), "bundled", packName)
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(packDir, "persona.md"), persona)
    writeFileSync(join(packDir, "default.svg"), PLAUSIBLE_SVG)
    return packDir
  }

  /** 書き込み先（ホーム）の `persona.md`。まだ無ければ undefined。 */
  function homePersona(packName: string): string | undefined {
    const path = join(home(), packName, "persona.md")
    return existsSync(path) ? readFileSync(path, "utf8") : undefined
  }

  return { dir, home, writeBundledPack, homePersona }
}

/** 節より前の部分（節が無ければ全文）。 */
export function beforeSection(persona: string): string {
  const at = persona.indexOf(REMEMBERED_SECTION_HEADING)
  return at < 0 ? persona : persona.slice(0, at)
}
