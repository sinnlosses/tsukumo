// 雑談中のサイドバーの最上段、プロフィールの札（docs/design.md 13.7「雑談のときのサイドバー」）。
// 顔（`CharacterInfo.face`。13.9「顔」）・名前・ひとことプロフィール（`CharacterInfo.tagline`）と、
// 右端の「変える ⌄」でキャラクターを切り替える。
//
// **「変える」は見た目のボタンの上に、透明にした本物の `<select>` を重ねたもの**
// （`character-switch.tsx`）。**⌄ は共有の `<Select>` の枠が描く矢印**で、枠ごと札の口いっぱいに
// 広げるので、`<select>` を透明にしても矢印だけは見えたまま残る。押すとブラウザの選択肢の一覧が開き、キーボード（矢印・先頭の字・
// Esc）も読み上げもブラウザが持つ。独自の開閉にしない理由は 13.9「採らなかった案」の
// 「ドロップダウンを独自の開閉にする」と同じ。**見える字は「変える」のまま**で、選んでいる
// パックの名前は札の名前の側が見せる。
//
// 名前もひとことプロフィールも**無ければその行を置かない**（空の行を出さない。顔も
// `<CharacterFace>` が何も描かない）。

import { type ReactElement } from "react"

import { CharacterFace } from "../../components/character-face.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import { CharacterSwitch } from "./character-switch.tsx"
import styles from "./sidebar.module.css"

const PROFILE_CHARACTER_SELECT_ID = "tsukumo-profile-character"

export function ProfileCard(): ReactElement {
  const faceUrl = useSessionSelector((session) => session.state.character?.face)
  const name = useSessionSelector((session) => session.state.character?.name)
  const tagline = useSessionSelector((session) => session.state.character?.tagline)
  const hasCharacterPacks = useSessionSelector((session) => session.state.characterPacks.length > 0)

  return (
    <section className={styles["profile-card"]} aria-label="プロフィール">
      <CharacterFace url={faceUrl} alt={name ?? ""} className={styles["profile-card-face"] ?? ""} />
      <div className={styles["profile-card-text"]}>
        {name === undefined ? null : <p className={styles["profile-card-name"]}>{name}</p>}
        {tagline === undefined ? null : <p className={styles["profile-card-tagline"]}>{tagline}</p>}
      </div>
      {hasCharacterPacks ? (
        <span className={styles["profile-card-change"]}>
          <span aria-hidden="true" className={styles["profile-card-change-face"]}>
            変える
          </span>
          <CharacterSwitch
            id={PROFILE_CHARACTER_SELECT_ID}
            ariaLabel="キャラクターを変える"
            frameClassName={styles["profile-card-change-frame"] ?? ""}
            className={styles["profile-card-change-select"] ?? ""}
          />
        </span>
      ) : null}
    </section>
  )
}
