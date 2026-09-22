// いま出している画面（会話 / キャラクター / 作る / トークン消費）を `location.hash` から読む
// （`docs/design.md` 13.6 / 6.2。**ルーターのライブラリは入れない** — 画面は4つで、
// 分岐は hook 1つで足りる）。
//
// **Context ではなく `useSyncExternalStore`** にしてあるのは、正典が React の外
// （`location.hash`）にあるため。リロードしても同じ画面に戻り、ブラウザの「戻る」が効き、
// `bun run dev` の再読み込み（`lib/refresh.ts`）でもキャラクター画面に留まれる。
// サーバの経路は増えない（`?token` はそのまま）。
//
// **hash の書き方はここに無い**（`stores/location-hash.ts`）。同じ hash の `turn` は見ている
// ターン（`stores/turn-selection.tsx`）のもので、画面を移しても消さずに運ぶ。
//
// 画面を選ぶのは入口の `<Root>`（`src/browser/main.tsx`）で、**機能の側はこの hook を読まない**
// （出る口・入る口はただのリンクで書ける。`navigateTo` が要るのは、コマンドを送った直後に
// 画面も移す作る画面だけ）。

import {
  readHashRoute,
  useHashRoute,
  writeHashRoute,
  formatHash,
  type Screen,
} from "./location-hash.ts"

export function useScreen(): Screen {
  return useHashRoute((route) => route.screen)
}

/** 画面を移す。見ているターンは hash に残したまま運ぶ。 */
export function navigateTo(screen: Screen): void {
  writeHashRoute({ ...readHashRoute(), screen })
}

/**
 * 画面へ入る `<a href>` を作る関数。**見ているターンを hash に残す**ので、ターンが変わると
 * 描き直す（hook にしてあるのはそのため）。
 */
export function useScreenHref(): (screen: Screen) => string {
  const turn = useHashRoute((route) => route.turn)
  return (screen) => formatHash({ screen, turn })
}
