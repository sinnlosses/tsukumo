// キャラクターパックを読む。character.json とその立ち絵ファイルの実際の I/O はここに閉じる
// （「外に触るのはここだけ」の側。定義の解釈は src/protocol/character.ts の仕事。
// docs/design.md 5章「character-pack.ts」）。
//
// **素材の中身（SVG・画像のバイト列）は SessionState にも character-changed イベントにも乗せない。**
// ブラウザは `/character/<file>` から取りに行く（docs/design.md 4.1・5章）。

import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join } from "node:path"

import {
  type CharacterDefinition,
  type CharacterPackChoice,
  classifyPortraitFile,
  parseCharacterDefinition,
  rasterMimeType,
  toCharacterInfo,
} from "../protocol/character.ts"
import { type SessionEvent } from "../protocol/session-event.ts"
import { bundledFilePath } from "./bundled-path.ts"

const CHARACTER_DEFINITION_FILE_NAME = "character.json"

/** 人格のファイル名。パックの中に無くてもよい（append が空になるだけ）。 */
const PERSONA_FILE_NAME = "persona.md"

/** パックの置き場の名前。同梱側も起動先側も、この名前のディレクトリの下を見る。 */
const CHARACTER_DIR_NAME = "characters"

/**
 * 起動先（cwd）で見るパックの置き場。**利用者が自分で用意した素材の置き場**で、
 * `.gitignore` 済み（docs/requirements.md 4.4）。同梱側と違い、ここは
 * `characters/local` そのものが1つのパック。
 */
const LOCAL_PACK_NAME = "local"

/**
 * キャラクター定義ディレクトリの既定値。自作で権利がクリーンな tsukumo-spirit を使う
 * （docs/requirements.md 4.4）。**tsukumo 自身の場所からの相対**で読む（bundledFilePath）。
 * develop/tasks.json とは違い、こちらは同梱物なので cwd には依存させない。
 */
export const DEFAULT_CHARACTER_DIR_RELATIVE_PATH: readonly string[] = [
  "characters",
  "tsukumo-spirit",
]

/** キャラクターパック1つ分。定義・人格が無い・壊れているときはそれぞれ undefined。 */
export type CharacterPack = {
  /** ディレクトリ名（`switch-character` の鍵。`docs/design.md` 7章）。 */
  readonly name: string
  readonly dir: string
  readonly definition: CharacterDefinition | undefined
  /**
   * 人格（`persona.md` の全文）。**無いパックでも起動する**（`systemPrompt` の append が
   * レポートの記法だけになる。docs/design.md 7章）。
   */
  readonly persona: string | undefined
}

/**
 * パック1つを読む（`character.json` と `persona.md`）。無い・壊れているときは
 * `definition: undefined`（立ち絵なしにフォールバック。呼び出し側はそのまま
 * `characterChangedEvent` へ渡してよい）。
 */
export function readCharacterPack(dir: string): CharacterPack {
  const content = readOptionalFile(join(dir, CHARACTER_DEFINITION_FILE_NAME))
  return {
    name: basename(dir),
    dir,
    definition: content === undefined ? undefined : parseCharacterDefinition(content),
    persona: readOptionalFile(join(dir, PERSONA_FILE_NAME)),
  }
}

/**
 * 切り替えられるパックを列挙する（docs/design.md 7章）。探し先は2箇所:
 *
 * 1. **tsukumo 同梱の `characters/`** の各ディレクトリ（`character.json` があるものだけ）
 * 2. **起動先の `characters/local/`**（利用者が自分で用意した素材）
 *
 * **同名は起動先が勝つ**（同梱の既定より、そのプロジェクトで用意したものを優先する）。
 * 読めないディレクトリは黙って飛ばす（一覧が短くなるだけで、起動は止めない。
 * docs/coding-standards.md「エラーハンドリング」）。
 *
 * `bundledRoot` は同梱の置き場（既定は tsukumo 自身の `characters/`。`readFakeScript` の
 * `path` と同じで、差し替えられるのは置き場所だけ）。
 */
export function listCharacterPacks(
  cwd: string,
  bundledRoot: string = bundledFilePath(CHARACTER_DIR_NAME),
): readonly CharacterPack[] {
  const bundled = listPackDirs(bundledRoot)
  const local = join(cwd, CHARACTER_DIR_NAME, LOCAL_PACK_NAME)
  const dirs = [...bundled, ...(hasDefinition(local) ? [local] : [])]

  // 同名は後勝ち。起動先を後ろに置いてあるので、これがそのまま「起動先が勝つ」になる。
  const packs = dirs.map(readCharacterPack)
  return [...new Map(packs.map((pack) => [pack.name, pack] as const)).values()]
}

/** 一覧を画面に出す形（`<select>` の選択肢）にする。並びは {@link listCharacterPacks} のまま。 */
export function toCharacterPackChoices(
  packs: readonly CharacterPack[],
): readonly CharacterPackChoice[] {
  return packs.map((pack) => ({ name: pack.name, label: pack.definition?.name ?? pack.name }))
}

/**
 * `systemPrompt` の append を組み立てる。**人格 → レポートの記法の順**にするのは、記法
 * （機械的な決まりごと）を後ろに置いて人格の文章に埋もれさせないため。人格が無いパックでは
 * 記法だけになる（docs/design.md 7章）。
 */
export function buildSystemPromptAppend(pack: CharacterPack, reportNotation: string): string {
  return [pack.persona, reportNotation]
    .filter((part) => part !== undefined && part.trim() !== "")
    .join("\n\n")
}

/**
 * 起こしたとき・`switch-character` で起こし直したときに1回流す `character-changed` イベント
 * （docs/design.md 4.1・7章）。中身は URL と選択肢だけで、素材そのものは含まない。
 */
export function characterChangedEvent(
  pack: CharacterPack,
  packs: readonly CharacterPackChoice[],
): SessionEvent {
  return { kind: "character-changed", ...toCharacterInfo(pack.definition, pack.name), packs }
}

export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * `/character/<file>` が配ってよい1件を読む。**character.json の `portraits` に載っている
 * ファイル名だけ**を許す（vendor の allowlist と同じ考え方。パスから組み立てないので、
 * `..` を含む要求や定義に無い名前は自然に undefined になる）。呼び出し側
 * （src/core/server.ts）はこの結果をそのまま配るか、undefined なら404にする。
 */
export function readCharacterPackFile(
  pack: CharacterPack,
  fileName: string,
): CharacterAssetFile | undefined {
  if (!characterPackFileNames(pack).includes(fileName)) {
    return undefined
  }

  const contentType = characterAssetContentType(fileName)
  if (contentType === undefined) {
    return undefined
  }

  const content = readOptionalBinaryFile(join(pack.dir, fileName))
  return content === undefined ? undefined : { contentType, content }
}

/** character.json の `portraits` に載っているファイル名の一覧（重複なし）。 */
function characterPackFileNames(pack: CharacterPack): readonly string[] {
  if (pack.definition === undefined) {
    return []
  }

  const fileNames = Object.values(pack.definition.portraits).filter(isDefined)
  return [...new Set(fileNames)]
}

function characterAssetContentType(fileName: string): string | undefined {
  const kind = classifyPortraitFile(fileName)
  if (kind === "svg") {
    return "image/svg+xml; charset=utf-8"
  }
  return kind === "raster" ? rasterMimeType(fileName) : undefined
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined
}

/**
 * 置き場の直下で、`character.json` を持つディレクトリだけを返す。読めなければ空。
 * **名前順に並べる**（`readdirSync` の順はファイルシステム任せで、`<select>` の並びが
 * 環境によって変わってしまうため）。
 */
function listPackDirs(root: string): readonly string[] {
  let names: readonly string[]
  try {
    names = readdirSync(root)
  } catch {
    return []
  }

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(root, name))
    .filter(hasDefinition)
}

function hasDefinition(dir: string): boolean {
  try {
    return statSync(join(dir, CHARACTER_DEFINITION_FILE_NAME)).isFile()
  } catch {
    return false
  }
}

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function readOptionalBinaryFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}
