// 狭い画面の引き出しの「タスク」（雑談中は「話題」）のタブの中身。
// 仕事中はタスク一覧の区画、雑談中はプロフィールの札・最近の話題・覚えていること。中身はサイドバーの部品のまま。
// 下端の帯の中身（モデル・effort・許可モードと使用量）は引き出しの別の場所にあるので、ここには置かない。
// 起動先に `.beads` が無ければ、仕事中は何も出さない。

import type { ReactElement } from "react"

import { useSession } from "../../../../stores/session.ts"
import sidebarStyles from "../sidebar.module.css"
import { PersonaMemorySection } from "./persona-memory-section.tsx"
import { ProfileCard } from "./profile-card.tsx"
import { RecentTopicSection } from "./recent-topic-section.tsx"
import styles from "./sidebar-task-pane.module.css"
import { TaskSection } from "./task-section.tsx"

export function SidebarTaskPane(): ReactElement {
  const chatMode = useSession((session) => session.state.chatMode)
  const noBeads = useSession((session) => session.state.tasks.kind === "no-beads")
  return (
    <div className={styles["sidebar-task-pane"]}>
      {chatMode && (
        <>
          <ProfileCard />
          <div className={sidebarStyles["sidebar-chat-body"]}>
            <RecentTopicSection />
            <PersonaMemorySection />
          </div>
        </>
      )}
      {!chatMode && !noBeads && <TaskSection />}
    </div>
  )
}
