// 出す画面を選ぶ部品（`<Root>`。docs/design.md 6.1 / docs/screen-design.md 13.6）。
// `app.tsx` の `<App>` が Provider を重ねた内側でこれを描く。
//
// 画面どうしは互いを import しないので、画面の入れ替えを画面の側に持たせると画面どうしの
// import になる（`test/architecture.test.ts`「browser/ の機能どうしの import」）。枠
// （`components/domain/layout/`）も画面を知らないので、選んだ画面はここから枠へ渡す。

import { Activity, type ReactElement } from "react"

import { type Screen } from "../../stores/location-hash.ts"
import { useScreen } from "../../stores/screen.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import { Layout } from "../domain/layout/layout.tsx"
import { usePortraitPreload } from "../domain/portrait.tsx"
import { ProtocolMismatch } from "../domain/protocol-mismatch.tsx"
import { ScreenNav } from "../domain/screen-nav/screen-nav.tsx"
import { Achievement } from "../page/achievement/achievement.tsx"
import { DiaryNotice } from "../page/achievement/components/diary-notice/diary-notice.tsx"
import { Character } from "../page/character/character.tsx"
import { Conversation } from "../page/conversation/conversation.tsx"
import { TokenUsage } from "../page/token-usage/token-usage.tsx"

/**
 * 出している画面を選ぶ（`location.hash`。docs/screen-design.md 13.6）。**会話の画面は外さず
 * `<Activity mode="hidden">` で隠す** — 入力欄の下書き・選んでいるターン・スクロール位置は
 * どれも部品のローカル状態なので、外すと戻ったときに失われる（`<SessionProvider>` はこの上に
 * 居るので会話そのものは隠れている間も進み続ける）。`hidden` 属性と違い描画も止まるので、
 * キャラクター画面を開いている間の再描画が減る。
 */
export function Root(): ReactElement {
  const screen = useScreen()
  // 切り替えた先の領域で立ち絵が空かないよう、**どちらの画面を出していても**表情の数だけ
  // 先に読んでおく（docs/screen-design.md 13.7「切り替えのときの立ち絵」）。読み手が
  // キャラビューと雑談ビューの2つにまたがり、会話の画面を出していないときも要るので、入口で
  // 1回だけ呼ぶ。
  usePortraitPreload(useSessionSelector((session) => session.state.character?.portraits))
  // サーバと版が合わない間は、どの画面も描かず知らせだけを出す（docs/design.md 4.4）。
  const protocol = useSessionSelector((session) => session.protocol)
  if (protocol === "mismatched") {
    return <ProtocolMismatch />
  }
  return (
    <Layout
      // 画面のナビの帯（13.9）。**どの画面でも最上部に出る**ので、画面を選ぶ分岐の外で組む。
      // 会話の画面の `<ConversationLayout>` は、帯が奪う高さを CSS の変数（theme.css）から読んで
      // 縮む。**枠（`<Layout>`）は帯の中身を知らない**ので、ここで組んでから渡す。
      nav={<ScreenNav />}
      screen={
        <>
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
      }
    />
  )
}

/**
 * 会話の画面を除いた画面の部品を引く表（`stores/location-hash.ts` の画面の一覧が正典）。
 * **`satisfies` で `Screen` を尽くしているかを検査する**ので、画面を1つ足したのに部品の登録を
 * 忘れると `bun run typecheck` が落ちる。会話の画面は `<Conversation>` を常時マウントしたまま
 * `<Activity>` の可視/不可視で切り替える別枠（上の {@link Root} 参照）なのでここには乗らない。
 */
const OVERLAY_SCREEN = {
  character: <Character />,
  "token-usage": <TokenUsage />,
  achievement: <Achievement />,
} satisfies Record<Exclude<Screen, "conversation">, ReactElement>
