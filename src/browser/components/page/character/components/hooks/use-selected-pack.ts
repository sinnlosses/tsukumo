// キャラクター画面でいま右側に出しているパック（`docs/screen-design.md` 13.6）。hash の
// `pack`（`stores/screen.tsx` の `usePackSelection`）を、届いているパックの姿へ引き当てる。
// 一覧（`character-list.tsx`）と詳しい設定（`hooks/use-character-edit.ts`）の両方が読むので、
// container と対にならない概念のフックとしてここに置く（docs/design.md 2章「機能の中を分ける」）。
//
// 引き当て方:
//
// - 選んでいない・使用中の名前を選んでいる → 使用中の姿（`SessionState.character`）
// - 一覧にある使用中以外の名前 → 一覧の1件の姿（`CharacterPackEntry.character`）
// - 一覧に無い名前（消した・古い URL） → 使用中の姿に落ちる（行き止まりにしない）

import {
  type CharacterInfo,
  type CharacterPackRemoval,
} from "../../../../../../shared/character.ts"
import { usePackSelection } from "../../../../../stores/screen.tsx"
import { useSessionSelector } from "../../../../../stores/session.tsx"

export type SelectedPack =
  | {
      /** まだ `character-changed` が届いていない（接続直後の一瞬）。 */
      readonly kind: "waiting"
    }
  | {
      readonly kind: "ready"
      readonly character: CharacterInfo
      /** 使用中のパックか。使用中以外なら「このキャラクターに切り替える」を出す。 */
      readonly inUse: boolean
      /** 画面から消すと何が起きるか（一覧の同じ名前の1件から引く。7.1「消すときの細部」）。 */
      readonly removal: CharacterPackRemoval
    }

export function useSelectedPack(): SelectedPack {
  const selection = usePackSelection()
  const character = useSessionSelector((session) => session.state.character)
  const packs = useSessionSelector((session) => session.state.characterPacks)

  if (character === undefined) {
    return { kind: "waiting" }
  }

  const chosen =
    selection.kind === "named" && selection.name !== character.pack
      ? packs.find((entry) => entry.name === selection.name && !entry.inUse)
      : undefined
  if (chosen !== undefined) {
    return { kind: "ready", character: chosen.character, inUse: false, removal: chosen.removal }
  }
  const inUseEntry = packs.find((entry) => entry.name === character.pack)
  return { kind: "ready", character, inUse: true, removal: inUseEntry?.removal ?? "none" }
}
