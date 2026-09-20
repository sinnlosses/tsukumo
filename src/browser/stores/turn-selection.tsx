// いま見ているターンを配る Context（`<TurnSelectionProvider>`）。**メインビューのタブの選択が
// キャラビューの吹き出し・表情にも効く**ので、機能のローカル状態ではなく `browser/stores/` に置く
// （`test/architecture.test.ts`「browser/ の機能どうしの import」。docs/design.md 2章 / 6.2）。
//
// **`SessionState` には入れない。** サーバから来るものではなく、画面の都合の状態
// （どのタブを見ているか）だから。
//
// 規則（もとは `<MainView>` のローカル状態。振る舞いは変えていない）:
// 新しいターンが始まったら先頭（今回）へ戻す / 利用者が過去のタブを見ている間は動かさない /
// 選んでいたターンが窓（`MAX_MAIN_VIEW_TURNS` 件）から外れたら今回に戻す。
//
// **姿からはターンの通し番号しか読まない**（畳んだ結果そのものは `stores/main-view-turn.ts` が
// 姿ごとに覚えていて、中身を出す `features/main-view/` と同じものを使う）。番号が変わらない
// フレームではここは描き直さないので、配る値も変わらない。

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { mainViewTurnsOf } from "./main-view-turn.ts"
import { useSessionSelector } from "./session.tsx"

export type TurnSelectionValue = {
  /**
   * いま見ているターンの通し番号（`shared/main-view.ts` の `mainViewTurns` が振るもの）。
   * 選んでいたターンが窓から外れていれば今回に戻る。ターンが1つも無ければ undefined。
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
  // タブに出るターン（窓の中）は昇順なので、末尾が今回。
  const newestTurnId = useSessionSelector((session) => mainViewTurnsOf(session.state).at(-1)?.id)

  const [selectedTurnId, setSelectedTurnId] = useState<number | undefined>(undefined)
  // 前のレンダーの「今回」。追従は**レンダー中に見比べて**決める（画面の外と同期する処理では
  // なく、届いた記録から決まる選択の更新なので `useEffect` は使わない。
  // docs/coding-standards.md「useEffect の代わりに使うもの」）。
  const [previousNewestTurnId, setPreviousNewestTurnId] = useState<number | undefined>(undefined)

  if (previousNewestTurnId !== newestTurnId) {
    setPreviousNewestTurnId(newestTurnId)
    const started = previousNewestTurnId !== undefined && newestTurnId !== undefined
    // 「今回」を見ていた人だけを新しいターンへ連れていく。選んでいたターンが無い
    // （最初の1回）か、直前の「今回」を選んだままだったときだけ追従する。
    const wasFollowingNewest =
      selectedTurnId === undefined || selectedTurnId === previousNewestTurnId
    if (started && wasFollowingNewest) {
      setSelectedTurnId(newestTurnId)
    }
  }

  // 選んでいたターンが窓（`MAX_MAIN_VIEW_TURNS` 件）から外れたら今回に戻す。
  const selectedStillShown = useSessionSelector(
    (session) =>
      selectedTurnId !== undefined &&
      mainViewTurnsOf(session.state).some((turn) => turn.id === selectedTurnId),
  )
  const activeTurnId = selectedStillShown ? selectedTurnId : newestTurnId

  const value = useMemo<TurnSelectionValue>(
    () => ({ activeTurnId, newestTurnId, selectTurn: setSelectedTurnId }),
    [activeTurnId, newestTurnId],
  )

  return (
    <TurnSelectionContext.Provider value={value}>{props.children}</TurnSelectionContext.Provider>
  )
}
