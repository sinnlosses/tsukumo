// 狭い画面（760px 以下）の頭の右上の ≡ と、押すと右から出る引き出し。
// 広い画面では ≡ ごと頭が CSS で消えるので、ここは幅を測らない。
//
// 引き出しはモーダルの `<dialog>` で、閉じ方（覆い・Esc）は `<Dialog>` が持つ。
// ≡ は覆いの下になるので、開いているあいだに ≡ の位置を押すと覆いに当たって閉じる。
//
// 動き方の段のモデル・effort・許可モードとタブの中身はサイドバーと会話の画面の部品で、この枠からは引けないので差し込み口で受ける。

import clsx from "clsx"
import { Settings } from "lucide-react"
import { useId, useRef, type ReactElement, type ReactNode } from "react"

import { Dialog } from "../../../ui/dialog/dialog.tsx"
import type { NavDrawerView, ScreenNavParts } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./nav-drawer.module.css"
import { ScreenNavCharacterPicker } from "./screen-nav-character-picker.tsx"
import { ScreenNavChatModeToggle } from "./screen-nav-chat-mode.tsx"
import { ScreenNavSessionTag } from "./screen-nav-session-tag.tsx"
import { ScreenNavSettingsBody } from "./screen-nav-settings.tsx"

/** 引き出しに差し込む中身。 */
export type NavDrawerSlots = {
  /** 動き方の段の、仕事 / 雑談のトグルの右に置くモデル・effort・許可モードの口。 */
  readonly runSetting: ReactNode
  readonly turns: ReactNode
  readonly tasks: ReactNode
  readonly usage: ReactNode
}

const TOGGLE_LABEL = "やり取りとタスクを開く"
const DRAWER_LABEL = "引き出し"
const NEW_SESSION_LABEL = "＋ 新しいやり取り"
const SETTINGS_LABEL = "設定"
const BACK_LABEL = "‹ 戻る"
const GATES_LABEL = "ほかの画面"

/** 頭の1行目の右端に置く、引き出しを開く ≡。 */
export function NavDrawerToggle(props: { readonly drawer: NavDrawerView }): ReactElement {
  // 預け先はここで分解して受ける（`drawer.toggleRef` の形のまま `ref` に渡すと `react(refs)` が落ちる）。
  const { toggleRef, open, onOpen } = props.drawer
  return (
    <button
      type="button"
      ref={toggleRef}
      className={styles["nav-drawer-toggle"]}
      aria-label={TOGGLE_LABEL}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onOpen}
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
    </button>
  )
}

export type NavDrawerProps = {
  readonly parts: ScreenNavParts
  readonly drawer: NavDrawerView
  readonly slots: NavDrawerSlots
}

export function NavDrawer(props: NavDrawerProps): ReactElement {
  const { drawer } = props
  return (
    <Dialog
      open={drawer.open}
      ariaLabel={DRAWER_LABEL}
      backdrop="veil"
      placement={{ kind: "auto" }}
      onClose={drawer.onClose}
      className={styles["nav-drawer"]}
    >
      {drawer.open && <NavDrawerBody {...props} />}
    </Dialog>
  )
}

function NavDrawerBody(props: NavDrawerProps): ReactElement {
  const { parts, drawer, slots } = props
  const gearRef = useRef<HTMLButtonElement>(null)

  return (
    <div className={styles["nav-drawer-frame"]}>
      {/* `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子（顔の大きさ・選び口の位置）を当てるためだけに重ねる。 */}
      <div className={clsx(styles["nav-drawer-identity"], shellStyles["nav-drawer-identity"])}>
        <ScreenNavCharacterPicker picker={parts.character} />
        <ScreenNavSessionTag tag={parts.sessionTag} placement="nav-drawer" />
      </div>
      <div className={styles["nav-drawer-run-setting"]}>
        <ScreenNavChatModeToggle chatMode={parts.chatMode} />
        {slots.runSetting}
      </div>
      {drawer.face === "tabs" ? (
        <NavDrawerTabs drawer={drawer} slots={slots} />
      ) : (
        <NavDrawerSettings
          parts={parts}
          drawer={drawer}
          onBack={() => {
            drawer.onShowTabs()
            gearRef.current?.focus()
          }}
        />
      )}
      <div className={styles["nav-drawer-foot"]}>
        <button
          type="button"
          className={styles["nav-drawer-new-session"]}
          aria-disabled={drawer.newSession.disabled}
          title={drawer.newSession.title}
          onClick={drawer.newSession.onStart}
        >
          {NEW_SESSION_LABEL}
        </button>
        <button
          type="button"
          ref={gearRef}
          className={styles["nav-drawer-settings"]}
          aria-label={SETTINGS_LABEL}
          aria-pressed={drawer.face === "settings"}
          title={SETTINGS_LABEL}
          onClick={drawer.face === "settings" ? drawer.onShowTabs : drawer.onShowSettings}
        >
          <Settings size={18} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/** 切り替え（3つのタブ）と、選んだタブの中身。 */
function NavDrawerTabs(props: {
  readonly drawer: NavDrawerView
  readonly slots: NavDrawerSlots
}): ReactElement {
  const { drawer, slots } = props
  const idPrefix = useId()
  const tabId = (tab: string): string => `${idPrefix}-tab-${tab}`
  const panelId = `${idPrefix}-panel`

  return (
    <>
      <div className={styles["nav-drawer-tabs"]} role="tablist">
        {drawer.tabs.map((tab) => (
          <button
            type="button"
            key={tab.tab}
            id={tabId(tab.tab)}
            role="tab"
            className={styles["nav-drawer-tab"]}
            aria-selected={tab.selected}
            aria-controls={panelId}
            onClick={() => drawer.onSelectTab(tab.tab)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={panelId}
        className={styles["nav-drawer-panel"]}
        role="tabpanel"
        aria-labelledby={tabId(drawer.tab)}
      >
        {slots[drawer.tab]}
      </div>
    </>
  )
}

/** 歯車で入れ替わる設定の面。頭に「‹ 戻る」、先頭にキャラ・トークン・成果の口、その下に設定の中身。 */
function NavDrawerSettings(props: {
  readonly parts: ScreenNavParts
  readonly drawer: NavDrawerView
  readonly onBack: () => void
}): ReactElement {
  const { parts, drawer } = props
  return (
    <div className={styles["nav-drawer-panel"]} role="region" aria-label={SETTINGS_LABEL}>
      <button type="button" className={styles["nav-drawer-back"]} onClick={props.onBack}>
        {BACK_LABEL}
      </button>
      <nav className={styles["nav-drawer-gates"]} aria-label={GATES_LABEL}>
        {drawer.screenGates.map((gate) => (
          <a
            key={gate.screen}
            className={styles["nav-drawer-gate"]}
            href={gate.href}
            aria-current={gate.active ? "page" : undefined}
            onClick={parts.onSelect}
          >
            {gate.label}
            <span aria-hidden="true">›</span>
          </a>
        ))}
      </nav>
      <div className={styles["nav-drawer-settings-body"]}>
        <ScreenNavSettingsBody settings={parts.settings} />
      </div>
    </div>
  )
}
