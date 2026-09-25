// いま出しているキャラクターパックと、切り替えの選択肢の持ち主。**`session.switchCharacter` と
// 画面からの編集で入れ替わる**ので、可変なのはこのファイルの中だけにする（呼ぶ側は
// 「いま出しているもの」を関数越しに引くだけで、いつ入れ替わったかを知らなくてよい）。
//
// ここは配線層（`src/` 直下。`shared` / `core` / `adapter` のすべてを import してよい。
// docs/design.md 2章「層と依存の向き」）。

import process from "node:process"

import { resolveBundledDir } from "./server/adapter/bundled-path.ts"
import {
  createCharacterPack,
  deleteCharacterPack,
  editCharacterPack,
} from "./server/character-pack/adapter/character-edit.ts"
import {
  type CharacterAssetFile,
  type CharacterPack,
  characterChangedEvent,
  DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  listCharacterPacks,
  readCharacterAsset,
  readCharacterPack,
} from "./server/character-pack/adapter/character-pack.ts"
import {
  type CharacterSelection,
  selectCharacterPack,
  selectInitialCharacterPack,
} from "./server/character-pack/core/character-selection.ts"
import { discardChatArchive } from "./server/chat/adapter/chat-archive.ts"
import { discardChatSummary } from "./server/chat/adapter/chat-summary.ts"
import { forgetRememberedLineFromScreen } from "./server/chat/adapter/persona-memory.ts"
import { type Config } from "./server/core/config.ts"
import {
  readRememberedCharacter,
  writeRememberedCharacter,
} from "./server/session/adapter/remembered-default.ts"
import { type CharacterAssetLocation } from "./shared/character-asset.ts"
import {
  type CharacterCreate,
  type CharacterDelete,
  type CharacterEdit,
} from "./shared/contract/character-pack.ts"
import { type SessionEvent } from "./shared/session-event.ts"

/** いま出しているキャラクターパックへの窓口。**持っているパックそのものは外へ出さない。** */
export type CurrentCharacter = {
  /**
   * いま出しているパックと全パックの一覧を画面へ流す形（`character-changed`）。**呼ぶたびに
   * パックの一覧を読み直す**ので、パックを変えた・作った・消したあとはこれを返せば一覧も
   * 配り直される（`docs/design.md` 7.2）。起こしたとき・起こし直したとき・
   * 見た目を変えたとき・作ったとき・消したときのすべてがここを通る。
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
   * 画面から届いた立ち絵・差し色・背景を `edit.pack` のパックへ書き込み、一覧ごと流し直す
   * `character-changed` を返す（受け付けられなければ undefined）。**使用中のパックなら書けた
   * パックにそのまま持ち替える**ので、そのパックの素材もこのあと書いた先から配る。使用中以外は
   * 持ち替えない（一覧を読み直すだけで、使用中の姿は変わらない）。
   */
  readonly applyEdit: (edit: CharacterEdit) => SessionEvent | undefined
  /**
   * 画面から届いた新しいパックを作り、**選択肢の増えた `character-changed` を返す**
   * （作れなければ undefined）。**いま出しているパックは持ち替えない** — 作るだけでは
   * 切り替えず、`<select>` から選んだときに起こし直す（docs/design.md 7.1）。
   */
  readonly applyCreate: (create: CharacterCreate) => SessionEvent | undefined
  /**
   * 画面から指されたパックのホームの版を消し、**選択肢の減った（同梱に戻ったものは同梱の姿の）
   * `character-changed` を返す**（消せなければ undefined。使用中は消さないので、いま出している
   * パックは持ち替えない）。**一覧から名前ごと消えたときだけ、そのパックの雑談の要約と
   * アーカイブも消す**（同じ名前で作り直したパックが古い記録を拾わないため。同梱に戻っただけなら
   * 同じキャラクターが続くので残す。`docs/design.md` 7.1「消すときの細部」）。
   */
  readonly applyDelete: (remove: CharacterDelete) => SessionEvent | undefined
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消し、**流し直す
   * `remembered-lines-changed` を返す**（一致する行が無い・書けない・そのパックが編集できない
   * ときは undefined。`docs/design.md` 7.1「1行だけ忘れる」）。
   */
  readonly forgetRememberedLine: (line: string) => SessionEvent | undefined
  /**
   * `/character/<pack>/<file>` に配ってよい1件（無いパック・allowlist に無い・ディスクに無い
   * ときは undefined）。**使用中以外のパックの素材も配る**（キャラクター画面の一覧と詳しい設定）。
   * 突き合わせる一覧は、最後に {@link event} で配ったときに読んだもの。
   */
  readonly serveAsset: (location: CharacterAssetLocation) => CharacterAssetFile | undefined
}

/**
 * 起動時の初期パックを決め、以降の持ち回りを引き受ける。**一覧は読み直せる形で持つ** —
 * 画面から立ち絵を変えるとホーム（`~/.tsukumo/characters/`）にパックが現れるので、
 * `character-changed` を組むたびに引き直す（docs/design.md 7.1）。
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

  // 起動時の初期パック（順位も知らない名前の落とし方も
  // src/server/character-pack/core/character-selection.ts）。
  // TSUKUMO_CHARACTER があるときはすでに defaultPack に反映されている。
  const initialPack = selectInitialCharacterPack({
    packs,
    fallback: defaultPack,
    specified: config.character,
    readRemembered: readRememberedCharacter,
  })
  let current = initialPack

  // 一覧を読み直してから組む。**画面に配った一覧と、素材を配るときに突き合わせる一覧を
  // 同じものにする**ため（配った URL が 404 にならない）。
  const event = (): SessionEvent => {
    packs = findPacks()
    return characterChangedEvent(current, packs, process.cwd())
  }

  // これから起こすパックを決め方から引く。**「画面から選ばれた名前」と「いま出しているパックの
  // まま」を分けて受ける**ので、モードを切り替えただけの起こし直しが名前として届かない
  // （docs/screen-design.md 13.6）。
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
      const edited = editCharacterPack(current, packs, edit, process.cwd())
      if (edited === undefined) {
        return undefined
      }
      if (edited.name === current.name) {
        current = edited
      }
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
      return event()
    },
    applyDelete: (remove) => {
      const removal = deleteCharacterPack(current, packs, remove)
      if (removal === undefined) {
        return undefined
      }
      if (removal === "delete") {
        discardChatSummary(remove.pack)
        discardChatArchive(remove.pack)
      }
      return event()
    },
    forgetRememberedLine: (line) => {
      const lines = forgetRememberedLineFromScreen(current, process.cwd(), line)
      return lines === undefined ? undefined : { kind: "remembered-lines-changed", lines }
    },
    serveAsset: (location) => readCharacterAsset(current, packs, location),
  }
}
