// キャラクター定義（character.json）と立ち絵を読む。「外に触るのはここだけ」の側で、
// character.json・画像ファイルの実際の読み取りに閉じる（解釈は src/domain/character.ts の仕事）。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  type CharacterDefinition,
  classifyPortraitFile,
  isPlausibleSvgMarkup,
  parseCharacterDefinition,
  rasterMimeType,
  resolveOutfitAccent,
  resolvePortraitFile,
} from "../domain/character.ts"
import { type Expression, expressionLabel, type Outfit } from "../domain/expression.ts"

const CHARACTER_DEFINITION_FILE_NAME = "character.json"
// character.json が無い・壊れている、または name が無いときの立ち絵 alt テキストの既定名。
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

// キャラクター定義ディレクトリの既定値。自作で権利がクリーンな tsukumo-spirit を使う
// （docs/requirements.md 4.4）。**tsukumo 自身の場所からの相対**で読む（bundledFilePath）。
// develop/tasks.json とは違い、こちらは同梱物なので cwd には依存させない。
export const DEFAULT_CHARACTER_DIR_RELATIVE_PATH: readonly string[] = [
  "characters",
  "tsukumo-spirit",
]
// 利用者が用意した素材（`characters/local/` など。characters/README.md）を使いたいときに
// 直接指すための環境変数。
export const CHARACTER_DIR_ENV_NAME = "TSUKUMO_CHARACTER_DIR"

/**
 * 立ち絵の画像ソース。**SVG はファイルの中身をそのまま埋め込む**（インライン）。それ以外
 * （ラスタ画像）は data URI にする。`src/presentation/view.ts` の `CharacterPortraitSource` と
 * 同じ形だが、**presentation を import しない**（原則3。session-driver.ts が
 * `PERMISSION_MODES` を presentation 側と別に持つのと同じ理由）。
 */
export type CharacterPortraitSource =
  | { readonly kind: "svg"; readonly svgMarkup: string }
  | { readonly kind: "image"; readonly dataUri: string }

/** キャラビューに渡せる形にした、キャラクター定義と立ち絵。 */
export type CharacterAssets = {
  /** 素材が無い・読めないときは undefined。呼び出し側は吹き出しだけで成立させる。 */
  readonly portrait: CharacterPortraitSource | undefined
  /** 立ち絵の CSS 変数 `--outfit-accent` に渡す差し色。 */
  readonly outfitAccent: string | undefined
  /** 立ち絵の alt / aria-label。 */
  readonly altText: string
}

/**
 * キャラクター定義（character.json）を読む。無い・壊れているときは undefined を返し、
 * 呼び出し側は立ち絵なし・表情は `default` だけにフォールバックする。
 */
export function readCharacterDefinition(characterDir: string): CharacterDefinition | undefined {
  const content = readOptionalFile(join(characterDir, CHARACTER_DEFINITION_FILE_NAME))
  return content === undefined ? undefined : parseCharacterDefinition(content)
}

/**
 * キャラクター定義と立ち絵を読み、キャラビューに渡せる形にする。character.json が無い・
 * 壊れている、表情に対応する立ち絵が無い、画像ファイル自体が読めない・種類を判定できない、
 * といったときはすべて `portrait: undefined` に落ちて、呼び出し側（buildCharacterBody）が
 * 吹き出しだけの表示にフォールバックする（docs/requirements.md 4.2「フォールバック」）。
 */
export function readCharacterAssets(
  characterDir: string,
  expression: Expression,
  outfit: Outfit,
): CharacterAssets {
  const definition = readCharacterDefinition(characterDir)

  if (definition === undefined) {
    return {
      portrait: undefined,
      outfitAccent: undefined,
      altText: characterAltText(undefined, expression),
    }
  }

  const outfitAccent = resolveOutfitAccent(definition, outfit)
  const portraitFile = resolvePortraitFile(definition, expression)
  const altText = characterAltText(definition.name, expression)

  if (portraitFile === undefined) {
    return { portrait: undefined, outfitAccent, altText }
  }

  return { portrait: readPortraitSource(join(characterDir, portraitFile)), outfitAccent, altText }
}

function characterAltText(name: string | undefined, expression: Expression): string {
  return `${name ?? DEFAULT_CHARACTER_ALT_NAME}（${expressionLabel(expression)}）`
}

/**
 * 立ち絵1件を読む。SVG はファイルの中身をそのまま持ち出し、ラスタ画像はバイト列を
 * data URI にして持ち出す（view-server.ts がファイルを配る経路を増やさないため。
 * 会話内容と違って立ち絵は毎回同じ小さいファイルなので、都度読み直すコストは無視できる）。
 * 拡張子が SVG でもラスタでもない、中身が SVG らしくない、ファイルが読めない、
 * といったときは undefined を返す。
 */
function readPortraitSource(filePath: string): CharacterPortraitSource | undefined {
  const kind = classifyPortraitFile(filePath)
  if (kind === undefined) {
    return undefined
  }

  if (kind === "svg") {
    const content = readOptionalFile(filePath)
    return content !== undefined && isPlausibleSvgMarkup(content)
      ? { kind: "svg", svgMarkup: content }
      : undefined
  }

  const mimeType = rasterMimeType(filePath)
  const bytes = readOptionalBinaryFile(filePath)
  return mimeType !== undefined && bytes !== undefined
    ? { kind: "image", dataUri: `data:${mimeType};base64,${bytes.toString("base64")}` }
    : undefined
}

/** 無くてもよいファイルを読む。存在しない・読めないときは undefined を返す（例外にしない）。 */
function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

/** 無くてもよいバイナリファイル（立ち絵のラスタ画像）を読む。存在しない・読めないときは undefined。 */
function readOptionalBinaryFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}
