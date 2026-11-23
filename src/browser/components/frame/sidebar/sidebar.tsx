// サイドバー本体。独立した2つの塊（タスク一覧・下端の帯）を並べる。
// どちらかの中身が空・不明でも、残りは表示を続ける（それぞれ自分の分だけ見る）。
// 起動先に `.beads` が無い（`tasks.kind === "no-beads"`）ときは、タスクの節ごと出さない。
//
// 下端の帯はモデル・effort・許可モードの操作子と、コンテキストの使用量・プラン使用量の目盛り（`SidebarFooter`）。
// 区画ではないので見出しを名乗らず、`SidebarSection` の枠も借りない。
// サイドバーの左右いっぱいに広がり、上端の罫線と一段沈んだ地で、伸び縮みするタスクの区画と切り分ける。

// 雑談中は4段に差し替える: 上からプロフィール・最近の話題・覚えていること・下端の帯。
// 差し替えを決めるのは `<Layout>` ではなくここで、どちらの形もサイドバーの中に閉じる。

// 仕事中で、地図が読める（読めない理由がある）ときだけ、頭に「タスク｜地図」のタブを置く。
// タスクの区画はタブが地図のあいだも付けたまま隠し、探す欄と開いた段を保つ。

import { type ReactElement, useState } from "react"

import { ArchitectureMapPanel } from "../../../features/architecture-map/architecture-map-panel.tsx"
import { useArchitectureMapOverview } from "../../../features/architecture-map/use-architecture-map.ts"
import { useSession } from "../../../stores/session.ts"
import { TabList } from "../../ui/tab-list/tab-list.tsx"
import { PersonaMemorySection } from "./components/persona-memory-section.tsx"
import { ProfileCard } from "./components/profile-card.tsx"
import { RecentTopicSection } from "./components/recent-topic-section.tsx"
import { SidebarFooter } from "./components/sidebar-footer.tsx"
import { TaskSection } from "./components/task-section.tsx"
import styles from "./sidebar.module.css"

export function Sidebar(): ReactElement {
  const chatMode = useSession((session) => session.state.chatMode)
  const noBeads = useSession((session) => session.state.tasks.kind === "no-beads")
  const mapResponse = useArchitectureMapOverview()
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
      {!chatMode && (
        <WorkBody
          noBeads={noBeads}
          hasMapTab={mapResponse.kind === "ready" || mapResponse.kind === "unreadable"}
        />
      )}
      <SidebarFooter />
    </>
  )
}

type SidebarTab = "tasks" | "map"

const TAB_PANEL_ID = "sidebar-tab-panel"

const TABS = [
  { value: "tasks", label: "タスク", id: "sidebar-tab-tasks" },
  { value: "map", label: "地図", id: "sidebar-tab-map" },
] as const satisfies readonly { value: SidebarTab; label: string; id: string }[]

function WorkBody(props: { readonly noBeads: boolean; readonly hasMapTab: boolean }): ReactElement {
  const [chosen, setChosen] = useState<SidebarTab>("tasks")
  // `.beads` が無いときはタスクのタブに中身が無いので、地図のタブで始める
  const tab: SidebarTab = props.noBeads ? "map" : chosen
  return (
    <>
      {props.hasMapTab && (
        <div className={styles["sidebar-tabs"]}>
          <TabList
            label="サイドバー"
            value={tab}
            tabs={TABS}
            panelId={TAB_PANEL_ID}
            onChange={setChosen}
          />
        </div>
      )}
      <div
        id={TAB_PANEL_ID}
        role={props.hasMapTab ? "tabpanel" : undefined}
        aria-labelledby={props.hasMapTab ? `sidebar-tab-${tab}` : undefined}
        className={styles["sidebar-tab-panel"]}
      >
        {!props.noBeads && (
          <div className={styles["sidebar-tab-tasks"]} hidden={props.hasMapTab && tab !== "tasks"}>
            <TaskSection />
          </div>
        )}
        {props.hasMapTab && tab === "map" && (
          <div className={styles["sidebar-tab-map"]}>
            <ArchitectureMapPanel />
          </div>
        )}
      </div>
    </>
  )
}
