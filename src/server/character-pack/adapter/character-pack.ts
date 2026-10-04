// キャラクターパックを読む。`character.json` とその立ち絵ファイルの実際の I/O はここに閉じる（定義の解釈は `parseCharacterDefinition` の仕事）。
// ここが持つのは `persona` の文字列を読むところまでで、`systemPrompt` の append は組み立てない。
//
// 素材の中身（SVG・画像のバイト列）は `SessionState` にも `character-changed` イベントにも乗せない。
// ブラウザは `/character/<pack>/<file>` から取りに行く。

import { readdirSync, statSync } from "node:fs"
import { basename, join } from "node:path"

import {
  type CharacterAssetLocation,
  classifyPortraitFile,
  rasterMimeType,
} from "../../../shared/character-pack/character-asset.ts"
import {
  type CharacterDefinition,
  parseCharacterDefinition,
} from "../../../shared/character-pack/character-definition.ts"
import { diaryFontMimeType } from "../../../shared/character-pack/character-diary-font.ts"
import {
  type CharacterPackEntry,
  type CharacterPackRemoval,
  toCharacterInfo,
} from "../../../shared/character-pack/character.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"
import { readOptionalBinaryFile, readOptionalFile } from "../../adapter/lib/optional-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"

/** 定義ファイルの名前。 */
export const CHARACTER_DEFINITION_FILE_NAME = "character.json"

/** 人格のファイル名。パックの中に無くてもよい（append が空になるだけ）。 */
export const PERSONA_FILE_NAME = "persona.md"

/** パックの置き場の名前。同梱側も起動先側も、この名前のディレクトリの下を見る。 */
const CHARACTER_DIR_NAME = "characters"

/**
 * 起動先（cwd）で見るパックの置き場。利用者が自分で用意した素材の置き場で、`.gitignore` 済み。
 * 同梱側と違い、ここは `characters/local` そのものが1つのパック。
 */
const LOCAL_PACK_NAME = "local"

/**
 * 一覧の先頭に置くパックの名前。このプロジェクトの顔なので、名前順で後ろに回さない。
 * どの置き場にあっても（ホームで上書きされても）先頭に来る。
 */
const LEADING_PACK_NAME = "tsukumo"

/**
 * キャラクター定義ディレクトリの既定値。自作で権利がクリーンな tsukumo-spirit を使う。
 * 同梱物なので cwd には依存させず、tsukumo 自身の場所からの相対で読む。
 */
export const DEFAULT_CHARACTER_DIR_RELATIVE_PATH: readonly string[] = [
  "characters",
  "tsukumo-spirit",
]

/** キャラクターパック1つ分。定義・人格が無い・壊れているときはそれぞれ undefined。 */
export type CharacterPack = {
  /** ディレクトリ名（`session.switchCharacter` の鍵）。 */
  readonly name: string
  readonly dir: string
  readonly definition: CharacterDefinition | undefined
  /**
   * 人格（`persona.md` の全文）。無いパックでも起動する。
   * そのときの `systemPrompt` の append は tsukumo 側の規約（セリフの間合い・レポートの記法）だけになる。
   */
  readonly persona: string | undefined
  /**
   * 素材の版（定義と素材のファイルの更新時刻のうち、いちばん新しいもの）。
   * 素材の URL の `?v=` に混ぜて、差し替えた素材をブラウザに取り直させるためだけにある。読めなければ undefined。
   */
  readonly revision: string | undefined
}

/**
 * パック1つを読む（`character.json` と `persona.md`）。
 * 無い・壊れているときは `definition: undefined`（立ち絵なしにフォールバック。そのまま {@link characterChangedEvent} へ渡してよい）。
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

/** パックの探し先3箇所。`local` の1つ固定は起動先の側だけ。 */
export type CharacterPackRoots = {
  /** 同梱の `characters/`（tsukumo 自身の場所からの相対）。 */
  readonly bundled: string
  /** `~/.tsukumo/characters/`（画面から作ったパック。全プロジェクト共通）。 */
  readonly home: string
}

export function defaultCharacterPackRoots(): CharacterPackRoots {
  return { bundled: bundledFilePath(CHARACTER_DIR_NAME), home: homeCharacterDir() }
}

/** 画面から変えたパックの書き込み先の親（`~/.tsukumo/characters`）。書き込んでよいのはこの下だけ。 */
export function homeCharacterDir(): string {
  return join(tsukumoHomeDir(), CHARACTER_DIR_NAME)
}

/**
 * このパックを画面から変えてよいか。
 * 書き込み先はホームの1箇所だけなので、探索の順でホームに勝つもの（起動先の `characters/local` と同じ名前のパック）だけは false にする。
 * 書いても次の起動では起動先のほうが読まれて、変更が消えたように見える。
 */
export function isEditableCharacterPack(pack: CharacterPack, cwd: string): boolean {
  return !(pack.name === LOCAL_PACK_NAME && hasDefinition(localPackDir(cwd)))
}

/**
 * このパックを画面から消すと何が起きるか。
 * 消せるのは一覧に勝ち残ったパックがホームの版そのもの（`<roots.home>/<name>`）のときだけで、同梱にも同じ名前があれば、消したあとは同梱の版が一覧に戻る（`"revert-to-bundled"`）。
 *
 * 起動先の `characters/local` はホームより後ろで勝つので、ホームに同じ名前があってもここで `"none"` になる。
 * 使用中かどうかは見ない（画面は `inUse` と合わせて押せなくし、消す側は別に断る）。
 *
 * 画面に配る値と、消す側が断る判断の両方がこれを通るので、出した口と通る口がずれない。
 */
export function characterPackRemoval(
  pack: CharacterPack,
  roots: CharacterPackRoots,
): CharacterPackRemoval {
  if (pack.dir !== join(roots.home, pack.name)) {
    return "none"
  }
  return hasDefinition(join(roots.bundled, pack.name)) ? "revert-to-bundled" : "delete"
}

/**
 * 切り替えられるパックを列挙する。探し先は3箇所:
 *
 * 1. tsukumo 同梱の `characters/` の各ディレクトリ（`character.json` があるものだけ）
 * 2. `~/.tsukumo/characters/` の各ディレクトリ（画面から作った・変えたパック）
 * 3. 起動先の `characters/local/`（利用者が自分で用意した素材。ここは1つ固定）
 *
 * 同名は後ろが勝つ（ホームは同梱を上書きし、起動先はそのホームにも勝つ）。
 * 並びはこの3箇所の順（各置き場の中は名前順）で、`tsukumo` だけは先頭に出す。
 * 読めないディレクトリは黙って飛ばす（一覧が短くなるだけで、起動は止めない）。
 *
 * `roots` は同梱とホームの置き場（既定は {@link defaultCharacterPackRoots}）。
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

  // 同名は後勝ち。同梱 → ホーム → 起動先の順に並べてあるので、これがそのまま優先順になる。
  const packs = dirs.map(readCharacterPack)
  const unique = [...new Map(packs.map((pack) => [pack.name, pack] as const)).values()]
  return [
    ...unique.filter((pack) => pack.name === LEADING_PACK_NAME),
    ...unique.filter((pack) => pack.name !== LEADING_PACK_NAME),
  ]
}

/**
 * 起こしたとき・起こし直したとき・画面からパックを変えたり作ったりしたときに流す `character-changed` イベント。
 * いま出しているパックの姿と、全パックぶんの一覧（{@link CharacterPackEntry}）を一緒に組む。
 * 中身は URL と選択肢だけで、素材そのものは含まない。
 *
 * `packs` は {@link listCharacterPacks} の並び。同じ名前のものは `current` に置き換えて並べる（{@link withCurrentPack}）。
 * 配る側の {@link readCharacterAsset} と同じ規則にしておかないと、一覧に載せた URL が配れなくなる。
 */
export function characterChangedEvent(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  cwd: string,
  roots: CharacterPackRoots = defaultCharacterPackRoots(),
): SessionEvent {
  const entries = withCurrentPack(current, packs).map((pack) =>
    toCharacterPackEntry(pack, pack === current, cwd, roots),
  )
  return {
    kind: "character-changed",
    ...toCharacterPackEntry(current, true, cwd, roots).character,
    packs: entries,
  }
}

export type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * 配る1件。`versioned` は、要求の `?v=` がそのパックの今の版（{@link CharacterPack.revision}）と一致したこと。
 * 一致しない URL を長期にキャッシュさせると、差し替えたあとも古い中身が残る。
 */
export type ServedCharacterAssetFile = CharacterAssetFile & { readonly versioned: boolean }

/**
 * `/character/<pack>/<file>` が配ってよい1件を読む。
 * パック名は一覧（`current` で置き換えたもの。{@link withCurrentPack}）と突き合わせるだけで、パスには使わない（無い名前・`..` は見つからずに undefined）。
 * ファイル名の判断は {@link readCharacterPackFile} に任せる。
 */
export function readCharacterAsset(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  location: CharacterAssetLocation,
  version: string | undefined,
): ServedCharacterAssetFile | undefined {
  const pack = findCharacterPack(current, packs, location.pack)
  const file = pack === undefined ? undefined : readCharacterPackFile(pack, location.fileName)
  return pack === undefined || file === undefined
    ? undefined
    : { ...file, versioned: version !== undefined && version === pack.revision }
}

/**
 * 一覧（`current` で置き換えたもの。{@link withCurrentPack}）から名前でパックを1つ引く（無ければ undefined）。
 * 素材を配る側と画面から変える側が同じ規則で引くので、一覧に載せた名前は配れるし変えられる。名前はパスに使わない。
 */
export function findCharacterPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  name: string,
): CharacterPack | undefined {
  return withCurrentPack(current, packs).find((listed) => listed.name === name)
}

/**
 * パック1つの中で、配ってよい1件を読む。`character.json` に載っているファイル名（{@link characterPackFileNames}）だけを許す。
 * パスから組み立てないので、`..` を含む要求や定義に無い名前は undefined になる（呼び出し側は404にする）。
 */
export function readCharacterPackFile(
  pack: CharacterPack,
  fileName: string,
): CharacterAssetFile | undefined {
  if (!characterPackFileNames(pack.definition).includes(fileName)) {
    return undefined
  }

  const contentType = characterAssetContentType(fileName)
  if (contentType === undefined) {
    return undefined
  }

  const content = readOptionalBinaryFile(join(pack.dir, fileName))
  return content === undefined ? undefined : { contentType, content }
}

/**
 * `character.json` の `portraits` `mini` `face` `background` `diaryFont` に載っているファイル名の一覧（重複なし）。
 * 顔もミニ立ち絵も背景も日記の書体も同じ経路（`/character/<pack>/<file>`）で配るので、ここに入れないと 404 になる。
 */
function characterPackFileNames(definition: CharacterDefinition | undefined): readonly string[] {
  if (definition === undefined) {
    return []
  }

  const fileNames = [
    ...Object.values(definition.portraits),
    definition.mini,
    definition.face,
    definition.background?.image,
    definition.diaryFont,
  ].filter(isDefined)
  return [...new Set(fileNames)]
}

/**
 * 一覧の並びのうち、`current` と同じ名前のものを `current` に置き換える（一覧に無ければ末尾に足す）。
 * 一覧を読んだあとに持ち替えたパック（画面から変えた直後・`TSUKUMO_CHARACTER` で別の場所を指したとき）でも、画面に出すもの・配るものが「いま出しているもの」とずれない。
 */
function withCurrentPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
): readonly CharacterPack[] {
  return packs.some((pack) => pack.name === current.name)
    ? packs.map((pack) => (pack.name === current.name ? current : pack))
    : [...packs, current]
}

function toCharacterPackEntry(
  pack: CharacterPack,
  inUse: boolean,
  cwd: string,
  roots: CharacterPackRoots,
): CharacterPackEntry {
  return {
    name: pack.name,
    label: pack.definition?.name ?? pack.name,
    character: toCharacterInfo({
      definition: pack.definition,
      pack: pack.name,
      revision: pack.revision,
      editable: isEditableCharacterPack(pack, cwd),
    }),
    inUse,
    removal: characterPackRemoval(pack, roots),
  }
}

function characterAssetContentType(fileName: string): string | undefined {
  const kind = classifyPortraitFile(fileName)
  if (kind === "svg") {
    return "image/svg+xml; charset=utf-8"
  }
  if (kind === "raster") {
    return rasterMimeType(fileName)
  }
  // 立ち絵・背景の拡張子でなければ、日記の書体（woff2 / woff / ttf / otf）かどうかを見る。
  return diaryFontMimeType(fileName)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

/**
 * 置き場の直下で、`character.json` を持つディレクトリだけを、名前順に返す。読めなければ空。
 * `readdirSync` の順はファイルシステム任せなので、並べないと `<select>` の並びが環境によって変わる。
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

/** 起動先のパックの置き場（`<cwd>/characters/local`）。ここだけは1つ固定。 */
function localPackDir(cwd: string): string {
  return join(cwd, CHARACTER_DIR_NAME, LOCAL_PACK_NAME)
}

/**
 * 素材の版。定義ファイルと、配る素材すべて（{@link characterPackFileNames}）の更新時刻のうち、いちばん新しいものをそのまま文字列にする。
 * 配る素材の一部が入っていないと、そのファイルだけ差し替えても版が変わらず、長期にキャッシュされた古い中身が出続ける。
 * 1つも読めなければ undefined。
 */
function readPackRevision(
  dir: string,
  definition: CharacterDefinition | undefined,
): string | undefined {
  const fileNames = [CHARACTER_DEFINITION_FILE_NAME, ...characterPackFileNames(definition)]
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
