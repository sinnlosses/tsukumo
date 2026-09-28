// キャラクターの切り替えの `<select>`（`session.switchCharacter`）。
// 見た目（`frameClassName` / `className`）と名前（`ariaLabel`）は置く側が渡す。
//
// 次に届く `session-info` で選択が上書きされる（サーバ側の値が正になる）。
// パックの一覧がまだ届いていなければ何も出さない。

import type { ReactElement } from "react"

import type { CharacterPackChoice } from "../../../../shared/character-pack/character.ts"
import { FRAME_ERROR_REASON } from "../../../../shared/frame.ts"
import { useSession, useTurnRunning } from "../../../stores/session.ts"
import { Select } from "../../ui/select/select.tsx"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。
// 理由の文面はサーバが断るときと同じ `shared` の定型文を使う。
const CHARACTER_SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

export type CharacterSwitchProps = {
  readonly id: string
  readonly ariaLabel: string
  readonly frameClassName: string
  readonly className: string
}

export function CharacterSwitch(props: CharacterSwitchProps): ReactElement | null {
  const dispatch = useSession((session) => session.dispatch)
  const characterPacks = useSession((session) => session.state.characterPacks)
  const currentPackName = useSession((session) => session.state.character?.pack)
  const turnInProgress = useTurnRunning()

  if (characterPacks.length === 0) {
    return null
  }

  return (
    <Select
      id={props.id}
      ariaLabel={props.ariaLabel}
      frameClassName={props.frameClassName}
      className={props.className}
      value={resolveCharacterPack(characterPacks, currentPackName)}
      disabled={turnInProgress}
      title={turnInProgress ? CHARACTER_SWITCH_BLOCKED_TITLE : undefined}
      options={characterPacks.map(({ name, label }) => ({ value: name, label }))}
      onChange={(value) => {
        dispatch.session.switchCharacter({ name: value })
      }}
    />
  )
}

/**
 * `<select>` に選択済みで出すキャラクターパックの名前。
 * 選択肢が1つでも `<select>` は出すので、いま出しているパックが分からないときは一覧の先頭に倒す。
 */
function resolveCharacterPack(
  packs: readonly CharacterPackChoice[],
  current: string | undefined,
): string {
  return packs.some((pack) => pack.name === current) ? (current ?? "") : (packs[0]?.name ?? "")
}
