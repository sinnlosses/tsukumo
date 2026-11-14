/** 照らすのに要るキーの値。`KeyboardEvent` のうち読む欄だけ。 */
export type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing"
>

/** 照らす欄を呼ぶ側が選ぶ。配列に依らない字と数字は `{ code: "KeyK" }`、記号は `{ key: "." }`。 */
export type PrimaryShortcut = { readonly code: string } | { readonly key: string }

/**
 * 主の修飾キー（Mac は ⌘、ほかは Ctrl）だけが押された `shortcut` かを返す。
 * Mac で Ctrl+K は OS の編集コマンドと日本語入力のキーなので、受けずに OS へ渡す。
 * 余分な修飾キー（Alt・Shift・もう一方の主の修飾キー）と、IME の変換中は当たらない。
 */
export function matchesPrimaryShortcut(
  event: ShortcutEvent,
  shortcut: PrimaryShortcut,
  isMac: boolean,
): boolean {
  if (event.isComposing || event.altKey || event.shiftKey) {
    return false
  }
  const primaryOnly = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!primaryOnly) {
    return false
  }
  return "code" in shortcut ? event.code === shortcut.code : event.key === shortcut.key
}

/** 実行中のブラウザが Mac か。名前が取れれば `userAgentData.platform`、なければ `navigator.platform`。 */
export function isMacPlatform(): boolean {
  const agentPlatform: unknown = Reflect.get(
    Reflect.get(navigator, "userAgentData") ?? {},
    "platform",
  )
  const platform =
    typeof agentPlatform === "string" && agentPlatform !== "" ? agentPlatform : navigator.platform
  return /^(mac|iphone|ipad)/i.test(platform)
}
