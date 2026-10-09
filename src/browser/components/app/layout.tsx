// 全画面の外枠（`<Layout>`）。最上部に画面のナビの帯を置き、その下に出している画面を選んで描く。
//
// 画面の入れ替えを画面の側に持たせると画面どうしの import になり、構造の検査「browser/ の機能どうしの import」が落とす。
// だから、すべての画面を知ってよいここで選ぶ。

import { Activity, type ReactElement } from "react"

import type { Screen } from "../../stores/location-hash.ts"
import { useScreen } from "../../stores/screen.tsx"
import type { NavDrawerSlots } from "../domain/screen-nav/components/nav-drawer.tsx"
import { ScreenNav } from "../domain/screen-nav/screen-nav.tsx"
import { RunSettingGroup } from "../domain/sidebar/components/run-setting-group.tsx"
import { SidebarTaskPane } from "../domain/sidebar/components/sidebar-task-pane.tsx"
import { UsagePane } from "../domain/sidebar/components/usage-pane.tsx"
import { SkipLink } from "../domain/skip-link.tsx"
import { Achievement } from "../page/achievement/achievement.tsx"
import { DiaryNotice } from "../page/achievement/components/diary-notice/diary-notice.tsx"
import { Character } from "../page/character/character.tsx"
import { TurnList } from "../page/conversation/components/main-view/components/turn-list/turn-list.tsx"
import { Conversation } from "../page/conversation/conversation.tsx"
import { TokenUsage } from "../page/token-usage/token-usage.tsx"

/**
 * 出している画面を選ぶ（`location.hash`）。
 * 会話の画面は外さず `<Activity mode="hidden">` で隠す。
 * 入力欄の下書き・選んでいるターン・スクロール位置はどれも部品のローカル状態なので、外すと戻ったときに失われる。
 * サーバとの接続は `<Root>` が持つので、会話そのものは隠れている間も進み続ける。
 * `hidden` 属性と違い描画も止まるので、ほかの画面を開いている間の再描画が減る。
 */
export function Layout(): ReactElement {
  const screen = useScreen()
  return (
    <>
      {screen === "conversation" && <SkipLink />}
      {/* 画面のナビの帯。どの画面でも最上部に出るので、画面を選ぶ分岐の外に置く。
          会話の画面の `<ConversationLayout>` は、帯が奪う高さを CSS の変数（theme.css）から読んで縮む。 */}
      <ScreenNav drawer={NAV_DRAWER_SLOTS} />
      {/* 書き終わりの知らせ。成果の画面でだけ出す。
          ほかの画面へ移っても「×」で消したかどうかを忘れないよう、外さずに `<Activity>` で隠す。 */}
      <Activity mode={screen === "achievement" ? "visible" : "hidden"}>
        <DiaryNotice />
      </Activity>
      <Activity mode={screen === "conversation" ? "visible" : "hidden"}>
        <Conversation />
      </Activity>
      {screen !== "conversation" && OVERLAY_SCREEN[screen]}
    </>
  )
}

/**
 * 狭い画面の引き出しに差し込む中身。
 * サイドバーと会話の画面の部品は、帯（枠）からは引けないので、すべてを知ってよいここで渡す。
 */
const NAV_DRAWER_SLOTS = {
  runSetting: <RunSettingGroup placement="nav-drawer" />,
  turns: <TurnList />,
  tasks: <SidebarTaskPane />,
  usage: <UsagePane />,
} satisfies NavDrawerSlots

/** 会話の画面を除いた画面の部品を引く表。会話の画面は常にマウントしたまま {@link Layout} が隠すので、ここには乗らない。 */
const OVERLAY_SCREEN = {
  character: <Character />,
  "token-usage": <TokenUsage />,
  achievement: <Achievement />,
} satisfies Record<Exclude<Screen, "conversation">, ReactElement>
