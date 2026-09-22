// 画面のナビの帯の**入口**（docs/design.md 13.9）。会話 `#` / キャラクター `#character` /
// トークン消費 `#token-usage` の3枚を、全画面の最上部の1本の帯から行き来する。
// ロジックは `hooks/use-screen-nav.ts`、見た目は `presentational-screen-nav.tsx`
// （2章「機能の中を分ける」の container / presenter）。
//
// **置くのは入口の `main.tsx`**（`<Root>` の中。どの画面でも同じ帯が出る）。`<Layout>` の中に
// 入れないのは、帯が会話の画面だけのものではないため。

import { type ReactElement } from "react"

import { useScreenNav } from "./hooks/use-screen-nav.ts"
import { PresentationalScreenNav } from "./presentational-screen-nav.tsx"

export function ScreenNav(): ReactElement {
  // 分解して受けるのは、ref を持つ入れ物のまま描画中に読むと `react(refs)` が落ちるため
  // （`task-board.tsx` も同じ理由で分解している）。
  const { current, room, gates, readings, pendingActive, menuOpen, toggleMenu, closeMenu, ref } =
    useScreenNav()

  return (
    <PresentationalScreenNav
      current={current}
      room={room}
      gates={gates}
      readings={readings}
      pendingActive={pendingActive}
      menuOpen={menuOpen}
      ref={ref}
      onToggleMenu={toggleMenu}
      onSelect={closeMenu}
    />
  )
}
