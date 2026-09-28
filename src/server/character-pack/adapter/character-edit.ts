// 画面から届いたキャラクターの変更（新しいパックを作る・立ち絵と差し色と背景を差し替える・パックを消す）をキャラクターパックに書き込む。
// 書き込んでよい・消してよいのは `~/.tsukumo/characters/<name>/` の下だけ。
//
// ディレクトリ名になる名前だけは外から受け取る（新しいパックを作るときの `<name>`）ので、形は境界（`isCharacterPackName`）で見てある。
// ここは既にある名前とぶつかったら書かないことだけを見る（後勝ちで既存のパックが黙って隠れないため）。
//
// ファイル名を外から受け取らない。
// 立ち絵の名前は表情と形式から、背景の名前は形式だけから組み立てるので、届いた文字列がパスの一部になる経路がそもそも無い。
//
// 書き込む先のパックはコマンドの `pack` で指す（使用中のパックに限らない）。
// 名前は一覧と突き合わせて引くだけで、パスには使わない（書く先はホームの下の、引けたパックの名前）。
//
// 書き込む前に、書き込む先のパックをホームへ丸ごと写す（同梱のパックを直さないため）。
// ホームに既に同じ名前のパックがあるときは写さない（画面から重ねた変更を上書きしてしまわないため）。
//
// 失敗しても例外を投げない。受け付けられなかった回は undefined を返す。

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

import { classifyPortraitFile } from "../../../shared/character-pack/character-asset.ts"
import {
  type BackgroundImage,
  backgroundFileName,
  parseBackgroundImage,
} from "../../../shared/character-pack/character-background.ts"
import {
  type CharacterDefinition,
  definitionWithAccent,
  definitionWithBackground,
  definitionWithFace,
  definitionWithName,
  definitionWithOutfitAccent,
  definitionWithoutBackground,
  definitionWithoutChatAccent,
  definitionWithoutFace,
  definitionWithoutPortrait,
  definitionWithPortrait,
  definitionWithTagline,
  parseCharacterDefinition,
} from "../../../shared/character-pack/character-definition.ts"
import {
  type FaceImage,
  faceFileName,
  parseFaceImage,
} from "../../../shared/character-pack/character-face.ts"
import type { CharacterPackRemoval } from "../../../shared/character-pack/character.ts"
import {
  type Expression,
  EXPRESSIONS,
  type RemovableExpression,
  type RequiredExpression,
} from "../../../shared/character-pack/expression.ts"
import {
  type PortraitImage,
  parsePortraitImage,
  portraitFileName,
} from "../../../shared/character-pack/portrait-image.ts"
import type {
  CharacterCreate,
  CharacterDelete,
  CharacterEdit,
} from "../../../shared/contract/character-pack.ts"
import {
  type CharacterPack,
  CHARACTER_DEFINITION_FILE_NAME,
  type CharacterPackRoots,
  characterPackRemoval,
  defaultCharacterPackRoots,
  findCharacterPack,
  homeCharacterDir,
  isEditableCharacterPack,
  PERSONA_FILE_NAME,
  readCharacterPack,
  readOptionalFile,
} from "./character-pack.ts"

/** 表情ごとの立ち絵のほかに1つのパックが持てる画像（ミニ立ち絵1・背景1・顔1・訪問の peek 1）。 */
const EXTRA_IMAGE_FILES_PER_PACK = 4

/**
 * 1つのパックが持てる画像の数。表情の全体（{@link EXPRESSIONS}）＋ {@link EXTRA_IMAGE_FILES_PER_PACK}。
 * 数を直に書くと、表情を足したときに黙って足りなくなり、立ち絵を全部そろえたパックで背景の差し替えだけが弾かれる。
 */
export const MAX_IMAGE_FILES_PER_PACK = EXPRESSIONS.length + EXTRA_IMAGE_FILES_PER_PACK

/**
 * `edit.pack` で指されたパックに編集1件を書き込み、書けたパックを読み直して返す。受け付けられなかったときは undefined:
 *
 * - 一覧（`current` と `packs`。素材を配るのと同じ `findCharacterPack` の規則）に無い名前
 * - 起動先の `characters/local` と同じ名前のパック（書いても次の起動で読まれない）
 * - 画像の数が {@link MAX_IMAGE_FILES_PER_PACK} を超える
 * - ディスクに書けない
 *
 * `root` は書き込み先の親（既定は `~/.tsukumo/characters`）。
 */
export function editCharacterPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  edit: CharacterEdit,
  cwd: string,
  root: string = homeCharacterDir(),
): CharacterPack | undefined {
  const pack = findCharacterPack(current, packs, edit.pack)
  if (pack === undefined || !isEditableCharacterPack(pack, cwd)) {
    return undefined
  }

  const dir = join(root, pack.name)
  try {
    copyPackOnce(pack, dir)
    return applyEdit(dir, edit) ? readCharacterPack(dir) : undefined
  } catch {
    return undefined
  }
}

/**
 * 新しいキャラクターパックを1つ作り、作れたパックを読み直して返す。作らないときは undefined:
 *
 * - `taken`（いま切り替えられるパックの名前）に同じ名前がある（探索の順で後ろが勝つので、黙って既存のパックを隠してしまわないため）
 * - 書き込み先に同じ名前のディレクトリが既にある（一覧に出ていない壊れたパックの置き場）
 * - ディスクに書けない（書きかけのディレクトリは消すので、欠けたパックは残らない）
 *
 * `default` の1枚があることは境界で済んでいる（`CharacterCreate` の `portraits` が required）。
 * ここは書く順だけを守る。素材 → 定義の順に書くので、途中で失敗したディレクトリは `character.json` を持たず、パックとして一覧に出ない。
 */
export function createCharacterPack(
  create: CharacterCreate,
  taken: readonly string[],
  root: string = homeCharacterDir(),
): CharacterPack | undefined {
  const dir = join(root, create.id)
  if (taken.includes(create.id) || existsSync(dir)) {
    return undefined
  }

  try {
    mkdirSync(dir, { recursive: true })
    const fileNames = writeRequiredPortraits(dir, create.portraits)
    if (fileNames === undefined) {
      discardDir(dir)
      return undefined
    }

    writeFileSync(join(dir, CHARACTER_DEFINITION_FILE_NAME), newDefinitionJson(create, fileNames))
    return readCharacterPack(dir)
  } catch {
    discardDir(dir)
    return undefined
  }
}

/**
 * `remove.pack` で指されたパックのホームの版（`<roots.home>/<name>`）を消し、消して起きたことを返す。
 * `"delete"` なら一覧から消え、`"revert-to-bundled"` なら同梱の版が一覧に戻る。消さないときは undefined:
 *
 * - 一覧（素材を配る・見た目を変えるのと同じ `findCharacterPack` の規則）に無い名前
 * - 使用中のパック（`current`）
 * - 一覧に勝ち残ったのがホームの版ではない（同梱だけ・起動先の `characters/local`・`TSUKUMO_CHARACTER` で指した一覧の外。{@link characterPackRemoval} が `"none"`）
 * - ディスクから消せない
 *
 * 消す先はホームの置き場と一覧の名前から組む（{@link characterPackRemoval} が、一覧のパックの場所がまさにそこだと確かめてある）。
 * 届いた名前はパスに使わない。
 * ホームの版がシンボリックリンクなら消えるのはリンクだけで、指している先は残る（`rmSync` はリンクを辿らない）。
 */
export function deleteCharacterPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  remove: CharacterDelete,
  roots: CharacterPackRoots = defaultCharacterPackRoots(),
): Exclude<CharacterPackRemoval, "none"> | undefined {
  const pack = findCharacterPack(current, packs, remove.pack)
  if (pack === undefined || pack.name === current.name) {
    return undefined
  }

  const removal = characterPackRemoval(pack, roots)
  if (removal === "none") {
    return undefined
  }

  try {
    rmSync(join(roots.home, pack.name), { recursive: true })
    return removal
  } catch {
    return undefined
  }
}

/**
 * ホームにまだ同じ名前のパックが無ければ、書き込む先のパックを丸ごと写す。
 * 人格（`persona.md`）も写す（写し忘れると、次の起動でそのパックの人格が消える）。
 * ホームのパックへ書くものは、どれも書く前にここを通す。
 */
export function copyPackOnce(pack: CharacterPack, dir: string): void {
  mkdirSync(dir, { recursive: true })
  if (dir === pack.dir || existsSync(join(dir, CHARACTER_DEFINITION_FILE_NAME))) {
    return
  }

  for (const name of [
    CHARACTER_DEFINITION_FILE_NAME,
    PERSONA_FILE_NAME,
    ...referencedImageFileNames(pack.definition),
  ]) {
    copyIfExists(join(pack.dir, name), join(dir, name))
  }
}

/** 編集1件をディスクに書く。書けたら true、受け付けられなければ false。 */
function applyEdit(dir: string, edit: CharacterEdit): boolean {
  const definitionPath = join(dir, CHARACTER_DEFINITION_FILE_NAME)
  const content = readOptionalFile(definitionPath)

  switch (edit.kind) {
    case "setOutfitAccent":
      writeFileSync(definitionPath, definitionWithOutfitAccent(content, edit.outfit, edit.color))
      return true
    case "setAccent":
      writeFileSync(definitionPath, definitionWithAccent(content, edit.target, edit.color))
      return true
    case "clearChatAccent":
      writeFileSync(definitionPath, definitionWithoutChatAccent(content))
      return true
    case "setProfile":
      writeFileSync(
        definitionPath,
        definitionWithTagline(definitionWithName(content, edit.name), edit.tagline),
      )
      return true
    case "clearPortrait":
      return applyImageEdit(dir, definitionPath, content, portraitClearEdit(edit.expression))
    case "setPortrait":
      // 検証は境界（`portraitDataUrlSchema`）で済んでいるので、`parseImage` が undefined を返すのは配線の誤りのときだけ。
      // 型を迂回せずほどくために、もう一度同じ関数を通す。
      return applyImageEdit(
        dir,
        definitionPath,
        content,
        portraitSetEdit(edit.expression, edit.image),
      )
    case "clearBackground":
      return applyImageEdit(dir, definitionPath, content, backgroundClearEdit())
    case "setBackground":
      return applyImageEdit(dir, definitionPath, content, backgroundSetEdit(edit.image))
    case "clearFace":
      return applyImageEdit(dir, definitionPath, content, faceClearEdit())
    case "setFace":
      return applyImageEdit(dir, definitionPath, content, faceSetEdit(edit.image))
  }
}

/**
 * 立ち絵・背景・顔で違う部分だけをまとめた操作。
 * `set` と `clear` を1つの型に同居させないのは、立ち絵で受け取れる表情が違うから（消去は `default` を除いた {@link RemovableExpression}、差し替えは {@link Expression}）。
 */
type ImageEdit<Image extends { readonly base64: string; readonly format: string }> =
  | {
      readonly kind: "set"
      readonly image: string
      /** data URL をほどく（読めない・受け付けない種類・大きすぎるときは undefined）。 */
      readonly parseImage: (dataUrl: string) => Image | undefined
      /** ほどいた画像から書き込み先のファイル名を組み立てる。 */
      readonly fileName: (image: Image) => string
      /** 書き換える前の、いまの定義が指しているファイル名。 */
      readonly previousFileName: (content: string | undefined) => string | undefined
      /** 定義にファイル名を書き込む。 */
      readonly withImage: (content: string | undefined, fileName: string) => string
    }
  | {
      readonly kind: "clear"
      /** 書き換える前の、いまの定義が指しているファイル名。 */
      readonly previousFileName: (content: string | undefined) => string | undefined
      /** 定義から参照を外す。 */
      readonly withoutImage: (content: string | undefined) => string
    }

/**
 * 画像の差し替え（`set-*`）と消去（`clear-*`）に共通する手順。
 * ほどく → ファイル名を決める → 上限を確かめる → 前のファイル名を控える → 書き込む → 定義を書き換える → 参照されなくなった画像を消す。
 * `clear` はほどく・上限確認・書き込みを飛ばす。
 */
function applyImageEdit<Image extends { readonly base64: string; readonly format: string }>(
  dir: string,
  definitionPath: string,
  content: string | undefined,
  edit: ImageEdit<Image>,
): boolean {
  if (edit.kind === "clear") {
    const previous = edit.previousFileName(content)
    writeFileSync(definitionPath, edit.withoutImage(content))
    removeUnreferencedImage(dir, previous)
    return true
  }

  const image = edit.parseImage(edit.image)
  if (image === undefined) {
    return false
  }

  const fileName = edit.fileName(image)
  if (!withinImageFileLimit(dir, fileName)) {
    return false
  }

  const previous = edit.previousFileName(content)
  writeFileSync(join(dir, fileName), Buffer.from(image.base64, "base64"))
  writeFileSync(definitionPath, edit.withImage(content, fileName))
  removeUnreferencedImage(dir, previous)
  return true
}

/** 立ち絵の差し替え（表情ごとに書き込み先とファイル名が変わる）。 */
function portraitSetEdit(expression: Expression, image: string): ImageEdit<PortraitImage> {
  return {
    kind: "set",
    image,
    parseImage: parsePortraitImage,
    fileName: (portrait) => portraitFileName(expression, portrait.format),
    previousFileName: (content) => portraitFileNameOf(content, expression),
    withImage: (content, fileName) => definitionWithPortrait(content, expression, fileName),
  }
}

/** 立ち絵の消去（`default` は消せないので {@link RemovableExpression} だけ受け取る）。 */
function portraitClearEdit(expression: RemovableExpression): ImageEdit<PortraitImage> {
  return {
    kind: "clear",
    previousFileName: (content) => portraitFileNameOf(content, expression),
    withoutImage: (content) => definitionWithoutPortrait(content, expression),
  }
}

/** 背景の差し替え（パックに1つだけなので、立ち絵と違い表情を受け取らない）。 */
function backgroundSetEdit(image: string): ImageEdit<BackgroundImage> {
  return {
    kind: "set",
    image,
    parseImage: parseBackgroundImage,
    fileName: (background) => backgroundFileName(background.format),
    previousFileName: backgroundFileNameOf,
    withImage: definitionWithBackground,
  }
}

/** 背景の消去。 */
function backgroundClearEdit(): ImageEdit<BackgroundImage> {
  return {
    kind: "clear",
    previousFileName: backgroundFileNameOf,
    withoutImage: definitionWithoutBackground,
  }
}

/** 顔の差し替え（パックに1つだけなので表情を受け取らない）。 */
function faceSetEdit(image: string): ImageEdit<FaceImage> {
  return {
    kind: "set",
    image,
    parseImage: parseFaceImage,
    fileName: (face) => faceFileName(face.format),
    previousFileName: faceFileNameOf,
    withImage: definitionWithFace,
  }
}

/** 顔の消去。 */
function faceClearEdit(): ImageEdit<FaceImage> {
  return {
    kind: "clear",
    previousFileName: faceFileNameOf,
    withoutImage: definitionWithoutFace,
  }
}

/** 書き換える前の、その表情の立ち絵のファイル名（定義が無い・読めないときは undefined）。 */
function portraitFileNameOf(
  content: string | undefined,
  expression: Expression,
): string | undefined {
  return content === undefined
    ? undefined
    : parseCharacterDefinition(content)?.portraits[expression]
}

/** 書き換える前の背景のファイル名（定義が無い・背景が無いときは undefined）。 */
function backgroundFileNameOf(content: string | undefined): string | undefined {
  return content === undefined ? undefined : parseCharacterDefinition(content)?.background?.image
}

/** 書き換える前の顔のファイル名（定義が無い・顔が無いときは undefined）。 */
function faceFileNameOf(content: string | undefined): string | undefined {
  return content === undefined ? undefined : parseCharacterDefinition(content)?.face
}

/**
 * 差し替え・消去で参照が外れた素材のファイルを消す（書いた先のディレクトリの中の、定義のどこからも参照されていない画像だけ）。
 * 形式を変えて差し替えたときに古い拡張子のファイルが残り続けるのを防ぐ。消せなくてもそのまま続ける。
 */
function removeUnreferencedImage(dir: string, fileName: string | undefined): void {
  if (fileName === undefined || !isCharacterImageFileName(fileName)) {
    return
  }

  const definition = readCharacterPack(dir).definition
  if (referencedImageFileNames(definition).includes(fileName)) {
    return
  }

  rmSync(join(dir, fileName), { force: true })
}

/**
 * 画像の数の上限を超えないか（背景も同じ数に入る）。
 * 同じ名前を上書きするだけなら増えないので、既にある名前はそのまま通す。
 */
function withinImageFileLimit(dir: string, fileName: string): boolean {
  const existing = readdirSync(dir).filter(isCharacterImageFileName)
  return existing.includes(fileName) || existing.length < MAX_IMAGE_FILES_PER_PACK
}

/**
 * 定義が指している素材のファイル名（立ち絵・ミニ立ち絵・背景・顔・訪問の peek。重複なし・ディレクトリを跨がないものだけ）。
 * 写す先と消してよいものの両方がこの一覧で決まる。
 */
function referencedImageFileNames(definition: CharacterDefinition | undefined): readonly string[] {
  const names = [
    ...Object.values(definition?.portraits ?? {}),
    definition?.mini,
    definition?.background?.image,
    definition?.face,
    definition?.visit?.peek,
  ].filter(isCharacterImageFileName)
  return [...new Set(names)]
}

/**
 * キャラクターの素材として扱ってよいファイル名か。
 * 定義ファイルに書かれた名前も外部由来なので、ディレクトリを跨ぐ名前（`../foo`）はここで落とす（写す・消すのがホームの1階層に閉じる）。
 */
function isCharacterImageFileName(name: string | undefined): name is string {
  return name !== undefined && basename(name) === name && classifyPortraitFile(name) !== undefined
}

/**
 * 新しいパックの必須の1枚を書き、表情ごとのファイル名を返す。
 * ほどけなかったときは undefined（境界で検証済みなので、起きるのは配線の誤りのときだけ）。
 */
function writeRequiredPortraits(
  dir: string,
  portraits: CharacterCreate["portraits"],
): Readonly<Record<RequiredExpression, string>> | undefined {
  const defaultImage = parsePortraitImage(portraits.default)
  if (defaultImage === undefined) {
    return undefined
  }

  const fileNames = {
    default: portraitFileName("default", defaultImage.format),
  }
  writeFileSync(join(dir, fileNames.default), Buffer.from(defaultImage.base64, "base64"))
  return fileNames
}

/**
 * 新しいパックの `character.json`。
 * 表示名（`name`）は空なら書かない。読む側が表示名の無いときにパック名へ落とすので、ここでパック名を代入し直さない。
 * 画面の差し色（仕事・雑談）は境界で両方 required なので、必ず2つとも書く。
 */
function newDefinitionJson(
  create: CharacterCreate,
  fileNames: Readonly<Record<RequiredExpression, string>>,
): string {
  const withName = definitionWithName(undefined, create.name)
  const withPortraits = definitionWithPortrait(withName, "default", fileNames.default)
  const withAccent = definitionWithAccent(withPortraits, "work", create.accent)
  return definitionWithAccent(withAccent, "chat", create.chatAccent)
}

/** 書きかけのディレクトリを消す（消せなくてもそのまま続ける）。 */
function discardDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 消せないだけ。定義ファイルを書く前に諦めているので、パックとしては一覧に出ない。
  }
}

function copyIfExists(from: string, to: string): void {
  try {
    copyFileSync(from, to)
  } catch {
    // 元が無いだけ（人格が無いパック・立ち絵が1枚だけのパック）。写せたものだけで続ける。
  }
}
