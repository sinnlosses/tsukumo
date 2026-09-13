// キャラクターパックを読む。character.json とその立ち絵ファイルの実際の I/O はここに閉じる
// （「外に触るのはここだけ」の側。定義の解釈は src/protocol/character.ts の仕事。
// docs/design.md 5章「character-pack.ts」）。
//
// **素材の中身（SVG・画像のバイト列）は SessionState にも character-changed イベントにも乗せない。**
// ブラウザは `/character/<file>` から取りに行く（docs/design.md 4.1・5章）。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  type CharacterDefinition,
  classifyPortraitFile,
  parseCharacterDefinition,
  rasterMimeType,
  toCharacterInfo,
} from "../protocol/character.ts"
import { type SessionEvent } from "../protocol/session-event.ts"

const CHARACTER_DEFINITION_FILE_NAME = "character.json"

/**
 * キャラクター定義ディレクトリの既定値。自作で権利がクリーンな tsukumo-spirit を使う
 * （docs/requirements.md 4.4）。**tsukumo 自身の場所からの相対**で読む（bundledFilePath）。
 * develop/tasks.json とは違い、こちらは同梱物なので cwd には依存させない。
 */
export const DEFAULT_CHARACTER_DIR_RELATIVE_PATH: readonly string[] = [
  "characters",
  "tsukumo-spirit",
]

/** キャラクターパック1つ分。定義が無い・壊れているときは `definition` が undefined。 */
export type CharacterPack = {
  readonly dir: string
  readonly definition: CharacterDefinition | undefined
}

/**
 * character.json を読む。無い・壊れているときは `definition: undefined`（立ち絵なしに
 * フォールバック。呼び出し側はそのまま `characterChangedEvent` へ渡してよい）。
 */
export function readCharacterPack(dir: string): CharacterPack {
  const content = readOptionalFile(join(dir, CHARACTER_DEFINITION_FILE_NAME))
  return { dir, definition: content === undefined ? undefined : parseCharacterDefinition(content) }
}

/**
 * 起動時に1回流す `character-changed` イベント（docs/design.md 4.1・12章 段5）。中身は URL だけで、
 * 素材そのものは含まない。
 */
export function characterChangedEvent(pack: CharacterPack): SessionEvent {
  return { kind: "character-changed", ...toCharacterInfo(pack.definition) }
}

export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * `/character/<file>` が配ってよい1件を読む。**character.json の `portraits` に載っている
 * ファイル名だけ**を許す（vendor の allowlist と同じ考え方。パスから組み立てないので、
 * `..` を含む要求や定義に無い名前は自然に undefined になる）。呼び出し側
 * （src/infrastructure/view-server.ts）はこの結果をそのまま配るか、undefined なら404にする。
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
