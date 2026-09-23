// サイドバーの「セッション情報」。**残るのはキャラクターとセッションの切り替えだけ**
// （docs/design.md 13.9「何を外すか」）。仕事/雑談のトグル・モデル・許可モードの
// ドロップダウンは帯（`features/screen-nav/`）へ移った。
//
// キャラクターの `<select>`（共有部品。`src/browser/components/select.tsx`）は変更で
// `switch-character` を `dispatch` する。**次に届く `session-info` で `<select>` の選択が
// 上書きされる**（サーバ側の値が正になる）。**選択肢が1つでも出す**（docs/design.md 7章）。

import { type ReactElement } from "react"

import { type CharacterPackChoice } from "../../../shared/character.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { Select } from "../../components/select.tsx"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import { SessionSwitch } from "./session-switch.tsx"
import styles from "./sidebar.module.css"

const CHARACTER_SELECT_ID = "tsukumo-character"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。理由の文面は**サーバが
// 断るときと同じ1つ**（`shared` の定型文）を使う。
const CHARACTER_SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/**
 * `<select>` に選択済みで出すキャラクターパックの名前。**素材が1体ぶんしか無くても
 * `<select>` は出す**（無いように見えるほうが分かりにくい。docs/design.md 7章）ので、
 * いま出しているパックが分からないときは一覧の先頭に倒す。
 */
function resolveCharacterPack(
  packs: readonly CharacterPackChoice[],
  current: string | undefined,
): string {
  return packs.some((pack) => pack.name === current) ? (current ?? "") : (packs[0]?.name ?? "")
}

/**
 * `.session-info` は2列の grid（`sidebar.module.css`）で、ラベルと値（`<select>`）を
 * 直接の子として並べる。行ごとに別々の flex で並べると、ラベルの文字数の差がそのまま
 * `<select>` の左端のズレになるため、行の境目を div で区切らずグリッド1つに任せる。
 */
export function SessionInfo(): ReactElement {
  const dispatch = useSessionDispatch()
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)
  const currentPackName = useSessionSelector((session) => session.state.character?.pack)
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")
  const currentPack = resolveCharacterPack(characterPacks, currentPackName)

  return (
    <div className={styles["session-info"]}>
      {characterPacks.length > 0 ? (
        <>
          <label htmlFor={CHARACTER_SELECT_ID} className={styles["session-info-label"]}>
            キャラクター
          </label>
          <span className={styles["session-info-value"]}>
            <Select
              id={CHARACTER_SELECT_ID}
              ariaLabel="キャラクター"
              className={styles["character-select"] ?? ""}
              value={currentPack}
              disabled={turnInProgress}
              title={turnInProgress ? CHARACTER_SWITCH_BLOCKED_TITLE : undefined}
              options={characterPacks.map(({ name, label }) => ({ value: name, label }))}
              onChange={(value) => {
                dispatch({ type: "switch-character", name: value })
              }}
            />
          </span>
        </>
      ) : null}
      {/* セッションの行（`session-switch.tsx`）。**2列の grid の直の子**として並ぶよう、
          入れ物を挟まずラベルと値の対だけを返す部品にしてある。切り替え先が無ければ
          何も出さない。 */}
      <SessionSwitch />
    </div>
  )
}
