// 画面から届いたキャラクターの変更（**新しいパックを作る**・立ち絵と差し色と背景を差し替える・
// **パックを消す**）をキャラクターパックに書き込む。**書き込んでよい・消してよいのは
// `~/.tsukumo/characters/<name>/` の下だけ**（`docs/design.md` 7.1。`state.json` と同じ親の下で、
// リポジトリの作業ツリーが汚れない）。読む側は `src/server/adapter/character-pack.ts`。
//
// **ディレクトリ名になる名前だけは外から受け取る**（新しいパックを作るときの `<name>`）ので、
// 形は境界（`src/shared/character.ts` の `isCharacterPackName`）で見てある。ここは**既にある
// 名前とぶつかったら書かない**ことだけを見る（後勝ちで既存のパックが黙って隠れないため）。
//
// **ファイル名を外から受け取らない。** 立ち絵の名前は表情と形式から組み立て
// （`src/shared/portrait-image.ts` の `portraitFileName`）、背景の名前は形式だけから組み立てる
// （`src/shared/character-background.ts` の `backgroundFileName`）ので、届いた文字列がパスの一部に
// なる経路がそもそも無い。
//
// **書き込む先のパックはコマンドの `pack` で指す**（使用中のパックに限らない）。名前は一覧と
// 突き合わせて引くだけで、パスには使わない（書く先はホームの下の、引けたパックの名前）。
//
// **書き込む前に、書き込む先のパックをホームへ丸ごと写す**（同梱のパックを直さないため）。
// 写すのは定義・人格・定義が指している素材（立ち絵・背景）で、ホームに既に同じ名前のパックが
// あるときは写さない（画面から重ねた変更を上書きしてしまわないため）。
//
// 失敗しても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。受け付けられなかった回は undefined を
// 返し、呼び出し側が定型文の `error` を返す。

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, join } from "node:path"

import { classifyPortraitFile } from "../../shared/character-asset.ts"
import { backgroundFileName, parseBackgroundImage } from "../../shared/character-background.ts"
import {
  type CharacterDefinition,
  definitionWithAccent,
  definitionWithBackground,
  definitionWithOutfitAccent,
  definitionWithoutBackground,
  definitionWithoutChatAccent,
  definitionWithoutPortrait,
  definitionWithPortrait,
  parseCharacterDefinition,
} from "../../shared/character-definition.ts"
import { type CharacterPackRemoval } from "../../shared/character.ts"
import {
  type CharacterCreateCommand,
  type CharacterDeleteCommand,
  type CharacterEditCommand,
} from "../../shared/command.ts"
import { type Expression, EXPRESSIONS, type RequiredExpression } from "../../shared/expression.ts"
import { parsePortraitImage, portraitFileName } from "../../shared/portrait-image.ts"
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
} from "./character-pack.ts"

/** 表情ごとの立ち絵のほかに1つのパックが持てる画像（ミニ立ち絵1・背景1）。 */
const EXTRA_IMAGE_FILES_PER_PACK = 2

/**
 * 1つのパックが持てる画像の数（`docs/design.md` 7.1 の表）。**立ち絵・ミニ立ち絵・背景を
 * 全部入れた数**で、表情の全体（{@link EXPRESSIONS}）＋ ミニ立ち絵1 ＋ 背景1。
 *
 * **数を直に書かないのは、表情を足したときに黙って足りなくなるから。** 表情が 6つから8つに
 * 増えたあとも 8 のまま据え置かれていて、立ち絵を全部そろえたパックでは背景の差し替えだけが
 * 弾かれていた（13.8）。
 */
export const MAX_IMAGE_FILES_PER_PACK = EXPRESSIONS.length + EXTRA_IMAGE_FILES_PER_PACK

/**
 * `edit.pack` で指されたパックに立ち絵1枚・差し色1色・背景1枚を書き込み、**書けたパックを
 * 読み直して返す**（呼び出し側は、使用中のパックならそれに持ち替え、どちらでも
 * `characterChangedEvent` で一覧ごと画面へ流し直す）。受け付けられなかったときは undefined:
 *
 * - 一覧（`current` と `packs`。素材を配るのと同じ `findCharacterPack` の規則）に無い名前
 * - 起動先の `characters/local` と同じ名前のパック（書いても次の起動で読まれない。7.1）
 * - 画像（立ち絵・背景）の数が {@link MAX_IMAGE_FILES_PER_PACK} を超える
 * - ディスクに書けない
 *
 * `root` は書き込み先の親（既定は `~/.tsukumo/characters`。差し替えられるのは置き場所だけで、
 * テストがホームを汚さないためにある）。
 */
export function editCharacterPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  edit: CharacterEditCommand,
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
 * 新しいキャラクターパックを1つ作り、**作れたパックを読み直して返す**（呼び出し側はそれを
 * `characterChangedEvent` に渡し、増えた選択肢を画面へ流す）。作らないときは undefined:
 *
 * - `taken`（いま切り替えられるパックの名前）に同じ名前がある。**既存の名前は弾く** —
 *   探索の順で後ろが勝つので、黙って既存のパックを隠してしまわないため
 * - 書き込み先に同じ名前のディレクトリが既にある（一覧に出ていない壊れたパックの置き場）
 * - ディスクに書けない（**書きかけのディレクトリは消す**ので、欠けたパックは残らない）
 *
 * **`default` の1枚があることは境界で済んでいる**
 * （`src/shared/command.ts` の `portraits` が required）。ここは書く順だけを守る:
 * 素材 → 定義の順に書くので、途中で失敗したディレクトリは `character.json` を持たず、
 * パックとして一覧に出ない。
 */
export function createCharacterPack(
  create: CharacterCreateCommand,
  taken: readonly string[],
  root: string = homeCharacterDir(),
): CharacterPack | undefined {
  const dir = join(root, create.name)
  if (taken.includes(create.name) || existsSync(dir)) {
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
 * `remove.pack` で指されたパックの**ホームの版**（`<roots.home>/<name>`）を消し、**消して起きた
 * こと**を返す（`"delete"` なら一覧から消え、`"revert-to-bundled"` なら同梱の版が一覧に戻る。
 * 呼び出し側は一覧を読み直して `character-changed` を流し直し、`"delete"` のときだけ雑談の
 * 記録も消す。`docs/design.md` 7.1「消すときの細部」）。消さないときは undefined:
 *
 * - 一覧（素材を配る・見た目を変えるのと同じ `findCharacterPack` の規則）に無い名前
 * - 使用中のパック（`current`）
 * - 一覧に勝ち残ったのがホームの版ではない（同梱だけ・起動先の `characters/local`・
 *   `TSUKUMO_CHARACTER` で指した一覧の外。{@link characterPackRemoval} が `"none"`）
 * - ディスクから消せない
 *
 * **消す先はホームの置き場と一覧の名前から組む**（`characterPackRemoval` が、一覧のパックの
 * 場所がまさにそこだと確かめてある）。届いた名前はパスに使わない。ホームの版がシンボリック
 * リンクなら消えるのはリンクだけで、指している先は残る（`rmSync` はリンクを辿らない）。
 *
 * `roots` は同梱とホームの置き場（既定は本物の置き場。差し替えられるのはテストがホームを
 * 汚さないためにある）。
 */
export function deleteCharacterPack(
  current: CharacterPack,
  packs: readonly CharacterPack[],
  remove: CharacterDeleteCommand,
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
 * ホームにまだ同じ名前のパックが無ければ、書き込む先のパックを丸ごと写す。**人格
 * （`persona.md`）も写す**（写し忘れると、次の起動でそのパックの人格が消える）。
 *
 * **ホームへ書く前に必ず通る道**なので、立ち絵の差し替え以外の書き込み
 * （`src/server/adapter/persona-memory.ts`）もここを共有する（写す規則を二重に書かない）。
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
function applyEdit(dir: string, edit: CharacterEditCommand): boolean {
  const definitionPath = join(dir, CHARACTER_DEFINITION_FILE_NAME)
  const content = readOptionalFile(definitionPath)

  switch (edit.type) {
    case "set-outfit-accent":
      writeFileSync(definitionPath, definitionWithOutfitAccent(content, edit.outfit, edit.color))
      return true
    case "set-accent":
      writeFileSync(definitionPath, definitionWithAccent(content, edit.target, edit.color))
      return true
    case "clear-chat-accent":
      writeFileSync(definitionPath, definitionWithoutChatAccent(content))
      return true
    case "clear-portrait": {
      const previous = portraitFileNameOf(content, edit.expression)
      writeFileSync(definitionPath, definitionWithoutPortrait(content, edit.expression))
      removeUnreferencedImage(dir, previous)
      return true
    }
    case "set-portrait": {
      // 検証は境界（`src/shared/command.ts` の `portraitDataUrlSchema`）で済んでいるので、
      // ここで undefined になるのは配線の誤りのときだけ。型を迂回せずほどくために、もう一度
      // 同じ関数を通す。
      const image = parsePortraitImage(edit.image)
      if (image === undefined) {
        return false
      }

      const fileName = portraitFileName(edit.expression, image.format)
      if (!withinImageFileLimit(dir, fileName)) {
        return false
      }

      const previous = portraitFileNameOf(content, edit.expression)
      writeFileSync(join(dir, fileName), Buffer.from(image.base64, "base64"))
      writeFileSync(definitionPath, definitionWithPortrait(content, edit.expression, fileName))
      removeUnreferencedImage(dir, previous)
      return true
    }
    case "clear-background": {
      const previous = backgroundFileNameOf(content)
      writeFileSync(definitionPath, definitionWithoutBackground(content))
      removeUnreferencedImage(dir, previous)
      return true
    }
    case "set-background": {
      // 立ち絵と同じく、検証は境界（`src/shared/command.ts`）で済んでいる。ここで undefined に
      // なるのは配線の誤りのときだけ。
      const image = parseBackgroundImage(edit.image)
      if (image === undefined) {
        return false
      }

      const fileName = backgroundFileName(image.format)
      if (!withinImageFileLimit(dir, fileName)) {
        return false
      }

      const previous = backgroundFileNameOf(content)
      writeFileSync(join(dir, fileName), Buffer.from(image.base64, "base64"))
      writeFileSync(definitionPath, definitionWithBackground(content, fileName))
      removeUnreferencedImage(dir, previous)
      return true
    }
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

/**
 * 差し替え・消去で参照が外れた素材のファイルを消す（**書いた先のディレクトリの中の、
 * 定義のどこからも参照されていない画像だけ**）。形式を変えて差し替えたときに古い拡張子の
 * ファイルが残り続けるのを防ぐ。消せなくてもそのまま続ける。
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
 * 画像の数の上限を超えないか（**背景も同じ数に入る**。7.1 / 13.8）。**同じ名前を上書きする
 * だけなら増えない**ので、既にある名前はそのまま通す。
 */
function withinImageFileLimit(dir: string, fileName: string): boolean {
  const existing = readdirSync(dir).filter(isCharacterImageFileName)
  return existing.includes(fileName) || existing.length < MAX_IMAGE_FILES_PER_PACK
}

/**
 * 定義が指している素材のファイル名（立ち絵・ミニ立ち絵・背景。重複なし・ディレクトリを
 * 跨がないものだけ）。**写す先と消してよいものの両方がこの一覧で決まる。**
 */
function referencedImageFileNames(definition: CharacterDefinition | undefined): readonly string[] {
  const names = [
    ...Object.values(definition?.portraits ?? {}),
    definition?.mini,
    definition?.background?.image,
  ].filter(isCharacterImageFileName)
  return [...new Set(names)]
}

/**
 * キャラクターの素材として扱ってよいファイル名か。**定義ファイルに書かれた名前も外部由来**な
 * ので、ディレクトリを跨ぐ名前（`../foo`）はここで落とす（写す・消すのがホームの1階層に閉じる）。
 */
function isCharacterImageFileName(name: string | undefined): name is string {
  return name !== undefined && basename(name) === name && classifyPortraitFile(name) !== undefined
}

/**
 * 新しいパックの必須の1枚を書き、表情ごとのファイル名を返す。**ほどけなかったときは
 * undefined**（境界で検証済みなので、ここで起きるのは配線の誤りのときだけ。型を迂回せず
 * ほどくために、`editCharacterPack` と同じ関数をもう一度通す）。
 */
function writeRequiredPortraits(
  dir: string,
  portraits: CharacterCreateCommand["portraits"],
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
 * 新しいパックの `character.json`。**表示名はディレクトリ名と同じ**（画面から表示名を変える口は
 * まだ無いので、あとから定義ファイルを手で直す前提。`characters/README.md`）。差し色は
 * `default` の1色だけを入れ、衣装ごとの出し分けは作ったあと「見た目」の引き出しで変える。
 */
function newDefinitionJson(
  create: CharacterCreateCommand,
  fileNames: Readonly<Record<RequiredExpression, string>>,
): string {
  const withPortraits = definitionWithPortrait(
    JSON.stringify({ name: create.name }),
    "default",
    fileNames.default,
  )
  return definitionWithOutfitAccent(withPortraits, "default", create.accent)
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

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
