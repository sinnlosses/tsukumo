// いま出している画面（会話 / キャラクター / トークン消費 / 成果）を `location.hash` から読む
// （`docs/screen-design.md` 13.6 / 13.10 / 6.2。**ルーターのライブラリは入れない** — 画面は
// 数枚で、分岐は hook 1つで足りる）。
//
// **Context ではなく `useSyncExternalStore`** にしてあるのは、正典が React の外
// （`location.hash`）にあるため。リロードしても同じ画面に戻り、ブラウザの「戻る」が効き、
// `bun run dev` の再読み込み（`lib/refresh.ts`）でもキャラクター画面に留まれる。
// サーバの経路は増えない（`?token` はそのまま）。
//
// **hash の書き方はここに無い**（`stores/location-hash.ts`）。同じ hash の `turn` は見ている
// ターン（`stores/turn-selection.tsx`）のもので、画面を移しても消さずに運ぶ。
//
// 画面を選ぶのは`components/app/root.tsx` の `<Root>`で、**機能の側は `useScreen` を読まない**
// （出る口・入る口はただのリンクで書ける。`navigateTo` が要るのは、コマンドを送った直後に
// 画面も移す作る画面だけ）。
//
// **キャラクター画面で選んでいるパックも hash に持つ**（`#character?pack=<名前>`。
// `docs/screen-design.md` 13.6）。再読み込みしても同じパックが開いたままで、「戻る」で前に選んで
// いたパックへ戻れる。読むのは `usePackSelection`、選ぶ口のリンクは `usePackHref` が作る。
//
// **成果の画面で見ている日も hash に持つ**（`#achievement?date=<日付>`。13.10）。読むのは
// `useAchievementDateSelection`、日を切り替える呼び先は `selectAchievementDate` /
// `selectAchievementToday`（前後の日の計算は呼ぶ側 —— `components/page/achievement/` が持つ。
// ここは hash の読み書きだけ）。

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
 * 画面へ入る `<a href>` を作る関数。**見ているターンを hash に残す**ので、ターンが変わると
 * 描き直す（hook にしてあるのはそのため）。**パック・成果の日は使用中/今日に戻す**——帯の口は
 * どの画面からでも同じ場所へ移るための入口なので、前に選んでいたものへは戻さない。
 */
export function useScreenHref(): (screen: Screen) => string {
  const turn = useHashRoute((route) => route.turn)
  return (screen) => formatHash({ screen, turn, pack: IN_USE, achievementDate: TODAY })
}

/** キャラクター画面で選んでいるパック（hash の `pack`）。 */
export function usePackSelection(): PackSelection {
  // スナップショットはプリミティブに限るので名前だけを読む。**空文字は「選んでいない」**
  // （パックの名前は空にならない。`parseHash` も空の `pack` を「選んでいない」に畳む）。
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
    })
}

/**
 * 一覧でそのパックを選んだ状態にする（キャラクター画面の `pack` を書き換える）。作るダイアログで
 * 作れたパックを、閉じたあと一覧で選ぶために呼ぶ（切り替えはしない。`docs/screen-design.md` 13.6）。
 * リンクではなく呼び出し（`navigateTo` と同じ形）なのは、作った直後という**コマンドを送った
 * あとの合図**で移すため。
 */
export function selectPack(pack: string): void {
  writeHashRoute({ ...readHashRoute(), screen: "character", pack: { kind: "named", name: pack } })
}

/** 成果の画面で見ている日（hash の `date`）。 */
export function useAchievementDateSelection(): AchievementDateSelection {
  // スナップショットはプリミティブに限るので日付だけを読む。**空文字は「今日」**
  // （見た日の日付キーは空にならない。`parseHash` も空の `date` を「今日」に畳む）。
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
