// `location.hash` の書き方を決める唯一の場所。**1本の hash を2つの store が読む**
// （出している画面は `stores/screen.tsx`、見ているターンは `stores/turn-selection.tsx`）ので、
// 片方が書くときにもう片方の部分を消さないよう、読み書きはここの {@link HashRoute} を通す。
//
// 形は `#<画面>?pack=<名前>&date=<日付>&turn=<番号>`。**画面は `?` の前、ターンは `turn` の値、
// キャラクター画面で選んでいるパックは `pack` の値、成果の画面で見ている日は `date` の値**:
//
// - `#`                           会話の画面・今回に追従（リンクの `href` に空文字を書けないので `#`）
// - `#?turn=3`                    会話の画面・通し番号 3 のターンに留める
// - `#character?turn=3`           キャラクター画面（使用中のパック）。ターンは会話の画面へ戻ったときのために運ぶ
// - `#character?pack=tsukumo`     キャラクター画面で `tsukumo` のパックを選んでいる
// - `#achievement?date=YYYY-MM-DD` 成果の画面でその日を見ている
//
// **パックと見ている日を `?` の前（`#character/<名前>`・`#achievement/<日付>`）に置かない**のは、
// `turn` と同じく画面の上に乗る付随情報だから。`pack` を読むのはキャラクター画面のときだけ、
// `date` を読むのは成果の画面のときだけで、ほかの画面へ移ると落ちる（戻ると使用中のパック・
// 今日から。`docs/screen-design.md` 13.10）。**新しく作るダイアログは URL を持たない**（表示上の
// 状態なので保存しない。開いているかどうかはキャラクター画面の state が持つ。
// `character-screen.tsx`。`docs/screen-design.md` 13.6）。
//
// **今回に追従しているときは `turn` を書かない。** 留めたターンだけが URL に乗るので、何も
// 選んでいない人のリロードは今までどおり今回を出す。**`date` も今日を見ているときは書かない**
// （今日かどうかはサーバの応答でしか分からない——ブラウザは時計を読まない——ので、hash 側は
// 「今日」を単なる「無い」として持つ。`docs/design.md` 5章「成果の集め方と配り方」）。

import { useSyncExternalStore } from "react"

/**
 * 画面の名前とラベルの一覧（唯一の正典。`docs/screen-design.md` 13.9）。**画面を1つ足すときは
 * ここへ1行足すだけでよい形にする**——`Screen` 型・帯のメニューの並び（`SCREEN_NAV_ITEMS` を
 * `use-screen-nav.ts` がそのまま使う）・hash の `?` より前のパス（{@link pathOf}）は全部ここから
 * 導く。画面の部品を引く表は `main.tsx` 側（`Record<Exclude<Screen, "conversation">, ReactElement>`
 * を `satisfies` で検査し、ここへ足したのに部品の登録を忘れたら型エラーになる）。
 */
const SCREEN_LIST = [
  { screen: "conversation", label: "会話" },
  { screen: "character", label: "キャラクター" },
  { screen: "token-usage", label: "トークン消費" },
  { screen: "achievement", label: "成果" },
] as const satisfies readonly { readonly screen: string; readonly label: string }[]

/** 出している画面。hash が対応しない値のときは会話の画面に落ちる。 */
export type Screen = (typeof SCREEN_LIST)[number]["screen"]

/** 帯のメニューが並べる順そのもの（`use-screen-nav.ts` がそのまま使う）。 */
export const SCREEN_NAV_ITEMS: readonly { readonly screen: Screen; readonly label: string }[] =
  SCREEN_LIST

/**
 * 見ているターン。`"newest"` は今回に追従する（新しいターンが始まればそちらへ移る）。
 * 番号はそのターン（`shared/main-view.ts` の `mainViewTurns` が振る通し番号）に留める。
 *
 * **プリミティブの合併にしてある**のは、`useSyncExternalStore` のスナップショットにそのまま
 * 使えるようにするため（オブジェクトだと読むたびに別物になり、描き直しが止まらない）。
 */
export type ViewedTurn = "newest" | number

/**
 * キャラクター画面で選んでいるパック（`docs/screen-design.md` 13.6）。`in-use` は使用中のパックを
 * 出す（`pack` が無いとき）。名前が一覧に無いときにどうするかは読む側（`character-screen`）が決める。
 */
export type PackSelection =
  | { readonly kind: "in-use" }
  | { readonly kind: "named"; readonly name: string }

/**
 * 成果の画面で見ている日（`docs/screen-design.md` 13.10）。`"today"` は今日を見る
 * （`date` が無いとき）。**「今日」の具体的な日付はサーバの応答でしか分からない**
 * （ブラウザは時計を読まない）ので、ここでは「指定していない」ことだけを表す。
 */
export type AchievementDateSelection =
  | { readonly kind: "today" }
  | { readonly kind: "chosen"; readonly date: string }

export type HashRoute = {
  readonly screen: Screen
  readonly turn: ViewedTurn
  readonly pack: PackSelection
  readonly achievementDate: AchievementDateSelection
}

/** hash の値の型。スナップショットが同じ値なら描き直さないよう、プリミティブに限る。 */
type HashSnapshot = string | number

/** 画面と hash の `?` より前の対応。会話の画面だけ空（`#` だけになる）で、ほかは画面名そのまま。 */
function pathOf(screen: Screen): string {
  return screen === "conversation" ? "" : screen
}

const TURN_PARAM = "turn"
const PACK_PARAM = "pack"
const DATE_PARAM = "date"
const IN_USE: PackSelection = { kind: "in-use" }
const TODAY: AchievementDateSelection = { kind: "today" }
const TURN_ID_PATTERN = /^-?\d+$/

/**
 * hash を読んで、そこから選んだ1つの値を返す。**`select` はプリミティブを返す**
 * （画面だけ読む側は、ターンだけが変わった hash で描き直さずに済む）。
 */
export function useHashRoute<T extends HashSnapshot>(select: (route: HashRoute) => T): T {
  const read = (): T => select(parseHash(window.location.hash))
  // サーバ側で描くことは無いので、サーバ用のスナップショットも同じ読み取りでよい。
  return useSyncExternalStore(subscribeToHash, read, read)
}

/** いまの hash を読む（書き換える直前に、自分が持たない部分を残すため）。 */
export function readHashRoute(): HashRoute {
  return parseHash(window.location.hash)
}

/** hash を書く。`hashchange` が起きて {@link useHashRoute} が読み直す。履歴に1つ積まれる。 */
export function writeHashRoute(route: HashRoute): void {
  window.location.hash = formatHash(route)
}

export function parseHash(hash: string): HashRoute {
  const body = hash.startsWith("#") ? hash.slice(1) : hash
  const queryStart = body.indexOf("?")
  const path = queryStart === -1 ? body : body.slice(0, queryStart)
  const params = new URLSearchParams(queryStart === -1 ? "" : body.slice(queryStart + 1))
  const screen = screenOf(path)
  return {
    screen,
    turn: turnOf(params.get(TURN_PARAM)),
    pack: screen === "character" ? packOf(params.get(PACK_PARAM)) : IN_USE,
    achievementDate: screen === "achievement" ? achievementDateOf(params.get(DATE_PARAM)) : TODAY,
  }
}

/** `<a href>` にそのまま書ける hash（会話の画面・今回に追従なら `#`）。 */
export function formatHash(route: HashRoute): string {
  const params = new URLSearchParams()
  if (route.screen === "character" && route.pack.kind === "named") {
    params.set(PACK_PARAM, route.pack.name)
  }
  if (route.screen === "achievement" && route.achievementDate.kind === "chosen") {
    params.set(DATE_PARAM, route.achievementDate.date)
  }
  if (route.turn !== "newest") {
    params.set(TURN_PARAM, String(route.turn))
  }
  const query = params.toString()
  return `#${pathOf(route.screen)}${query === "" ? "" : `?${query}`}`
}

function subscribeToHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange)
  return () => {
    window.removeEventListener("hashchange", onStoreChange)
  }
}

function screenOf(path: string): Screen {
  return SCREEN_LIST.find((entry) => pathOf(entry.screen) === path)?.screen ?? "conversation"
}

/** `URLSearchParams.get` の `null`（無い）もここで畳む。番号に読めない値は今回に追従する。 */
function turnOf(value: string | null): ViewedTurn {
  if (value === null || !TURN_ID_PATTERN.test(value)) {
    return "newest"
  }
  return Number(value)
}

/** 空の `pack` は「選んでいない」に畳む（パックの名前は空にならない）。 */
function packOf(value: string | null): PackSelection {
  return value === null || value === "" ? IN_USE : { kind: "named", name: value }
}

/**
 * 空の `date` は「今日」に畳む（見た日の日付キーは空にならない）。**形の検証はしない**——
 * 読めない形はサーバの応答が今日に倒す（`docs/design.md` 5章）ので、ここで畳むと2箇所で
 * 同じ判定を持つことになる。
 */
function achievementDateOf(value: string | null): AchievementDateSelection {
  return value === null || value === "" ? TODAY : { kind: "chosen", date: value }
}
