// 全画面の外枠（`<Layout>`）。最上部に画面のナビの帯を置き、その下に出している画面を選んで描く。
//
// 画面の入れ替えを画面の側に持たせると画面どうしの import になり、構造の検査「browser/ の機能どうしの import」が落とす。
// だから、すべての画面を知ってよい画面の登録表（`LAYOUT_SCREENS`）が登録表を作り、ここは表を受けて選ぶだけにする。
// 描画の失敗は画面ごとの `<ScreenBoundary>` で受け止める。帯は境界の外に置き、壊れた画面からでも別の画面へ移れるようにする。

import { Activity, type ReactElement } from "react"

import type { Screen } from "../../stores/location-hash.ts"
import { useScreen } from "../../stores/screen.tsx"
import { ScreenBoundary } from "./screen-boundary.tsx"

/**
 * 画面の登録表。会話の画面は常にマウントしたまま `Layout` が隠すので、`overlay` には乗らない。
 * 表の要素は画面の部品そのもので、遅延読み込みの画面は読み込む部品を要素に包んで渡す。
 */
export type LayoutScreens = {
  readonly skipLink: ReactElement
  /** 画面のナビの帯（狭い画面の引き出しの中身を差し込み済み）。 */
  readonly nav: ReactElement
  readonly diaryNotice: ReactElement
  readonly conversation: ReactElement
  readonly overlay: Record<Exclude<Screen, "conversation">, ReactElement>
}

/**
 * 出している画面を選ぶ（`location.hash`）。
 * 会話の画面は外さず `<Activity mode="hidden">` で隠す。
 * 入力欄の下書き・選んでいるターン・スクロール位置はどれも部品のローカル状態なので、外すと戻ったときに失われる。
 * サーバとの接続は `<Root>` が持つので、会話そのものは隠れている間も進み続ける。
 * `hidden` 属性と違い描画も止まるので、ほかの画面を開いている間の再描画が減る。
 */
export function Layout(props: { readonly screens: LayoutScreens }): ReactElement {
  const screen = useScreen()
  const { screens } = props
  return (
    <>
      {screen === "conversation" && screens.skipLink}
      {/* 画面のナビの帯。どの画面でも最上部に出るので、画面を選ぶ分岐の外に置く。
          会話の画面の `<ConversationLayout>` は、帯が奪う高さを CSS の変数（theme.css）から読んで縮む。 */}
      {screens.nav}
      {/* 書き終わりの知らせ。成果の画面でだけ出す。
          ほかの画面へ移っても「×」で消したかどうかを忘れないよう、外さずに `<Activity>` で隠す。 */}
      <Activity mode={screen === "achievement" ? "visible" : "hidden"}>
        <ScreenBoundary>{screens.diaryNotice}</ScreenBoundary>
      </Activity>
      <Activity mode={screen === "conversation" ? "visible" : "hidden"}>
        <ScreenBoundary>{screens.conversation}</ScreenBoundary>
      </Activity>
      {screen !== "conversation" && (
        <ScreenBoundary key={screen}>{screens.overlay[screen]}</ScreenBoundary>
      )}
    </>
  )
}
