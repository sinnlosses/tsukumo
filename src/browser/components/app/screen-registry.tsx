// 本番の画面の登録表。実物の画面の部品はここで import し、`<Layout>` へ渡す。
// 画面どうしの import を避けるため、すべての画面を知ってよいこのディレクトリが持つ。

import { TaskSheet } from "../../features/task-board/task-sheet.tsx"
import {
  RoomHead,
  RoomHeadScope,
  RoomHeadTools,
  RoomNarrowHead,
  RoomSidebarGates,
  RoomSidebarSearch,
} from "../frame/screen-nav/room-head.tsx"
import { SettingsScreen } from "../frame/screen-nav/settings-screen.tsx"
import { TodayLamp } from "../frame/screen-nav/today-lamp.tsx"
import { SkipLink } from "../frame/skip-link.tsx"
import { DiaryNotice } from "../page/achievement/components/diary-notice/diary-notice.tsx"
import { TurnList } from "../page/conversation/components/main-view/turn-list.tsx"
import { Conversation } from "../page/conversation/conversation.tsx"
import { deferredScreen } from "./deferred-screen.tsx"
import type { LayoutScreens } from "./layout.tsx"

const Character = deferredScreen(
  async () => (await import("../page/character/character.tsx")).Character,
)
const TokenUsage = deferredScreen(
  async () => (await import("../page/token-usage/token-usage.tsx")).TokenUsage,
)
const Achievement = deferredScreen(
  async () => (await import("../page/achievement/achievement.tsx")).Achievement,
)
const Design = deferredScreen(async () => (await import("./design/design.tsx")).Design)

/** 会話の画面の欄外・部屋の頭に差し込む中身は、枠と会話の画面の部品を含むので、ここで渡す。 */
export const LAYOUT_SCREENS = {
  skipLink: <SkipLink />,
  diaryNotice: <DiaryNotice />,
  conversation: (
    <RoomHeadScope>
      <Conversation
        shell={{
          margin: <TurnList />,
          sidebarSearch: <RoomSidebarSearch />,
          sidebarGates: <RoomSidebarGates />,
          head: <RoomHead />,
          tools: <RoomHeadTools />,
          today: <TodayLamp />,
          narrowHead: (subject) => <RoomNarrowHead subject={subject} />,
        }}
      />
    </RoomHeadScope>
  ),
  overlay: {
    character: <Character />,
    "token-usage": <TokenUsage />,
    achievement: <Achievement />,
    tasks: <TaskSheet />,
    settings: <SettingsScreen />,
    design: <Design />,
  },
} satisfies LayoutScreens
