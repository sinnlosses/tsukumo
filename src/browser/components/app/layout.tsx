// 全画面の外枠（`<Layout>`）。会話の画面「舞台と紙」を描き、ほかの画面は会話の画面を隠さずに右から重ねる紙（`<Sheet>`）で描く。
//
// 画面の入れ替えを画面の側に持たせると画面どうしの import になり、構造の検査「browser/ の機能どうしの import」が落とす。
// だから、すべての画面を知ってよい画面の登録表（`LAYOUT_SCREENS`）が登録表を作り、ここは表を受けて選ぶだけにする。
// 描画の失敗は画面ごとの `<ScreenBoundary>` で受け止める。

import { Activity, type ReactElement } from "react"

import { taskReadiness } from "../../../shared/repository/task-summary.ts"
import { SHEET_TITLES, type Screen, type SheetScreen } from "../../stores/location-hash.ts"
import { navigateTo, useScreen } from "../../stores/screen.tsx"
import { useSession } from "../../stores/session.ts"
import { Sheet, type SheetSub } from "../ui/sheet/sheet.tsx"
import { ScreenBoundary } from "./screen-boundary.tsx"

type OverlayScreen = Exclude<Screen, "conversation">

/**
 * 画面の登録表。会話の画面は常にマウントしたまま `Layout` が隠すので、`overlay` には乗らない。
 * 表の要素は画面の部品そのもので、遅延読み込みの画面は読み込む部品を要素に包んで渡す。
 */
export type LayoutScreens = {
  readonly skipLink: ReactElement
  readonly diaryNotice: ReactElement
  readonly conversation: ReactElement
  readonly overlay: Record<OverlayScreen, ReactElement>
}

/**
 * 出している画面を選ぶ（`location.hash`）。
 * 会話の画面は外さず `<Activity mode="hidden">` で隠す。
 * 入力欄の下書き・選んでいるターン・スクロール位置はどれも部品のローカル状態なので、外すと戻ったときに失われる。
 * サーバとの接続は `<Root>` が持つので、会話そのものは隠れている間も進み続ける。
 * `hidden` 属性と違い描画も止まるので、ほかの画面を開いている間の再描画が減る。
 *
 * 紙を開いているあいだも会話の画面を出したままにする（舞台と部屋の頭から紙を切り替えるため）。
 * `<Sheet>` は閉じたときに開いた入口へフォーカスを戻すので、紙の画面の外でも外さずに置く。
 */
export function Layout(props: { readonly screens: LayoutScreens }): ReactElement {
  const screen = useScreen()
  const { screens } = props
  const sheetScreen = isSheetScreen(screen) ? screen : undefined
  const tasks = useSession((session) => session.state.tasks)
  const packCount = useSession((session) => session.state.characterPacks.length)
  const sheetSub: SheetSub =
    sheetScreen === "tasks" && tasks.kind === "known"
      ? {
          kind: "shown",
          text: `着手できる ${String(tasks.items.filter((task) => taskReadiness(task)?.kind === "ready").length)} ・ ぜんぶで ${String(tasks.items.length)}`,
        }
      : sheetScreen === "character"
        ? { kind: "shown", text: `${String(packCount)}人` }
        : sheetScreen === "token-usage"
          ? { kind: "shown", text: "このセッションと、プランの枠" }
          : { kind: "none" }
  const conversationShown = screen === "conversation" || sheetScreen !== undefined
  return (
    <>
      {screen === "conversation" && screens.skipLink}
      {/* 書き終わりの知らせ。成果の画面でだけ出す。
          ほかの画面へ移っても「×」で消したかどうかを忘れないよう、外さずに `<Activity>` で隠す。 */}
      <Activity mode={screen === "achievement" ? "visible" : "hidden"}>
        <ScreenBoundary>{screens.diaryNotice}</ScreenBoundary>
      </Activity>
      <Activity mode={conversationShown ? "visible" : "hidden"}>
        <ScreenBoundary>{screens.conversation}</ScreenBoundary>
      </Activity>
      <Sheet
        open={sheetScreen !== undefined}
        title={sheetScreen === undefined ? "" : SHEET_TITLES[sheetScreen]}
        sub={sheetSub}
        flush={sheetScreen === "tasks"}
        onClose={() => {
          navigateTo("conversation")
        }}
      >
        {sheetScreen !== undefined && (
          <ScreenBoundary key={sheetScreen}>{screens.overlay[sheetScreen]}</ScreenBoundary>
        )}
      </Sheet>
      {screen !== "conversation" && sheetScreen === undefined && (
        <ScreenBoundary key={screen}>{screens.overlay[screen]}</ScreenBoundary>
      )}
    </>
  )
}

function isSheetScreen(screen: Screen): screen is SheetScreen {
  return screen !== "conversation" && screen !== "design"
}
