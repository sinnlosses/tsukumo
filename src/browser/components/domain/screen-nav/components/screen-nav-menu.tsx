// 狭い画面（760px 以下）の頭の右上の「≡」と、押すと落ちてくる面。
// 広い画面では CSS で消える（`screen-nav.module.css` の `@media`）ので、ここは幅を測らない。
//
// 落ちてくる面は開いている間だけの要素（閉じているときは描かない）で、頭の下に重ねて出す。
//
// 振る舞い（ターン進行中の扱い・送るコマンド）は広い画面と同じ部品をそのまま使う。
// いまの作業は頭が持つので、この面には置かない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import type { ScreenNavMenu as Menu, ScreenNavParts } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import { ScreenNavCharacterPicker } from "./screen-nav-character-picker.tsx"
import { ScreenNavChatModeToggle } from "./screen-nav-chat-mode.tsx"
import { ScreenNavGate } from "./screen-nav-gate.tsx"
import styles from "./screen-nav-menu.module.css"
import { ScreenNavModelPermissionSelect } from "./screen-nav-model-permission.tsx"
import { ScreenNavSessionTag } from "./screen-nav-session-tag.tsx"
import { ScreenNavSettingsGear } from "./screen-nav-settings.tsx"

export type ScreenNavMenuProps = {
  /** 帯に並ぶ部品の値ひとそろい。広い画面の帯が受け取るものと同じ束で、ここが決めるのは並べ直す順と入れ子だけ。 */
  readonly parts: ScreenNavParts
  /** 「≡」そのもの（開閉）。 */
  readonly menu: Menu
}

/** 読み上げに渡す名前。 */
const MENU_LABEL = "メニュー"

export function ScreenNavMenu(props: ScreenNavMenuProps): ReactElement {
  const { parts, menu } = props

  return (
    <div className={styles["screen-nav-menu"]}>
      <Button
        variant="outline"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={MENU_LABEL}
        ariaHasPopup={undefined}
        disclosure={{ kind: "expander", expanded: menu.open }}
        title={undefined}
        className={styles["screen-nav-toggle"]}
        onClick={menu.onToggle}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </Button>
      {menu.open && (
        // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
        // 実物の見た目（位置・枠・地）は `styles["screen-nav-panel"]` が持つ。
        <div className={clsx(styles["screen-nav-panel"], shellStyles["screen-nav-panel"])}>
          <div className={styles["screen-nav-panel-identity"]}>
            <ScreenNavCharacterPicker picker={parts.character} />
            <ScreenNavSessionTag tag={parts.sessionTag} onOpened={parts.onSelect} />
          </div>
          <ScreenNavChatModeToggle chatMode={parts.chatMode} />
          {parts.gates.map((gate) => (
            <ScreenNavGate key={gate.screen} gate={gate} onSelect={parts.onSelect} />
          ))}
          <ScreenNavModelPermissionSelect modelPermission={parts.modelPermission} />
          <ScreenNavSettingsGear settings={parts.settings} />
        </div>
      )}
    </div>
  )
}
