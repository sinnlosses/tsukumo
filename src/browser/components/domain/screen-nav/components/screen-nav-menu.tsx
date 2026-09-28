// 狭い画面（760px 以下）の「≡」と、押すと落ちてくる面。
// 広い画面では CSS で消える（`screen-nav.module.css` の `@media`）ので、ここは幅を測らない。
//
// 落ちてくる面は開いている間だけの要素（閉じているときは描かない）。
// 奪う面積をタブ帯の右端の 44px だけに保つための形で、開いている間は上に重ねて出す（段を増やさない）。
//
// 振る舞い（ターン進行中の扱い・送るコマンド）は広い画面と同じ部品をそのまま使う。
// 「いまの作業」を押すと、一覧はこの面の中でその場で下に開く（重ねない。面ごと縦に伸び、面の内側でスクロールする）。
//
// 狭い画面では「答え待ち」の字を帯に置く幅が無いので、閉じている間は「≡」に印（`●`）を添える。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Text } from "../../../ui/text/text.tsx"
import type { ScreenNavMenu as Menu, ScreenNavParts } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import { ScreenNavCharacterPicker } from "./screen-nav-character-picker.tsx"
import { ScreenNavChatModeToggle } from "./screen-nav-chat-mode.tsx"
import { ScreenNavCurrentWorkPill } from "./screen-nav-current-work.tsx"
import { ScreenNavGate } from "./screen-nav-gate.tsx"
import styles from "./screen-nav-menu.module.css"
import { ScreenNavModelPermissionSelect } from "./screen-nav-model-permission.tsx"
import { ScreenNavSessionTag } from "./screen-nav-session-tag.tsx"
import { ScreenNavSettingsGear } from "./screen-nav-settings.tsx"

export type ScreenNavMenuProps = {
  /** 帯に並ぶ部品の値ひとそろい。広い画面の帯が受け取るものと同じ束で、ここが決めるのは並べ直す順と入れ子だけ。 */
  readonly parts: ScreenNavParts
  /** 「≡」そのもの（開閉と、閉じている間の答え待ちの印）。 */
  readonly menu: Menu
}

/** 「≡」の字と、読み上げに渡す名前。 */
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
        {menu.pendingActive && (
          <Text
            element="span"
            size="label"
            tone="state-warn"
            weight="inherit"
            className={styles["screen-nav-toggle-mark"]}
          >
            {PENDING_MARK}
          </Text>
        )}
      </button>
      {menu.open && (
        // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
        // 実物の見た目（位置・枠・地）は `styles["screen-nav-panel"]` が持つ。
        <div className={clsx(styles["screen-nav-panel"], shellStyles["screen-nav-panel"])}>
          <div className={shellStyles["screen-nav-panel-identity"]}>
            <ScreenNavCharacterPicker picker={parts.character} />
            <ScreenNavSessionTag tag={parts.sessionTag} onOpened={parts.onSelect} />
          </div>
          <ScreenNavChatModeToggle chatMode={parts.chatMode} />
          {parts.gates.map((gate) => (
            <ScreenNavGate key={gate.screen} gate={gate} onSelect={parts.onSelect} />
          ))}
          <ScreenNavCurrentWorkPill work={parts.work} />
          <ScreenNavModelPermissionSelect modelPermission={parts.modelPermission} />
          <ScreenNavSettingsGear settings={parts.settings} />
        </div>
      )}
    </div>
  )
}
