// 帯の「いまの作業」の一覧にある「質問へ」から、メインビューの質問の札
// （`components/page/conversation/components/main-view/components/question-ask/question-ask.tsx`）へスクロールしてほしいという一回限りの合図を配る
// Context（`docs/screen-design.md` 13.9「いまの作業」）。`browser/` の機能どうしは import できないので、
// `stores/turn-selection.tsx` / `stores/question-answer.tsx` と同じ形（Provider が持つ値を
// 両方の機能が読み書きする）で伝える。
//
// 持つのは「押された回数」だけ（質問そのものは `SessionState` から来るので、ここには
// 入れない）。回数が増えるたびに、質問の札の側がスクロールし直す。

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

export type QuestionScrollValue = {
  /** 押されるたびに増える。質問の札はこの値を `useEffect` の依存に足してスクロールし直す。 */
  readonly signal: number
  /** 帯の「質問へ」が呼ぶ。 */
  readonly requestScroll: () => void
}

/**
 * 部品のテストが Provider を経由せず値を差し込めるよう、Context 自体を公開する
 * （`stores/turn-selection.tsx` と同じ扱い。部品は必ず {@link useQuestionScroll} を通す）。
 */
export const QuestionScrollContext = createContext<QuestionScrollValue | undefined>(undefined)

/** `<QuestionScrollProvider>` の内側でだけ呼べる。外で呼ぶのは配線の誤りなので例外にする。 */
export function useQuestionScroll(): QuestionScrollValue {
  const value = useContext(QuestionScrollContext)
  if (value === undefined) {
    throw new Error("useQuestionScroll は <QuestionScrollProvider> の内側でだけ呼べる")
  }
  return value
}

export type QuestionScrollProviderProps = {
  readonly children: ReactNode
}

export function QuestionScrollProvider(props: QuestionScrollProviderProps): ReactElement {
  const [signal, setSignal] = useState(0)

  const value = useMemo<QuestionScrollValue>(
    () => ({ signal, requestScroll: () => setSignal((count) => count + 1) }),
    [signal],
  )

  return (
    <QuestionScrollContext.Provider value={value}>{props.children}</QuestionScrollContext.Provider>
  )
}
