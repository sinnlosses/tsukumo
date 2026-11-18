// 画面全体のショートカットの読み取り。

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
