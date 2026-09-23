// キャラクターパックを読む。character.json とその立ち絵ファイルの実際の I/O はここに閉じる
// （「外に触るのはここだけ」の側。定義の解釈は src/shared/character-definition.ts の仕事。
// docs/design.md 5章「character-pack.ts」）。
//
// **fs にほとんど触らない関数（`characterChangedEvent`）もここに置く。**
// 層は「外の世界に触るか」で決め、ファイルの中身の純度では割らない（理由は
// docs/architecture.md「新しいコードを置く場所」）。**`systemPrompt` の append の組み立ては
// `src/server/core/system-prompt.ts` へ移してある**——`core` 側の規約と雑談の記憶を並べる判断が
// 要るようになり、概念で切るほうに当たったため（同じ段落）。ここが持つのは `persona` の文字列を
// 読むところまで。
//
// **素材の中身（SVG・画像のバイト列）は SessionState にも character-changed イベントにも乗せない。**
// ブラウザは `/character/<pack>/<file>` から取りに行く（docs/design.md 4.1・5章・7章）。

import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join } from "node:path"

import {
  type CharacterAssetLocation,
  classifyPortraitFile,
  rasterMimeType,
} from "../../shared/character-asset.ts"
import {
  type CharacterDefinition,
  parseCharacterDefinition,
} from "../../shared/character-definition.ts"
import {
  type CharacterPackEntry,
  type CharacterPackRemoval,
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
   * 素材の版（定義と素材のファイルの更新時刻のうち、いちばん新しいもの）。
   * **素材の URL の `?v=` に混ぜて、差し替えた素材をブラウザに取り直させるためだけ**に
   * ある（`src/shared/character-asset.ts` の `characterAssetPath`）。読めなければ undefined。
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
 * このパックを画面から消すと何が起きるか（`docs/design.md` 7.1「消すときの細部」）。**消せるのは
 * 一覧に勝ち残ったパックがホームの版そのもの（`<roots.home>/<name>`）のときだけ**で、同梱にも
 * 同じ名前があれば、消したあとは同梱の版が一覧に戻る（`"revert-to-bundled"`）。
 *
 * **起動先の `characters/local` はホームより後ろで勝つ**ので、ホームに同じ名前があっても
 * ここで `"none"` になる（{@link isEditableCharacterPack} と同じ理由）。**使用中かどうかは見ない**
 * （画面は `inUse` と合わせて押せなくし、消す側は別に断る）。
 *
 * **画面に配る値と、消す側が断る判断の両方がこれを通る**ので、出した口と通る口がずれない。
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
 * `roots` は同梱とホームの置き場（既定は {@link defaultCharacterPackRoots}。`readFakeSession` の
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

/**
 * 起こしたとき・起こし直したとき・画面からパックを変えたり作ったりしたときに流す
 * `character-changed` イベント（docs/design.md 4.1・7章）。**いま出しているパックの姿と、
 * 全パックぶんの一覧（{@link CharacterPackEntry}）を一緒に組む**。中身は URL と選択肢だけで、
 * 素材そのものは含まない。
 *
 * `packs` は {@link listCharacterPacks} の並び。**同じ名前のものは `current` に置き換えて並べる**
 * （{@link withCurrentPack}。配る側の {@link readCharacterAsset} と同じ規則なので、一覧に載せた
 * URL は必ず配れる）。
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
 * `/character/<pack>/<file>` が配ってよい1件を読む。**パック名は一覧（`current` で置き換えたもの。
 * {@link withCurrentPack}）と突き合わせるだけ**で、パスには使わない（無い名前・`..` は
 * 見つからずに undefined）。ファイル名の判断は {@link readCharacterPackFile} に任せる。
 */
export function readCharacterAsset(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  location: CharacterAssetLocation,
): CharacterAssetFile | undefined {
  const pack = findCharacterPack(current, packs, location.pack)
  return pack === undefined ? undefined : readCharacterPackFile(pack, location.fileName)
}

/**
 * 一覧（`current` で置き換えたもの。{@link withCurrentPack}）から名前でパックを1つ引く（無ければ
 * undefined）。**素材を配る側と画面から変える側（`src/server/adapter/character-edit.ts`）が同じ
 * 規則で引く**ので、一覧に載せた名前は配れるし変えられる。名前はパスに使わない。
 */
export function findCharacterPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  name: string,
): CharacterPack | undefined {
  return withCurrentPack(current, packs).find((listed) => listed.name === name)
}

/**
 * パック1つの中で、配ってよい1件を読む。**character.json の `portraits` `mini` `face`
 * `background` に載っているファイル名だけ**を許す（vendor の allowlist と同じ考え方。パスから組み立てないので、
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

/**
 * character.json の `portraits` `mini` `face` `background` に載っているファイル名の一覧
 * （重複なし）。**顔もミニ立ち絵も背景も同じ経路（`/character/<pack>/<file>`）で配る**ので、
 * ここに入れないと 404 になる。
 */
function characterPackFileNames(pack: CharacterPack): readonly string[] {
  if (pack.definition === undefined) {
    return []
  }

  const fileNames = [
    ...Object.values(pack.definition.portraits),
    pack.definition.mini,
    pack.definition.face,
    pack.definition.background?.image,
  ].filter(isDefined)
  return [...new Set(fileNames)]
}

/**
 * 一覧の並びのうち、`current` と同じ名前のものを `current` に置き換える（一覧に無ければ末尾に
 * 足す）。一覧を読んだあとに持ち替えたパック（画面から変えた直後・`TSUKUMO_CHARACTER` で
 * 別の場所を指したとき）でも、**画面に出すもの・配るものが「いま出しているもの」とずれない**。
 */
function withCurrentPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
): readonly CharacterPack[] {
  return packs.some((pack) => pack.name === current.name)
    ? packs.map((pack) => (pack.name === current.name ? current : pack))
    : [...packs, current]
}

/**
 * 一覧の1件を組む。「変えられるか」は {@link isEditableCharacterPack}、「消すと何が起きるか」は
 * {@link characterPackRemoval}。
 */
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
 * 素材の版。定義ファイルと、定義が指している素材（立ち絵・背景）の更新時刻のうち、いちばん
 * 新しいものをそのまま文字列にする。**中身は読まない**（更新時刻だけで足りる）。1つも
 * 読めなければ undefined。
 */
function readPackRevision(
  dir: string,
  definition: CharacterDefinition | undefined,
): string | undefined {
  const fileNames = [
    CHARACTER_DEFINITION_FILE_NAME,
    ...[...Object.values(definition?.portraits ?? {}), definition?.background?.image].filter(
      isDefined,
    ),
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
