// 答え待ちの質問について、**いま何問目を見ていて、どの選択肢に目を置いているか**を配る Context
// （`<QuestionFocusProvider>`）。入力欄の箱（`features/dispatch/pending-answer.tsx`）と
// メインビューの比較（`features/main-view/pending-question.tsx`）が同じ選択に従うので、
// 機能のローカル状態ではなく `browser/stores/` に置く
// （`test/architecture.test.ts`「browser/ の機能どうしの import」。docs/design.md 2章 / 6.2）。
//
// **`SessionState` には入れない。** サーバから来るものではなく、画面の都合の状態だから
// （`stores/turn-selection.tsx` と同じ理由）。
//
// 答え待ちが入れ替わったら（別の質問が来た・答え終わった）**両方とも初期値に戻す**。
// 戻すのは**レンダー中に見比べて**決める（画面の外と同期する処理ではないので `useEffect` は
// 使わない。docs/coding-standards.md「useEffect の代わりに使うもの」）。

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { useSessionSelector } from "./session.tsx"

export type QuestionFocusValue = {
  /** 箱がいま出している質問の位置（`PendingAsk` の `questions` の添字）。 */
  readonly questionIndex: number
  /**
   * 目を置いている選択肢のラベル。**押した／触れた／キーボードで当たった**もので、
   * 「選んだ」とは別（選んだものは箱のローカル状態が持つ）。どれにも当たっていなければ undefined。
   */
  readonly focusedLabel: string | undefined
  readonly setQuestionIndex: (index: number) => void
  readonly setFocusedLabel: (label: string | undefined) => void
}

/**
 * 部品のテストが Provider を経由せず値を差し込めるよう、Context 自体を公開する
 * （`stores/turn-selection.tsx` と同じ扱い。部品は必ず {@link useQuestionFocus} を通す）。
 */
export const QuestionFocusContext = createContext<QuestionFocusValue | undefined>(undefined)

/** `<QuestionFocusProvider>` の内側でだけ呼べる。外で呼ぶのは配線の誤りなので例外にする。 */
export function useQuestionFocus(): QuestionFocusValue {
  const value = useContext(QuestionFocusContext)
  if (value === undefined) {
    throw new Error("useQuestionFocus は <QuestionFocusProvider> の内側でだけ呼べる")
  }
  return value
}

export type QuestionFocusProviderProps = {
  readonly children: ReactNode
}

export function QuestionFocusProvider(props: QuestionFocusProviderProps): ReactElement {
  // 答え待ちの id だけを読む（中身まで読むと、質問の並びが同じでも参照が変わるたびに描き直す）。
  const pendingId = useSessionSelector((session) => session.state.pending[0]?.id)

  const [questionIndex, setQuestionIndex] = useState(0)
  const [focusedLabel, setFocusedLabel] = useState<string | undefined>(undefined)
  const [shownPendingId, setShownPendingId] = useState<string | undefined>(undefined)

  if (shownPendingId !== pendingId) {
    setShownPendingId(pendingId)
    setQuestionIndex(0)
    setFocusedLabel(undefined)
  }

  const value = useMemo<QuestionFocusValue>(
    () => ({ questionIndex, focusedLabel, setQuestionIndex, setFocusedLabel }),
    [questionIndex, focusedLabel],
  )

  return (
    <QuestionFocusContext.Provider value={value}>{props.children}</QuestionFocusContext.Provider>
  )
}
