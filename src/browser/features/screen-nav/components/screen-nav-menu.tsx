// 狭い画面（760px 以下）の「≡」と、押すと落ちてくる面（docs/design.md 13.9）。
// **広い画面では CSS で消える**（`screen-nav.module.css` の `@media`）ので、ここは幅を測らない。
//
// **落ちてくる面は開いている間だけの要素**（閉じているときは描かない）。奪う面積を
// タブ帯の右端の 44px だけに保つための形で、開いている間は上に重ねて出す（段を増やさない）。
//
// **落ちてくる面の並びは 顔と部屋の名前 → トグル → 3つの口 → いまの作業 → モデル・許可モード →
// 設定の歯車**（13.9「狭い画面」）。振る舞い（ターン進行中の扱い・送るコマンド）は
// 広い画面と同じ部品をそのまま使う。**「いまの作業」を押すと、一覧はこの面の中でその場で
// 下に開く**（重ねない。面ごと縦に伸び、面の内側でスクロールする。13.9「狭い画面」）。
//
// **答え待ちは閉じていても分かるようにする**。狭い画面では「答え待ち」の字を帯に置く幅が
// 無いので、閉じている間は「≡」に印（`●`）を添える（**印の有無という形**でも伝わるので、
// 色だけに頼らない。13.1 原則1）。開くと「いまの作業」の札の語が「答え待ち」に変わるので、
// 帯の右端にあった専用の印（`screen-nav-pending.tsx`）はもう無い（13.9「何を外すか」）。

import { type ReactElement } from "react"

import { CharacterFace } from "../../../components/character-face.tsx"
import { type ScreenNavMenu as Menu, type ScreenNavParts } from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"
import { ScreenNavChatModeToggle } from "./screen-nav-chat-mode.tsx"
import { ScreenNavCurrentWorkPill } from "./screen-nav-current-work.tsx"
import { ScreenNavGate } from "./screen-nav-gate.tsx"
import { ScreenNavModelPermissionSelect } from "./screen-nav-model-permission.tsx"
import { ScreenNavRoom } from "./screen-nav-room.tsx"
import { ScreenNavSettingsGear } from "./screen-nav-settings.tsx"

export type ScreenNavMenuProps = {
  /**
   * 帯に並ぶ部品の値ひとそろい（`hooks/use-screen-nav.ts` の `ScreenNavParts`）。**広い画面の
   * 帯が受け取るものと同じ束**で、ここが決めるのは**並べ直す順と入れ子だけ**
   * （顔と部屋の名前 → トグル → 3つの口 → いまの作業 → モデル・許可モード → 設定の歯車。13.9）。
   */
  readonly parts: ScreenNavParts
  /** 「≡」そのもの（開閉と、閉じている間の答え待ちの印）。 */
  readonly menu: Menu
}

/** 「≡」の字と、読み上げに渡す名前。**「画面を選ぶ」から「メニュー」に直した**
 * （画面を選ぶだけの面ではなくなったため。13.9「狭い画面」）。 */
const MENU_MARK = "≡"
const MENU_LABEL = "メニュー"
const PENDING_NOTE = "答え待ち"

/** 閉じている間の答え待ちの印。 */
const PENDING_MARK = "●"

export function ScreenNavMenu(props: ScreenNavMenuProps): ReactElement {
  const { parts, menu } = props

  return (
    <div className={styles["screen-nav-menu"]}>
      <button
        type="button"
        className={styles["screen-nav-toggle"]}
        aria-expanded={menu.open}
        aria-label={menu.pendingActive ? `${MENU_LABEL}（${PENDING_NOTE}）` : MENU_LABEL}
        onClick={menu.onToggle}
      >
        {MENU_MARK}
        {menu.pendingActive ? (
          <span className={styles["screen-nav-toggle-mark"]}>{PENDING_MARK}</span>
        ) : null}
      </button>
      {menu.open ? (
        <div className={styles["screen-nav-panel"]}>
          <CharacterFace
            url={parts.face.url}
            alt={parts.face.alt}
            className={styles["screen-nav-face"] ?? ""}
          />
          <ScreenNavRoom name={parts.room} />
          <ScreenNavChatModeToggle chatMode={parts.chatMode} />
          {parts.gates.map((gate) => (
            <ScreenNavGate key={gate.screen} gate={gate} onSelect={parts.onSelect} />
          ))}
          <ScreenNavCurrentWorkPill work={parts.work} />
          <ScreenNavModelPermissionSelect modelPermission={parts.modelPermission} />
          <ScreenNavSettingsGear settings={parts.settings} />
        </div>
      ) : null}
    </div>
  )
}
