// サイドバー本体。独立した2つの塊（タスク一覧・下端の帯）を並べる。
// どちらかの中身が空・不明でも、残りは表示を続ける（それぞれ自分の分だけ見る）。
// プロジェクトの設定のダイアログはここが1枚だけ置き、タスクの節の見出しの歯車から開く。
//
// 下端の帯はモデル・effort・許可モードの操作子と、コンテキストの使用量・利用枠の目盛り（`SidebarFooter`）。
// 区画ではないので見出しを名乗らず、`SidebarSection` の枠も借りない。
// サイドバーの左右いっぱいに広がり、上端の罫線と一段沈んだ地で、伸び縮みするタスクの区画と切り分ける。

// 雑談中は4段に差し替える: 上からプロフィールの札・最近の話題・覚えていること・下端の帯。
// 差し替えを決めるのは `<Layout>` ではなくここで、どちらの形もサイドバーの中に閉じる。

import { type ReactElement, useState } from "react"

import { useSession } from "../../../stores/session.ts"
import { PersonaMemorySection } from "./components/persona-memory-section.tsx"
import { ProfileCard } from "./components/profile-card.tsx"
import { ProjectSettingsDialog } from "./components/project-settings-dialog.tsx"
import { RecentTopicSection } from "./components/recent-topic-section.tsx"
import { SidebarFooter } from "./components/sidebar-footer.tsx"
import { TaskSection } from "./components/task-section.tsx"
import styles from "./sidebar.module.css"

export function Sidebar(): ReactElement {
  const chatMode = useSession((session) => session.state.chatMode)
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <>
      {chatMode && (
        <>
          <ProfileCard />
          {/* 2段目と3段目はまとめて1つの入れ物で転がす（札と下端の帯は伸び縮みしない）。 */}
          <div className={styles["sidebar-chat-body"]}>
            <RecentTopicSection />
            <PersonaMemorySection />
          </div>
        </>
      )}
      {!chatMode && <TaskSection onOpenSettings={() => setSettingsOpen(true)} />}
      <SidebarFooter />
      <ProjectSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
