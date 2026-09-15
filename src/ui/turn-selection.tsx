// いま見ているターンを配る Context（`<TurnSelectionProvider>`）。**メインビューのタブの選択が
// キャラビューの吹き出し・表情にも効く**ので、領域のローカル状態ではなく `ui/` の直下
// （共有部分）に置く（`test/architecture.test.ts`「ui/ の領域どうしの import」。
// docs/design.md 6.2）。
//
// **`SessionState` には入れない。** サーバから来るものではなく、画面の都合の状態
// （どのタブを見ているか）だから。
//
// 規則（もとは `<MainView>` のローカル状態。振る舞いは変えていない）:
// 新しいターンが始まったら先頭（今回）へ戻す / 利用者が過去のタブを見ている間は動かさない /
// 選んでいたターンが窓（`MAX_MAIN_VIEW_TURNS` 件）から外れたら今回に戻す。

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { mainViewTurns } from "../protocol/main-view.ts"
import { mainViewEntries } from "../protocol/session-state.ts"
import { useSession } from "./app.tsx"

export type TurnSelectionValue = {
  /**
   * いま見ているターンの通し番号（`protocol/main-view.ts` の `mainViewTurns` が振るもの）。
   * 選んでいたターンが窓から外れていれば今回に戻る。ターンが1つも無ければ undefined。
   */
  readonly activeTurnId: number | undefined
  /** 今回（いちばん新しい）のターンの通し番号。ターンが1つも無ければ undefined。 */
  readonly newestTurnId: number | undefined
  readonly selectTurn: (turnId: number) => void
}

/**
 * 部品のテストが Provider を経由せず値を差し込めるよう、Context 自体を公開する
 * （`src/ui/app.tsx` の `SessionContext` と同じ扱い。部品は必ず {@link useTurnSelection} を通す）。
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
  const { state } = useSession()
  // タブに出るターン（窓の中）の通し番号。昇順なので末尾が今回。
  const turnIds = mainViewTurns(mainViewEntries(state)).map((turn) => turn.id)
  const newestTurnId = turnIds.at(-1)

  const [selectedTurnId, setSelectedTurnId] = useState<number | undefined>(undefined)
  const lastNewestIdRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const previousNewest = lastNewestIdRef.current
    const started =
      previousNewest !== undefined && newestTurnId !== undefined && newestTurnId !== previousNewest
    // 「今回」を見ていた人だけを新しいターンへ連れていく。選んでいたターンが無い
    // （最初の1回）か、直前の「今回」を選んだままだったときだけ追従する。
    const wasFollowingNewest = selectedTurnId === undefined || selectedTurnId === previousNewest

    if (started && wasFollowingNewest) {
      setSelectedTurnId(newestTurnId)
    }
    lastNewestIdRef.current = newestTurnId
    // 依存はあえて newestTurnId だけ（selectedTurnId は判定に読むだけで、依存に含めると
    // 選択を変えるたびに「新しいターンが始まったか」の判定まで走り直ってしまう）。
  }, [newestTurnId])

  // 選んでいたターンが窓（`MAX_MAIN_VIEW_TURNS` 件）から外れたら今回に戻す。
  const activeTurnId =
    selectedTurnId !== undefined && turnIds.includes(selectedTurnId) ? selectedTurnId : newestTurnId

  return (
    <TurnSelectionContext.Provider
      value={{ activeTurnId, newestTurnId, selectTurn: setSelectedTurnId }}
    >
      {props.children}
    </TurnSelectionContext.Provider>
  )
}
