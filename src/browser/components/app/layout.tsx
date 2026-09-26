// 全画面の外枠（`<Layout>`。docs/design.md 6.1 / docs/screen-design.md 13.6）。最上部に画面のナビの帯を
// 置き、その下に出している画面を選んで描く。
//
// 画面どうしは互いを import しないので、画面の入れ替えを画面の側に持たせると画面どうしの
// import になる（`test/architecture.test.ts`「browser/ の機能どうしの import」）。だから
// すべての画面を知ってよい `components/app/` で選ぶ。

import { Activity, type ReactElement } from "react"

import { type Screen } from "../../stores/location-hash.ts"
import { useScreen } from "../../stores/screen.tsx"
import { ScreenNav } from "../domain/screen-nav/screen-nav.tsx"
import { Achievement } from "../page/achievement/achievement.tsx"
import { DiaryNotice } from "../page/achievement/components/diary-notice/diary-notice.tsx"
import { Character } from "../page/character/character.tsx"
import { Conversation } from "../page/conversation/conversation.tsx"
import { TokenUsage } from "../page/token-usage/token-usage.tsx"

/**
 * 出している画面を選ぶ（`location.hash`。docs/screen-design.md 13.6）。会話の画面は外さず
 * `<Activity mode="hidden">` で隠す — 入力欄の下書き・選んでいるターン・スクロール位置は
 * どれも部品のローカル状態なので、外すと戻ったときに失われる（`<SessionProvider>` はこの上に
 * 居るので会話そのものは隠れている間も進み続ける）。`hidden` 属性と違い描画も止まるので、
 * キャラクター画面を開いている間の再描画が減る。
 */
export function Layout(): ReactElement {
  const screen = useScreen()
  return (
    <>
      {/* 画面のナビの帯（13.9）。**どの画面でも最上部に出る**ので、画面を選ぶ分岐の外に置く。
          会話の画面の `<ConversationLayout>` は、帯が奪う高さを CSS の変数（theme.css）から読んで縮む。 */}
      <ScreenNav />
      {/* 書き終わりの知らせ（13.10「書き終わりの知らせ」）。**成果の画面でだけ出す**。ほかの
          画面へ移っても「×」で消したかどうかを忘れないよう、外さずに `<Activity>` で隠す。 */}
      <Activity mode={screen === "achievement" ? "visible" : "hidden"}>
        <DiaryNotice />
      </Activity>
      <Activity mode={screen === "conversation" ? "visible" : "hidden"}>
        <Conversation />
      </Activity>
      {screen === "conversation" ? null : OVERLAY_SCREEN[screen]}
    </>
  )
}

/**
 * 会話の画面を除いた画面の部品を引く表（`stores/location-hash.ts` の画面の一覧が正典）。
 * `satisfies` で `Screen` を尽くしているかを検査するので、画面を1つ足したのに部品の登録を
 * 忘れると `bun run typecheck` が落ちる。会話の画面は `<Conversation>` を常時マウントしたまま
 * `<Activity>` の可視/不可視で切り替える別枠（上の {@link Layout} 参照）なのでここには乗らない。
 */
const OVERLAY_SCREEN = {
  character: <Character />,
  "token-usage": <TokenUsage />,
  achievement: <Achievement />,
} satisfies Record<Exclude<Screen, "conversation">, ReactElement>
