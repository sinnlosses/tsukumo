// `character-pack` が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// 見た目の編集10種と、作る・消すの2種。**どれも駆動には渡らず、セッションも起こし直さない**
// （書いて、`character-changed` を流し直すだけ。`docs/design.md` 7.1）。

import {
  type CharacterCreateCommand,
  type CharacterDeleteCommand,
  type CharacterEditCommand,
} from "../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import {
  type FeatureCommandTable,
  NO_COMMAND_GUARD,
  type WriteReceiver,
} from "../../core/command-receiver.ts"

export type CharacterPackCommandPorts = {
  /**
   * `edit.pack` で指されたパック（使用中に限らない）の立ち絵・差し色・背景・顔・プロフィールを変え、
   * **画面へ流す `character-changed` を返す**（書き込み先と受け付けない条件は
   * `src/server/character-pack/adapter/character-edit.ts`）。受け付けられなかったときは undefined。
   *
   * **`speak` が受け付ける表情の一覧は起こしたときのまま**なので、立ち絵を足した表情を
   * キャラクター自身が選べるのは次の起動から。
   */
  readonly editCharacter: (edit: CharacterEditCommand) => Promise<SessionEvent | undefined>
  /**
   * 新しいパックを作り、選択肢の増えた `character-changed` を返す。**作ったパックへ切り替えはしない**
   * （切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない）。
   */
  readonly createCharacter: (create: CharacterCreateCommand) => Promise<SessionEvent | undefined>
  /**
   * パックを消し、選択肢の減った `character-changed` を返す（使用中・ホームに版の無いパックは
   * 消さない）。**ターン中も受け付ける**（使用中のパックは消せないので、いまの会話には触らない）。
   */
  readonly deleteCharacter: (remove: CharacterDeleteCommand) => Promise<SessionEvent | undefined>
}

/** `character-pack` が受けるコマンドの表。 */
export function characterPackCommands(
  ports: CharacterPackCommandPorts,
): FeatureCommandTable<CharacterEditCommand["type"] | "create-character" | "delete-character"> {
  // 見た目の編集10種は同じ1行（どれを変えるかは書き込む側がコマンドの種類で分ける）。
  const edit = {
    ...NO_COMMAND_GUARD,
    kind: "write",
    receive: ports.editCharacter,
    failure: FRAME_ERROR_REASON.characterEditFailed,
  } satisfies WriteReceiver<CharacterEditCommand>
  return {
    "set-portrait": edit,
    "clear-portrait": edit,
    "set-outfit-accent": edit,
    "set-accent": edit,
    "clear-chat-accent": edit,
    "set-profile": edit,
    "set-background": edit,
    "clear-background": edit,
    "set-face": edit,
    "clear-face": edit,
    "create-character": {
      ...NO_COMMAND_GUARD,
      kind: "write",
      receive: ports.createCharacter,
      failure: FRAME_ERROR_REASON.characterCreateFailed,
    },
    "delete-character": {
      ...NO_COMMAND_GUARD,
      kind: "write",
      receive: ports.deleteCharacter,
      failure: FRAME_ERROR_REASON.characterDeleteFailed,
    },
  }
}
