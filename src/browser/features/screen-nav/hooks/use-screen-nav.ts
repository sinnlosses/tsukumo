// 画面のナビの帯のロジック（docs/design.md 13.9 / 2章「機能の中を分ける」）。**いま出している
// 画面・3つの口・答え待ちの印・狭い画面の「≡」の開閉**を、見た目が受け取れる形まで畳んで返す。
//
// **帯に出すのは `Screen` の4つのうち3つ**（作る画面はキャラクター画面から入る一時的な画面なので
// 出さない。13.9）。**口は `<a href>` で、画面の正典は `location.hash` のまま**（`navigateTo` は
// 使わない）。
//
// 「≡」を閉じる合図（外側を押した・Esc）は **React の外（document）の購読**なので `useEffect`
// で取る（docs/coding-standards.md「React」の4類型のうち「外部システムの購読」）。**開いている
// 間だけ購読する**ので、閉じている間はハンドラが1つも載らない。

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { screenHash, useScreen, type Screen } from "../../../stores/screen.tsx"
import { useSessionSelector } from "../../../stores/session.tsx"

/** 帯に並ぶ口1つ。**「いま出している画面か」は畳んで渡す**（部品は判定を持たない）。 */
export type ScreenNavGate = {
  readonly screen: Screen
  readonly label: string
  readonly href: string
  readonly active: boolean
}

export type ScreenNavView = {
  /** いま出している画面。**狭い画面での帯の置き方**（タブ帯へ畳むか）を CSS が決めるのに使う。 */
  readonly current: Screen
  readonly gates: readonly ScreenNavGate[]
  readonly pendingActive: boolean
  readonly menuOpen: boolean
  readonly toggleMenu: () => void
  readonly closeMenu: () => void
  /** 帯の外側を押したかを見るための入れ物（「≡」を閉じる判定に使う）。 */
  readonly ref: RefObject<HTMLElement | null>
}

// 帯に出す画面と、その字。**作る画面（`#character/new`）は入れない**（13.9）。
// 名前は用語集の語のまま（docs/glossary.md）。
const NAV_SCREENS = [
  { screen: "conversation", label: "会話" },
  { screen: "character", label: "キャラクター" },
  { screen: "token-usage", label: "トークン消費" },
] satisfies readonly { readonly screen: Screen; readonly label: string }[]

export function useScreenNav(): ScreenNavView {
  const current = useScreen()
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  const closeMenu = useCallback((): void => {
    setMenuOpen(false)
  }, [])

  const toggleMenu = useCallback((): void => {
    setMenuOpen((open) => !open)
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    function closeOnOutside(event: PointerEvent): void {
      const root = ref.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuOpen])

  return {
    current,
    gates: NAV_SCREENS.map((entry) => ({
      screen: entry.screen,
      label: entry.label,
      href: screenHash(entry.screen),
      active: entry.screen === current,
    })),
    pendingActive,
    menuOpen,
    toggleMenu,
    closeMenu,
    ref,
  }
}
