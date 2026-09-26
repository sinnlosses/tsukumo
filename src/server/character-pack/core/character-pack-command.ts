// `character-pack` が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// 見た目の編集10種と、作る・消すの2種。手続き（`character-pack/adapter/character-pack-procedure.ts`）が
// ここの行へ委ねる。どれも駆動には渡らず、セッションも起こし直さない
// （書いて、`character-changed` を流し直すだけ。`docs/design.md` 7.1）。

import {
  type CharacterCreate,
  type CharacterDelete,
  type CharacterEdit,
  type characterPackContract,
} from "../../../shared/contract/character-pack.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type FeatureCommandTable, type WriteReceiver } from "../../core/command-receiver.ts"

export type CharacterPackCommandPorts = {
  /**
   * `edit.pack` で指されたパック（使用中に限らない）の立ち絵・差し色・背景・顔・プロフィールを変え、
   * 画面へ流す `character-changed` を返す（書き込み先と受け付けない条件は
   * `src/server/character-pack/adapter/character-edit.ts`）。受け付けられなかったときは undefined。
   *
   * `speak` が受け付ける表情の一覧は起こしたときのままなので、立ち絵を足した表情を
   * キャラクター自身が選べるのは次の起動から。
   */
  readonly editCharacter: (edit: CharacterEdit) => Promise<SessionEvent | undefined>
  /**
   * 新しいパックを作り、選択肢の増えた `character-changed` を返す。作ったパックへ切り替えはしない
   * （切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない）。
   */
  readonly createCharacter: (create: CharacterCreate) => Promise<SessionEvent | undefined>
  /**
   * パックを消し、選択肢の減った `character-changed` を返す（使用中・ホームに版の無いパックは
   * 消さない）。ターン中も受け付ける（使用中のパックは消せないので、いまの会話には触らない）。
   */
  readonly deleteCharacter: (remove: CharacterDelete) => Promise<SessionEvent | undefined>
}

/** `character-pack` が受けるコマンドの表。 */
export function characterPackCommands(
  ports: CharacterPackCommandPorts,
): FeatureCommandTable<typeof characterPackContract> {
  // 見た目の編集10種は同じ口へ渡す（どれを変えるかは書き込む側が `kind` で分ける）。
  const edit = <C>(kindOf: (input: C) => CharacterEdit): WriteReceiver<C> => ({
    kind: "write",
    receive: (input) => ports.editCharacter(kindOf(input)),
    failure: FRAME_ERROR_REASON.characterEditFailed,
  })
  return {
    setPortrait: edit((input) => ({ kind: "setPortrait", ...input })),
    clearPortrait: edit((input) => ({ kind: "clearPortrait", ...input })),
    setOutfitAccent: edit((input) => ({ kind: "setOutfitAccent", ...input })),
    setAccent: edit((input) => ({ kind: "setAccent", ...input })),
    clearChatAccent: edit((input) => ({ kind: "clearChatAccent", ...input })),
    setProfile: edit((input) => ({ kind: "setProfile", ...input })),
    setBackground: edit((input) => ({ kind: "setBackground", ...input })),
    clearBackground: edit((input) => ({ kind: "clearBackground", ...input })),
    setFace: edit((input) => ({ kind: "setFace", ...input })),
    clearFace: edit((input) => ({ kind: "clearFace", ...input })),
    create: {
      kind: "write",
      receive: ports.createCharacter,
      failure: FRAME_ERROR_REASON.characterCreateFailed,
    },
    delete: {
      kind: "write",
      receive: ports.deleteCharacter,
      failure: FRAME_ERROR_REASON.characterDeleteFailed,
    },
  }
}
