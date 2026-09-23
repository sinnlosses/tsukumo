// サイドバーの「セッション情報」。**残るのはキャラクターとセッションの切り替えだけ**
// （docs/design.md 13.9「何を外すか」）。仕事/雑談のトグル・モデル・許可モードの
// ドロップダウンは帯（`features/screen-nav/`）へ移った。**置かれるのは区画ではなくサイドバーの
// 下端の帯**（`.sidebar-footer`。`sidebar.tsx`）なので、見出しは名乗らない。
//
// キャラクターの `<select>`（`character-switch.tsx`）は変更で `switch-character` を `dispatch`
// する。**雑談中はここに置かない** — キャラクターの切り替えはプロフィールの札の「変える」へ
// 移り（`profile-card.tsx`。docs/design.md 13.7「雑談のときのサイドバー」）、帯に残るのは
// セッションの行だけになる。
//
// **キャラクターの左には顔を添える**（`CharacterInfo.face`。帯と共有する
// `components/character-face.tsx`。`docs/design.md` 13.9「顔」）。
// `face` が無いパックでは `<CharacterFace>` が何も描かない。

import { type ReactElement } from "react"

import { CharacterFace } from "../../components/character-face.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import { CharacterSwitch } from "./character-switch.tsx"
import { SessionSwitch } from "./session-switch.tsx"
import styles from "./sidebar.module.css"

const CHARACTER_SELECT_ID = "tsukumo-character"

export type SessionInfoProps = {
  /** キャラクターの対（ラベル・顔・`<select>`）を置くか。雑談中は札の「変える」が持つので置かない。 */
  readonly withCharacter: boolean
}

/**
 * `.session-info` は grid-auto-flow: column（`sidebar.module.css`）で、ラベルと値
 * （`<select>` を含む `<span>`）を直接の子として並べる。DOM の並び（ラベル→値の対を
 * キャラクター→セッションの順で並べる）はそのまま、CSS 側が**対ごとに列を等分して値をラベルの
 * 真下に置く**ので、ここでは行ごとに別々の入れ物を作らない（キャラクターとセッションが
 * 横に並んで見える）。
 */
export function SessionInfo(props: SessionInfoProps): ReactElement {
  const hasCharacterPacks = useSessionSelector((session) => session.state.characterPacks.length > 0)
  const faceUrl = useSessionSelector((session) => session.state.character?.face)
  const characterName = useSessionSelector((session) => session.state.character?.name)

  return (
    <div className={styles["session-info"]}>
      {props.withCharacter && hasCharacterPacks ? (
        <>
          <label htmlFor={CHARACTER_SELECT_ID} className={styles["session-info-label"]}>
            キャラクター
          </label>
          <span className={styles["session-info-value"]}>
            <CharacterFace
              url={faceUrl}
              alt={characterName ?? ""}
              className={styles["session-info-face"] ?? ""}
            />
            <CharacterSwitch
              id={CHARACTER_SELECT_ID}
              ariaLabel="キャラクター"
              frameClassName={styles["session-info-select-frame"] ?? ""}
              className={styles["character-select"] ?? ""}
            />
          </span>
        </>
      ) : null}
      {/* セッションの行（`session-switch.tsx`）。**同じ grid の直の子**として並ぶよう、
          入れ物を挟まずラベルと値の対だけを返す部品にしてある。切り替え先が無ければ
          何も出さない。 */}
      <SessionSwitch />
    </div>
  )
}
