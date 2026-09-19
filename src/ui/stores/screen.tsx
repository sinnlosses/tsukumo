// いま出している画面（会話 / キャラクター / 作る）を `location.hash` から読む
// （`docs/design.md` 13.6 / 6.2。**ルーターのライブラリは入れない** — 画面は3つで、
// 分岐は hook 1つで足りる）。
//
// **Context ではなく `useSyncExternalStore`** にしてあるのは、正典が React の外
// （`location.hash`）にあるため。リロードしても同じ画面に戻り、ブラウザの「戻る」が効き、
// `bun run dev` の再読み込み（`lib/refresh.ts`）でもキャラクター画面に留まれる。
// サーバの経路は増えない（`?token` はそのまま）。
//
// 画面を選ぶのは入口の `<Root>`（`src/ui/main.tsx`）で、**機能の側はこの hook を読まない**
// （出る口・入る口はただのリンクで書ける。`navigateTo` が要るのは、コマンドを送った直後に
// 画面も移す作る画面だけ）。

import { useSyncExternalStore } from "react"

/** 出している画面。hash が対応しない値のときは会話の画面に落ちる。 */
export type Screen = "conversation" | "character" | "character-create"

/**
 * 画面と `location.hash` の対応。**会話の画面は `"#"`**（`location.hash` としては空文字に
 * 正規化されるが、リンクの `href` には `""` を書けない — 空の `href` はページの再読み込みに
 * なってしまう）。
 */
const SCREEN_HASH = {
  conversation: "#",
  character: "#character",
  "character-create": "#character/new",
} as const satisfies Readonly<Record<Screen, string>>

export function useScreen(): Screen {
  // サーバ側で描くことは無いので、スナップショットは3つとも同じ読み取りでよい。
  return useSyncExternalStore(subscribeToHash, readScreen, readScreen)
}

/** 画面を移す。`hashchange` が起きて {@link useScreen} が読み直す。 */
export function navigateTo(screen: Screen): void {
  window.location.hash = SCREEN_HASH[screen]
}

/** その画面へ入る `<a href>`。hash の書き方をこのファイルの外に散らさないための1箇所。 */
export function screenHash(screen: Screen): string {
  return SCREEN_HASH[screen]
}

function subscribeToHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange)
  return () => {
    window.removeEventListener("hashchange", onStoreChange)
  }
}

function readScreen(): Screen {
  const hash = window.location.hash
  if (hash === SCREEN_HASH.character) {
    return "character"
  }
  if (hash === SCREEN_HASH["character-create"]) {
    return "character-create"
  }
  return "conversation"
}
