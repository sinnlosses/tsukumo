// 画面全体のショートカットの読み取り。
// 割り当てるのは ⌘ と英字（設定だけ macOS の慣例の ⌘,）と、打っていないときの `/` だけ。
// Ctrl・Option を伴う押し方は読まず、入力欄の macOS のカーソル移動（Ctrl+A・Ctrl+K など）とブラウザに譲る。

export type Shortcut =
  | "command-palette"
  | "composer"
  | "session-switcher"
  | "task-board"
  | "settings"

export type ShortcutKeyEvent = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly isComposing: boolean
  readonly target?: EventTarget
}

/** パレットの行の脇に出すキーの字。`/` のほかは ⌘ を伴う。 */
export const SHORTCUT_KEY_LABEL = {
  "command-palette": "⌘K",
  composer: "/",
  "session-switcher": "⌘J",
  "task-board": "⌘E",
  settings: "⌘,",
} satisfies Record<Shortcut, string>

const COMMAND_KEY: ReadonlyMap<string, Shortcut> = new Map([
  ["k", "command-palette"],
  ["j", "session-switcher"],
  ["e", "task-board"],
  [",", "settings"],
])

const EDITABLE = "input, textarea, select, [contenteditable]"

/** 読まない押し方は `none`。 */
export function shortcutOf(event: ShortcutKeyEvent): Shortcut | "none" {
  if (event.isComposing || event.ctrlKey || event.altKey || event.shiftKey) {
    return "none"
  }
  if (event.metaKey) {
    return COMMAND_KEY.get(event.key.toLowerCase()) ?? "none"
  }
  if (event.key !== "/") {
    return "none"
  }
  if (event.target instanceof Element && event.target.closest(EDITABLE) !== null) {
    return "none"
  }
  return "composer"
}
