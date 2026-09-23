// サイドバー本体。「補足情報の置き場」であって単機能パネルではないので、独立した2つの区画
// （タスク一覧・セッション情報）を並べる（docs/design.md 6.1「部品の木」）。**「いま何をしているか」
// の区画は帯の「いまの作業」へ移した**（`src/browser/features/screen-nav/`。docs/screen-design.md 13.9）。
//
// **2つの区画は互いに独立している。** どちらかの中身が空・不明でも、残りは表示を続ける
// （まん中の区画 / `SessionInfo` がそれぞれ自分の分だけ見る）。
//
// **まん中の区画（タスク一覧）は `task-section.tsx` にひとまとめにしてある。** 区画の枠は
// ここが持ち、中身は置かれる機能（`features/task-board/`）から借りる
// （docs/design.md 2章「領域の機能と、置かれる機能」）。
//
// **セッション情報は区画ではなく「下端の帯」**（`docs/screen-design.md` 13.9「顔」・
// `docs/display.md` 4.2）。見出しを名乗らず、`SidebarSection` の枠も借りない——サイドバーの
// 左右いっぱいに広がり、上端の罫線と一段沈んだ地で、伸び縮みするタスクの区画と切り分ける
// （寸法の出どころは `sidebar.module.css` 冒頭の見本）。

// **雑談中は4段に差し替える**（docs/screen-design.md 13.7「雑談のときのサイドバー」）: 上から
// プロフィールの札（`profile-card.tsx`）・最近の話題・覚えていること・下端の帯（セッションだけ）。
// **差し替えを決めるのはこのファイル**で、`main.tsx` の `<Root>` ではない — 下端の帯は両方の
// モードで同じ部品を使い、区画ひとまとまりは領域の側に置く（docs/design.md 2章「領域の機能と、
// 置かれる機能」）ので、どちらの形もサイドバーの中に閉じる。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { PersonaMemorySection } from "./persona-memory-section.tsx"
import { ProfileCard } from "./profile-card.tsx"
import { RecentTopicSection } from "./recent-topic-section.tsx"
import { SessionInfo } from "./session-info.tsx"
import styles from "./sidebar.module.css"
import { TaskSection } from "./task-section.tsx"

export function Sidebar(): ReactElement {
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  return (
    <>
      {chatMode ? (
        <>
          <ProfileCard />
          {/* 2段目と3段目はまとめて1つの入れ物で転がす（札と下端の帯は伸び縮みしない）。 */}
          <div className={styles["sidebar-chat-body"]}>
            <RecentTopicSection />
            <PersonaMemorySection />
          </div>
        </>
      ) : (
        <TaskSection />
      )}
      <div className={styles["sidebar-footer"]}>
        <SessionInfo withCharacter={!chatMode} />
      </div>
    </>
  )
}
