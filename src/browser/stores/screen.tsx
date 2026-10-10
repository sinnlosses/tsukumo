// いま出している画面（会話 / キャラクター / トークン消費 / 成果）を `location.hash` から読む。
// ルーターのライブラリは入れない（画面は数枚で、分岐は hook 1つで足りる）。
//
// Context ではなく `useSyncExternalStore` にしてあるのは、正典が React の外（`location.hash`）にあるため。
// リロードしても同じ画面に戻り、ブラウザの「戻る」が効き、開発中の再読み込みでもキャラクター画面に留まれる。
//
// 同じ hash の `turn` は見ているターンのもので、画面を移しても消さずに運ぶ。
//
// 画面を選ぶのは `<Layout>` で、機能の側は `useScreen` を読まない。
// 出る口・入る口はただのリンクで書け、`navigateTo` が要るのはコマンドを送った直後に画面も移す作る画面だけ。
//
// キャラクター画面で選んでいるパック（`#character?pack=<名前>`）と、成果の画面で見ている日（`#achievement?date=<日付>`）も hash に持つ。
// 前後の日の計算は呼ぶ側が持ち、ここは hash の読み書きだけ。

import {
  readHashRoute,
  useHashRoute,
  writeHashRoute,
  formatHash,
  type AchievementDateSelection,
  type PackSelection,
  type Screen,
} from "./location-hash.ts"

const IN_USE: PackSelection = { kind: "in-use" }
const TODAY: AchievementDateSelection = { kind: "today" }

export function useScreen(): Screen {
  return useHashRoute((route) => route.screen)
}

/** 画面を移す。見ているターンは hash に残したまま運ぶ。 */
export function navigateTo(screen: Screen): void {
  writeHashRoute({ ...readHashRoute(), screen })
}

/**
 * 画面へ入る `<a href>` を作る関数。見ているターンを hash に残すので、ターンが変わると描き直す（hook にしてあるのはそのため）。
 * パック・成果の日は使用中/今日に戻す（帯の口はどの画面からでも同じ場所へ移るための入口なので、前に選んでいたものへは戻さない）。
 */
export function useScreenHref(): (screen: Screen) => string {
  const turn = useHashRoute((route) => route.turn)
  return (screen) =>
    formatHash({ screen, turn, pack: IN_USE, achievementDate: TODAY, lastReview: false })
}

/** トークン画面で見直しの結果の札を開く `<a href>`。見ているターンは運ぶ。 */
export function useLastReviewHref(): string {
  const turn = useHashRoute((route) => route.turn)
  return formatHash({
    screen: "token-usage",
    turn,
    pack: IN_USE,
    achievementDate: TODAY,
    lastReview: true,
  })
}

/** キャラクター画面で選んでいるパック（hash の `pack`）。 */
export function usePackSelection(): PackSelection {
  // スナップショットはプリミティブに限るので名前だけを読む。空文字は「選んでいない」（パックの名前は空にならない）。
  const name = useHashRoute((route) => (route.pack.kind === "named" ? route.pack.name : ""))
  return name === "" ? IN_USE : { kind: "named", name }
}

/** キャラクター画面でそのパックを選ぶ `<a href>` を作る関数。見ているターンは運ぶ。 */
export function usePackHref(): (pack: string) => string {
  const turn = useHashRoute((route) => route.turn)
  return (pack) =>
    formatHash({
      screen: "character",
      turn,
      pack: { kind: "named", name: pack },
      achievementDate: TODAY,
      lastReview: false,
    })
}

/**
 * 一覧でそのパックを選んだ状態にする（切り替えはしない）。作るダイアログで作れたパックを、閉じたあと一覧で選ぶために呼ぶ。
 * リンクではなく呼び出しなのは、作った直後というコマンドを送ったあとの合図で移すため。
 */
export function selectPack(pack: string): void {
  writeHashRoute({ ...readHashRoute(), screen: "character", pack: { kind: "named", name: pack } })
}

/** 成果の画面で見ている日（hash の `date`）。 */
export function useAchievementDateSelection(): AchievementDateSelection {
  // スナップショットはプリミティブに限るので日付だけを読む。空文字は「今日」（見た日の日付キーは空にならない）。
  const date = useHashRoute((route) =>
    route.achievementDate.kind === "chosen" ? route.achievementDate.date : "",
  )
  return date === "" ? TODAY : { kind: "chosen", date }
}

/** 成果の画面でその日を見る（hash の `date` を書き換える）。 */
export function selectAchievementDate(date: string): void {
  writeHashRoute({
    ...readHashRoute(),
    screen: "achievement",
    achievementDate: { kind: "chosen", date },
  })
}

/** 成果の画面で今日を見る（hash の `date` を外す）。 */
export function selectAchievementToday(): void {
  writeHashRoute({ ...readHashRoute(), screen: "achievement", achievementDate: TODAY })
}
