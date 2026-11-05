// 本番の画面の登録表。実物の画面の部品はここで import し、`<Layout>` へ渡す。
// 画面どうしの import を避けるため、すべての画面を知ってよいこのディレクトリが持つ。

import { RunSettingGroup } from "../../features/run-setting/components/run-setting-group.tsx"
import { ScreenNav } from "../domain/screen-nav/screen-nav.tsx"
import { SidebarTaskPane } from "../domain/sidebar/components/sidebar-task-pane.tsx"
import { UsagePane } from "../domain/sidebar/components/usage-pane.tsx"
import { SkipLink } from "../domain/skip-link.tsx"
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

/** 狭い画面の引き出しに差し込む中身は、サイドバーと会話の画面の部品を含むので、ここで渡す。 */
export const LAYOUT_SCREENS = {
  skipLink: <SkipLink />,
  nav: (
    <ScreenNav
      drawer={{
        runSetting: <RunSettingGroup placement="nav-drawer" />,
        turns: <TurnList />,
        tasks: <SidebarTaskPane />,
        usage: <UsagePane />,
      }}
    />
  ),
  diaryNotice: <DiaryNotice />,
  conversation: <Conversation />,
  overlay: {
    character: <Character />,
    "token-usage": <TokenUsage />,
    achievement: <Achievement />,
    design: <Design />,
  },
} satisfies LayoutScreens
