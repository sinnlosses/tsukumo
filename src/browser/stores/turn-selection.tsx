// いま見ているターンを配る Context（`<TurnSelectionProvider>`）。**メインビューの札で選んだ
// ターンがキャラビューの吹き出し・表情にも効く**ので、機能のローカル状態ではなく
// `browser/stores/` に置く（`test/architecture.test.ts`「browser/ の機能どうしの import」。
// docs/design.md 2章 / 6.2）。
//
// **正典は `location.hash` の `turn`**（書き方は `stores/location-hash.ts`）。リロードしても
// 同じターンを開いたまま戻り、ブラウザの「戻る」で1つ前に見ていたターンへ移る。
// **`SessionState` には入れない。** サーバから来るものではなく、画面の都合の状態だから。
//
// 規則: hash に `turn` が無ければ今回に追従する（新しいターンが始まれば先頭へ移る）。
// 札の `‹` `›` で過去のターンを選ぶと hash にそのターンが乗り、新しいターンが来ても動かない。
// 最新のターンを選ぶ（`›` で端まで戻る・「最新へ」）と `turn` を外して追従に戻る。hash が
// 指すターンが窓（`MAX_MAIN_VIEW_TURNS` 件）に無ければ今回を出す（hash は書き換えない —
// 描くたびに外の状態を書くことになるため）。
//
// **姿からはターンの通し番号しか読まない**（畳んだ結果そのものは `stores/main-view-turn.ts` が
// 姿ごとに覚えていて、中身を出す `features/main-view/` と同じものを使う）。

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react"

import { readHashRoute, useHashRoute, writeHashRoute } from "./location-hash.ts"
import { mainViewTurnsOf } from "./main-view-turn.ts"
import { useSessionSelector } from "./session.tsx"

export type TurnSelectionValue = {
  /**
   * いま見ているターンの通し番号（`shared/main-view.ts` の `mainViewTurns` が振るもの）。
   * hash が指すターンが窓に無ければ今回に戻る。ターンが1つも無ければ undefined。
   */
  readonly activeTurnId: number | undefined
  /** 今回（いちばん新しい）のターンの通し番号。ターンが1つも無ければ undefined。 */
  readonly newestTurnId: number | undefined
  readonly selectTurn: (turnId: number) => void
}

/**
 * 部品のテストが Provider を経由せず値を差し込めるよう、Context 自体を公開する
 * （`src/browser/stores/session.tsx` の `SessionStoreContext` と同じ扱い。部品は必ず {@link useTurnSelection} を通す）。
 */
export const TurnSelectionContext = createContext<TurnSelectionValue | undefined>(undefined)

/** `<TurnSelectionProvider>` の内側でだけ呼べる。外で呼ぶのは配線の誤りなので例外にする。 */
export function useTurnSelection(): TurnSelectionValue {
  const value = useContext(TurnSelectionContext)
  if (value === undefined) {
    throw new Error("useTurnSelection は <TurnSelectionProvider> の内側でだけ呼べる")
  }
  return value
}

export type TurnSelectionProviderProps = {
  readonly children: ReactNode
}

export function TurnSelectionProvider(props: TurnSelectionProviderProps): ReactElement {
  // 札で行き来できるターン（窓の中）は昇順なので、末尾が今回。
  const newestTurnId = useSessionSelector((session) => mainViewTurnsOf(session.state).at(-1)?.id)
  const viewedTurn = useHashRoute((route) => route.turn)
  const viewedStillShown = useSessionSelector(
    (session) =>
      viewedTurn !== "newest" &&
      mainViewTurnsOf(session.state).some((turn) => turn.id === viewedTurn),
  )
  const activeTurnId = viewedTurn !== "newest" && viewedStillShown ? viewedTurn : newestTurnId

  const value = useMemo<TurnSelectionValue>(
    () => ({
      activeTurnId,
      newestTurnId,
      selectTurn: (turnId) => {
        writeHashRoute({
          ...readHashRoute(),
          turn: turnId === newestTurnId ? "newest" : turnId,
        })
      },
    }),
    [activeTurnId, newestTurnId],
  )

  return (
    <TurnSelectionContext.Provider value={value}>{props.children}</TurnSelectionContext.Provider>
  )
}
