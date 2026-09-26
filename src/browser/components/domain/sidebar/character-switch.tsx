// キャラクターの切り替えの `<select>`（`session.switchCharacter`。docs/design.md 7章）。置き場所は
// モードで2つに分かれる — 仕事のときは下端の帯（`session-info.tsx`。ラベル「キャラクター」の
// 真下）、雑談のときはプロフィールの札の「変える」（`profile-card.tsx`。見た目のボタンの上に
// 透明にして重ねる。docs/screen-design.md 13.7「雑談のときのサイドバー」）。どちらでも振る舞いは同じ
// なので、選択肢・値・塞ぐ条件・送るコマンドをここに1つだけ持ち、見た目（`frameClassName` /
// `className`）と名前（`ariaLabel`）だけを置く側が渡す（セッションの行の `session-switch.tsx` と対）。
//
// 次に届く `session-info` で選択が上書きされる（サーバ側の値が正になる）。選択肢が1つでも
// 出す（docs/design.md 7章）。パックの一覧がまだ届いていなければ何も出さない。

import { type ReactElement } from "react"

import { type CharacterPackChoice } from "../../../../shared/character.ts"
import { FRAME_ERROR_REASON } from "../../../../shared/frame.ts"
import { Select } from "../../../components/ui/select/select.tsx"
import { useSessionDispatch, useSessionSelector, useTurnRunning } from "../../../stores/session.tsx"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。理由の文面はサーバが
// 断るときと同じ1つ（`shared` の定型文）を使う。
const CHARACTER_SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

export type CharacterSwitchProps = {
  readonly id: string
  readonly ariaLabel: string
  readonly frameClassName: string
  readonly className: string
}

export function CharacterSwitch(props: CharacterSwitchProps): ReactElement | null {
  const dispatch = useSessionDispatch()
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)
  const currentPackName = useSessionSelector((session) => session.state.character?.pack)
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
 * `<select>` に選択済みで出すキャラクターパックの名前。素材が1体ぶんしか無くても
 * `<select>` は出す（無いように見えるほうが分かりにくい。docs/design.md 7章）ので、
 * いま出しているパックが分からないときは一覧の先頭に倒す。
 */
function resolveCharacterPack(
  packs: readonly CharacterPackChoice[],
  current: string | undefined,
): string {
  return packs.some((pack) => pack.name === current) ? (current ?? "") : (packs[0]?.name ?? "")
}
