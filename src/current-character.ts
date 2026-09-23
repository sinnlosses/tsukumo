// いま出しているキャラクターパックと、切り替えの選択肢の持ち主。**`switch-character` と
// 画面からの編集で入れ替わる**ので、可変なのはこのファイルの中だけにする（呼ぶ側は
// 「いま出しているもの」を関数越しに引くだけで、いつ入れ替わったかを知らなくてよい）。
//
// ここは配線層（`src/` 直下。`shared` / `core` / `adapter` のすべてを import してよい。
// docs/design.md 2章「層と依存の向き」）。

import process from "node:process"

import { resolveBundledDir } from "./server/adapter/bundled-path.ts"
import { createCharacterPack, editCharacterPack } from "./server/adapter/character-edit.ts"
import {
  type CharacterAssetFile,
  type CharacterPack,
  characterChangedEvent,
  DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  isEditableCharacterPack,
  listCharacterPacks,
  readCharacterPack,
  readCharacterPackFile,
  toCharacterPackChoices,
} from "./server/adapter/character-pack.ts"
import { forgetRememberedLineFromScreen } from "./server/adapter/persona-memory.ts"
import {
  readRememberedCharacter,
  writeRememberedCharacter,
} from "./server/adapter/remembered-default.ts"
import {
  type CharacterSelection,
  selectCharacterPack,
  selectInitialCharacterPack,
} from "./server/core/character-selection.ts"
import { type Config } from "./server/core/config.ts"
import { type CharacterCreateCommand, type CharacterEditCommand } from "./shared/command.ts"
import { type SessionEvent } from "./shared/session-event.ts"

/** いま出しているキャラクターパックへの窓口。**持っているパックそのものは外へ出さない。** */
export type CurrentCharacter = {
  /**
   * いま出しているパックを画面へ流す形。**立ち絵の URL・選択肢・画面から変えられるかの3つ**を
   * 組み立てるのはここ1箇所で、起こしたときと見た目を変えたときの両方から呼ぶ。
   */
  readonly event: () => SessionEvent
  /**
   * これから起こすパックへ持ち替える（決め方の3つは {@link CharacterSelection}）。
   * **知らない名前は既定へ落ちる。**
   */
  readonly choose: (selection: CharacterSelection) => CharacterPack
  /** 画面から選んだパックを覚える（次の起動の初期値になる）。 */
  readonly remember: (pack: CharacterPack) => void
  /**
   * 画面から届いた立ち絵・差し色を書き込み、流し直す `character-changed` を返す
   * （受け付けられなければ undefined）。**書けたパックをそのまま持ち替える**ので、
   * `/character/<file>` もこのあと書いた先から配る。
   */
  readonly applyEdit: (edit: CharacterEditCommand) => SessionEvent | undefined
  /**
   * 画面から届いた新しいパックを作り、**選択肢の増えた `character-changed` を返す**
   * （作れなければ undefined）。**いま出しているパックは持ち替えない** — 作るだけでは
   * 切り替えず、`<select>` から選んだときに起こし直す（docs/design.md 7.1）。
   */
  readonly applyCreate: (create: CharacterCreateCommand) => SessionEvent | undefined
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消し、**流し直す
   * `remembered-lines-changed` を返す**（一致する行が無い・書けない・そのパックが編集できない
   * ときは undefined。`docs/design.md` 7.1「1行だけ忘れる」）。
   */
  readonly forgetRememberedLine: (line: string) => SessionEvent | undefined
  /** `/character/<file>` に配ってよい1件（allowlist に無い・ディスクに無いときは undefined）。 */
  readonly serveAsset: (fileName: string) => CharacterAssetFile | undefined
}

/**
 * 起動時の初期パックを決め、以降の持ち回りを引き受ける。**一覧は読み直せる形で持つ** —
 * 画面から立ち絵を変えるとホーム（`~/.tsukumo/characters/`）にパックが現れるので、
 * そのときに引き直す（docs/design.md 7.1）。
 */
export function createCurrentCharacter(config: Config): CurrentCharacter {
  const defaultPack = readCharacterPack(
    resolveBundledDir(config.character, process.cwd(), DEFAULT_CHARACTER_DIR_RELATIVE_PATH),
  )
  const findPacks = (): readonly CharacterPack[] => {
    const found = listCharacterPacks(process.cwd())
    // 既定のパックが一覧に無いとき（`TSUKUMO_CHARACTER` で別の場所を指したとき）も選択肢に足す
    // （いま出しているものが `<select>` に無いと、選択の表示がずれる）。
    return found.some((pack) => pack.name === defaultPack.name) ? found : [...found, defaultPack]
  }
  let packs = findPacks()

  // 起動時の初期パック（順位も知らない名前の落とし方も src/server/core/character-selection.ts）。
  // TSUKUMO_CHARACTER があるときはすでに defaultPack に反映されている。
  const initialPack = selectInitialCharacterPack({
    packs,
    fallback: defaultPack,
    specified: config.character,
    readRemembered: readRememberedCharacter,
  })
  let current = initialPack

  const event = (): SessionEvent =>
    characterChangedEvent(
      current,
      toCharacterPackChoices(packs),
      isEditableCharacterPack(current, process.cwd()),
    )

  // これから起こすパックを決め方から引く。**「画面から選ばれた名前」と「いま出しているパックの
  // まま」を分けて受ける**ので、モードを切り替えただけの起こし直しが名前として届かない
  // （docs/design.md 13.6）。
  const chosen = (selection: CharacterSelection): CharacterPack => {
    switch (selection.by) {
      case "initial":
        return initialPack
      case "name":
        return selectCharacterPack(packs, defaultPack, selection.name)
      case "current":
        return current
    }
  }

  return {
    event,
    choose: (selection) => {
      current = chosen(selection)
      return current
    },
    remember: (pack) => writeRememberedCharacter(pack.name),
    applyEdit: (edit) => {
      const edited = editCharacterPack(current, edit, process.cwd())
      if (edited === undefined) {
        return undefined
      }
      current = edited
      packs = findPacks()
      return event()
    },
    applyCreate: (create) => {
      const created = createCharacterPack(
        create,
        packs.map((pack) => pack.name),
      )
      if (created === undefined) {
        return undefined
      }
      packs = findPacks()
      return event()
    },
    forgetRememberedLine: (line) => {
      const lines = forgetRememberedLineFromScreen(current, process.cwd(), line)
      return lines === undefined ? undefined : { kind: "remembered-lines-changed", lines }
    },
    serveAsset: (fileName) => readCharacterPackFile(current, fileName),
  }
}
