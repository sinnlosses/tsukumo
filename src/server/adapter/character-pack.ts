// キャラクターパックを読む。character.json とその立ち絵ファイルの実際の I/O はここに閉じる
// （「外に触るのはここだけ」の側。定義の解釈は src/shared/character.ts の仕事。
// docs/design.md 5章「character-pack.ts」）。
//
// **fs に触らない関数（`buildSystemPromptAppend` / `toCharacterPackChoices` /
// `characterChangedEvent`）もここに置く。** 層は「外の世界に触るか」で決め、ファイルの中身の
// 純度では割らない（2026-09-16 決定。理由は docs/architecture.md「新しいコードを置く場所」）。
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
} from "../../shared/character.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { bundledFilePath } from "./bundled-path.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 定義ファイルの名前。**画面から書き込む側（`src/server/adapter/character-edit.ts`）も同じ名前を使う。** */
export const CHARACTER_DEFINITION_FILE_NAME = "character.json"

/** 人格のファイル名。パックの中に無くてもよい（append が空になるだけ）。 */
export const PERSONA_FILE_NAME = "persona.md"

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
   * tsukumo 側の規約（セリフの間合い・レポートの記法）だけになる。docs/design.md 7章）。
   */
  readonly persona: string | undefined
  /**
   * 素材の版（定義と立ち絵のファイルの更新時刻のうち、いちばん新しいもの）。
   * **`/character/<file>` の URL に混ぜて、差し替えた立ち絵をブラウザに取り直させるためだけ**に
   * ある（`src/shared/character.ts` の `characterAssetCacheKey`）。読めなければ undefined。
   */
  readonly revision: string | undefined
}

/**
 * パック1つを読む（`character.json` と `persona.md`）。無い・壊れているときは
 * `definition: undefined`（立ち絵なしにフォールバック。呼び出し側はそのまま
 * `characterChangedEvent` へ渡してよい）。
 */
export function readCharacterPack(dir: string): CharacterPack {
  const content = readOptionalFile(join(dir, CHARACTER_DEFINITION_FILE_NAME))
  const definition = content === undefined ? undefined : parseCharacterDefinition(content)
  return {
    name: basename(dir),
    dir,
    definition,
    persona: readOptionalFile(join(dir, PERSONA_FILE_NAME)),
    revision: readPackRevision(dir, definition),
  }
}

/** パックの探し先3箇所（`docs/design.md` 7.1）。`local` の1つ固定は起動先の側だけ。 */
export type CharacterPackRoots = {
  /** 同梱の `characters/`（tsukumo 自身の場所からの相対）。 */
  readonly bundled: string
  /** `~/.tsukumo/characters/`（**画面から作ったパック**。全プロジェクト共通）。 */
  readonly home: string
}

export function defaultCharacterPackRoots(): CharacterPackRoots {
  return { bundled: bundledFilePath(CHARACTER_DIR_NAME), home: homeCharacterDir() }
}

/**
 * 画面から変えたパックの書き込み先の親（`~/.tsukumo/characters`）。**書き込んでよいのは
 * この下だけ**（`docs/design.md` 7.1）。
 */
export function homeCharacterDir(): string {
  return join(tsukumoHomeDir(), CHARACTER_DIR_NAME)
}

/**
 * このパックを画面から変えてよいか（`docs/design.md` 7.1）。**書き込み先はホームの1箇所だけ**な
 * ので、探索の順でホームに勝つもの — つまり**起動先の `characters/local`** と同じ名前のパック
 * だけは false にする（書いても次の起動では起動先のほうが読まれて、変更が消えたように見える）。
 */
export function isEditableCharacterPack(pack: CharacterPack, cwd: string): boolean {
  return !(pack.name === LOCAL_PACK_NAME && hasDefinition(localPackDir(cwd)))
}

/**
 * 切り替えられるパックを列挙する（docs/design.md 7章・7.1）。探し先は3箇所:
 *
 * 1. **tsukumo 同梱の `characters/`** の各ディレクトリ（`character.json` があるものだけ）
 * 2. **`~/.tsukumo/characters/`** の各ディレクトリ（画面から作った・変えたパック）
 * 3. **起動先の `characters/local/`**（利用者が自分で用意した素材。ここは1つ固定）
 *
 * **同名は後ろが勝つ**（ホームは同梱を上書きし、起動先はそのホームにも勝つ。7.1）。
 * 読めないディレクトリは黙って飛ばす（一覧が短くなるだけで、起動は止めない。
 * docs/coding-standards.md「エラーハンドリング」）。
 *
 * `roots` は同梱とホームの置き場（既定は {@link defaultCharacterPackRoots}。`readFakeScript` の
 * `path` と同じで、差し替えられるのは置き場所だけ）。
 */
export function listCharacterPacks(
  cwd: string,
  roots: CharacterPackRoots = defaultCharacterPackRoots(),
): readonly CharacterPack[] {
  const local = localPackDir(cwd)
  const dirs = [
    ...listPackDirs(roots.bundled),
    ...listPackDirs(roots.home),
    ...(hasDefinition(local) ? [local] : []),
  ]

  // 同名は後勝ち。同梱 → ホーム → 起動先の順に並べてあるので、これがそのまま 7.1 の優先順になる。
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
 * `systemPrompt` の append を組み立てる。**人格 → tsukumo 側の規約の順**にするのは、規約
 * （機械的な決まりごと）を後ろに置いて人格の文章に埋もれさせないため。人格が無いパックでは
 * 規約だけになる（docs/design.md 7章）。
 *
 * `rules` はパックによらず同じもの（`src/server/core/speech-cadence.ts` と
 * `src/server/core/report-notation.ts`）で、**並べる順は呼び出し側（`src/cli.ts`）が決める**。
 */
export function buildSystemPromptAppend(pack: CharacterPack, rules: readonly string[]): string {
  return [pack.persona, ...rules]
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
  editable: boolean,
): SessionEvent {
  const info = toCharacterInfo({
    definition: pack.definition,
    pack: pack.name,
    revision: pack.revision,
    editable,
  })
  return { kind: "character-changed", ...info, packs }
}

export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * `/character/<file>` が配ってよい1件を読む。**character.json の `portraits` に載っている
 * ファイル名だけ**を許す（vendor の allowlist と同じ考え方。パスから組み立てないので、
 * `..` を含む要求や定義に無い名前は自然に undefined になる）。呼び出し側
 * （src/server/adapter/server.ts）はこの結果をそのまま配るか、undefined なら404にする。
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

function isDefined<T>(value: T | undefined): value is T {
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

/** 起動先のパックの置き場（`<cwd>/characters/local`）。**ここだけは1つ固定**（7.1）。 */
function localPackDir(cwd: string): string {
  return join(cwd, CHARACTER_DIR_NAME, LOCAL_PACK_NAME)
}

/**
 * 素材の版。定義ファイルと `portraits` の各ファイルの更新時刻のうち、いちばん新しいものを
 * そのまま文字列にする。**中身は読まない**（更新時刻だけで足りる）。1つも読めなければ undefined。
 */
function readPackRevision(
  dir: string,
  definition: CharacterDefinition | undefined,
): string | undefined {
  const fileNames = [
    CHARACTER_DEFINITION_FILE_NAME,
    ...Object.values(definition?.portraits ?? {}).filter(isDefined),
  ]
  const times = fileNames.map((name) => modifiedAtMs(join(dir, name))).filter(isDefined)
  return times.length === 0 ? undefined : String(Math.max(...times))
}

function modifiedAtMs(path: string): number | undefined {
  try {
    return Math.trunc(statSync(path).mtimeMs)
  } catch {
    return undefined
  }
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
