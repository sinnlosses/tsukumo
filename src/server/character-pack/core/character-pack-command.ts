// `character-pack` が受けるコマンドの表と口。見た目の編集12種と、作る・消すの2種と、作る前に欄を埋める生成。
// どれも駆動には渡らず、セッションも起こし直さない（書いて、`character-changed` を流し直すだけ）。

import type { GeneratedCharacter } from "../../../shared/character-pack/generated-character.ts"
import type {
  CharacterCreate,
  CharacterDelete,
  CharacterEdit,
  characterPackContract,
} from "../../../shared/contract/character-pack.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { FeatureCommandTable, WriteReceiver } from "../../core/command-receiver.ts"

export type CharacterPackCommandPorts = {
  /**
   * `edit.pack` で指されたパック（使用中に限らない）の立ち絵・差し色・背景・顔・プロフィールを変え、画面へ流す `character-changed` を返す。
   * 受け付けられなかったときは undefined。
   *
   * `speak` が受け付ける表情の一覧は起こしたときのままなので、立ち絵を足した表情をキャラクター自身が選べるのは次の起動から。
   */
  readonly editCharacter: (edit: CharacterEdit) => Promise<SessionEvent | undefined>
  /**
   * 新しいパックを作り、選択肢の増えた `character-changed` を返す。
   * 作ったパックへ切り替えはしない（切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない）。
   */
  readonly createCharacter: (create: CharacterCreate) => Promise<SessionEvent | undefined>
  /**
   * パックを消し、選択肢の減った `character-changed` を返す（使用中・ホームに版の無いパックは消さない）。
   * ターン中も受け付ける（使用中のパックは消せないので、いまの会話には触らない）。
   */
  readonly deleteCharacter: (remove: CharacterDelete) => Promise<SessionEvent | undefined>
  /**
   * 立ち絵1枚の data URL から作るダイアログの欄の値を生成して返す。何も書き込まない。
   * 生成できなかったときは undefined。
   */
  readonly generateFromPortrait: (portrait: string) => Promise<GeneratedCharacter | undefined>
}

/**
 * `character-pack` が受けるコマンドの表。
 * 値を返す `generateFromPortrait` は表の行の種類に無いので、表には載せず手続きが直に受ける。
 */
export function characterPackCommands(
  ports: CharacterPackCommandPorts,
): FeatureCommandTable<Omit<typeof characterPackContract, "generateFromPortrait">> {
  // 見た目の編集12種は同じ口へ渡す（どれを変えるかは書き込む側が `kind` で分ける）。
  const edit = <C>(kindOf: (input: C) => CharacterEdit): WriteReceiver<C> => ({
    kind: "write",
    receive: (input) => ports.editCharacter(kindOf(input)),
    failure: FRAME_ERROR_REASON.characterEditFailed,
  })
  return {
    setPortrait: edit((input) => ({ kind: "setPortrait", ...input })),
    clearPortrait: edit((input) => ({ kind: "clearPortrait", ...input })),
    setAccent: edit((input) => ({ kind: "setAccent", ...input })),
    clearChatAccent: edit((input) => ({ kind: "clearChatAccent", ...input })),
    setProfile: edit((input) => ({ kind: "setProfile", ...input })),
    setPersona: edit((input) => ({ kind: "setPersona", ...input })),
    setBackground: edit((input) => ({ kind: "setBackground", ...input })),
    clearBackground: edit((input) => ({ kind: "clearBackground", ...input })),
    setFace: edit((input) => ({ kind: "setFace", ...input })),
    clearFace: edit((input) => ({ kind: "clearFace", ...input })),
    setMini: edit((input) => ({ kind: "setMini", ...input })),
    clearMini: edit((input) => ({ kind: "clearMini", ...input })),
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
