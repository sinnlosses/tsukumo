// **答え待ちの質問の「比べる面」**。入力欄の箱（`features/dispatch/pending-answer.tsx`）は
// 狭くてラベルと一文しか置けないので、選択肢ごとの `preview`（Markdown）はここで広く出す
// （2026-09-21 決定。「選択肢が全部文章で何がどうなのか分からない」という指摘に対する面）。
//
// **出すのは `preview` を持つ選択肢が1つでもあるときだけ。** モデルが `preview` を書かなかった
// 質問では何も描かないので、常設の枠にならない。
//
// 描くのはレポートと同じ {@link Markdown}（表・mermaid・```chart・記法の class が全部通り、
// サニタイズも同じ許可リスト1箇所で効く）。**質問の本文は会話の内容そのもの**なので、
// ここから外へ出す経路は作らない（`docs/coding-standards.md`「会話内容の扱い」）。
//
// 箱で目を置いた選択肢（`stores/question-focus.tsx` の `focusedLabel`）に印を付け、その札まで
// スクロールする。**押せるのは箱のほうだけ**で、ここは読む面に徹する（選ぶ操作を2箇所に
// 分けると、複数選択と自由入力の扱いが両側に散る）。
//
// **札の並びは箱と同じ**（`sortQuestionOptions`。ラベルの辞書順、自由入力は末尾。2026-09-21
// 決定。箱と順が食い違うと、押した位置と光る札の位置がずれて見える）。

import { useEffect, useRef, type ReactElement } from "react"

import { sortQuestionOptions, type Question } from "../../../shared/question.ts"
import { useQuestionFocus } from "../../stores/question-focus.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./main-view.module.css"
import { Markdown } from "./markdown/markdown.tsx"

export function PendingQuestion(): ReactElement | null {
  const pending = useSessionSelector((session) => session.state.pending[0])
  const { questionIndex } = useQuestionFocus()

  if (pending === undefined || pending.kind !== "question") {
    return null
  }
  const question = pending.questions[questionIndex]
  if (question === undefined || !question.options.some((option) => option.preview !== undefined)) {
    return null
  }

  return <QuestionPreviews question={question} />
}

function QuestionPreviews(props: { readonly question: Question }): ReactElement {
  const { focusedLabel } = useQuestionFocus()
  // 目を置いている札にだけ付く。**札ごとに部品へ切り出さない** — `Ref` を props で渡すと
  // oxlint の react(refs) が「描画中に ref を触っている」として落とすため、札は関数に留める。
  const focusedRef = useRef<HTMLDivElement>(null)

  // 箱で目を置いた札を、この面の中で見える位置まで連れてくる（React の外＝スクロール位置への
  // 書き込みなので `useEffect`。`block: "nearest"` なので既に見えている札では動かない）。
  useEffect(() => {
    if (focusedLabel === undefined) {
      return
    }
    focusedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [focusedLabel])

  return (
    <section className={styles["pending-question-previews"]}>
      <h3 className={styles["pending-question-heading"]}>
        {props.question.header}: {props.question.text}
      </h3>
      <div className={styles["pending-question-cards"]}>
        {sortQuestionOptions(props.question.options).map((option) => {
          const focused = option.label === focusedLabel
          return (
            <div
              key={option.label}
              ref={focused ? focusedRef : undefined}
              className={`${styles["pending-question-card"]}${
                focused ? ` ${styles["is-focused"]}` : ""
              }`}
              aria-current={focused ? "true" : undefined}
            >
              <p className={styles["pending-question-card-label"]}>{option.label}</p>
              {option.description === "" ? null : (
                <p className={styles["pending-question-card-description"]}>{option.description}</p>
              )}
              {option.preview === undefined ? null : (
                // レポートと同じ見た目の語彙（`.detail-block` の子のセレクタ）に乗せる。
                <div className={styles["detail-block"]}>
                  <Markdown text={option.preview} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
