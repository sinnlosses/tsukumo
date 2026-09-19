// 答え待ちの箱（許可要求・質問）。`<Composer>` の `<textarea>` の上に出す（2026-09-11 決定。
// docs/design.md 6.1）。答え待ちが無いときは何も描かない。
//
// **質問は1問ずつ出す**（入力欄の領域が縦に溢れないようにするため。溢れるぶんは箱の中だけで
// スクロールさせる）。単一選択は選んだ瞬間に次の質問へ進み、最後の1問を答えた時点で
// **全問ぶんをまとめて1回 dispatch する**。送る前なら「戻る」で選び直せる。
//
// **`multiSelect` はチェックボックスで複数選べる**（docs/design.md 6.1「複数選択はチェックボックス」）。
//
// **`answer.labels[i]` は `questions[i]` に対して選んだ答えの並び**（`protocol/pending-ask.ts` の
// 契約）。複数選択で2つ以上選んだときはそのまま複数の要素として送り、自由入力に書いた文字列は
// 同じ並びの末尾に足す。**1つの文字列に畳むのはここではない**（2026-09-16 変更。SDK が求める
// 「質問1件に対して1つの文字列」へ畳むのは `src/core/pending-answer.ts` の役目。ここで畳むと、
// メインビューに残す記録の側で選択肢と突き合わせられなくなる）。

import { useState, type ReactElement } from "react"

import { type Answer, type PendingAsk } from "../../../protocol/pending-ask.ts"
import { type Question } from "../../../protocol/question.ts"
import { summarizeToolInput } from "../../lib/tool-summary.ts"
import { useSession } from "../../stores/session.tsx"
import styles from "./dispatch.module.css"

/** `AskUserQuestion` の自由入力の選択肢。このラベルの選択肢だけ、テキスト欄で受け取る。 */
const FREE_TEXT_OPTION_LABEL = "その他"

export function PendingAnswer(): ReactElement | null {
  const { state } = useSession()
  const pending = state.pending[0]
  if (pending === undefined) {
    return null
  }

  return pending.kind === "permission" ? (
    <PermissionAsk pending={pending} />
  ) : (
    <QuestionAsk pending={pending} />
  )
}

function PermissionAsk(props: {
  readonly pending: Extract<PendingAsk, { readonly kind: "permission" }>
}): ReactElement {
  const { dispatch } = useSession()
  const summary = summarizeToolInput(props.pending.toolName, props.pending.input)
  const send = (answer: Extract<Answer, { readonly kind: "allow" | "deny" }>): void => {
    dispatch({ type: "answer", id: props.pending.id, answer })
  }

  return (
    <div className={`${styles["pending-answer"]} ${styles["pending-permission"]}`}>
      <p className={styles["pending-summary"]}>
        <span className={styles["pending-tool"]}>{props.pending.toolName}</span>
        {summary === "" ? "" : `: ${summary}`}
      </p>
      <div className={styles["pending-actions"]}>
        <button
          type="button"
          className={`${styles["pending-action"]} ${styles["pending-allow"]}`}
          onClick={() => send({ kind: "allow" })}
        >
          許可
        </button>
        <button
          type="button"
          className={`${styles["pending-action"]} ${styles["pending-deny"]}`}
          onClick={() => send({ kind: "deny" })}
        >
          拒否
        </button>
      </div>
    </div>
  )
}

function QuestionAsk(props: {
  readonly pending: Extract<PendingAsk, { readonly kind: "question" }>
}): ReactElement | null {
  const { dispatch } = useSession()
  const questions = props.pending.questions
  // 答えは質問ごとに持ち続ける（「戻る」で前の質問に戻ったとき、選んだものが残っているように）。
  const [selections, setSelections] = useState<readonly (readonly string[])[]>(
    questions.map(() => []),
  )
  const [freeTexts, setFreeTexts] = useState<readonly string[]>(questions.map(() => ""))
  const [index, setIndex] = useState(0)

  const question = questions[index]
  if (question === undefined) {
    return null
  }

  const answerFor = (target: number): readonly string[] => {
    const freeText = freeTexts[target]?.trim() ?? ""
    const selected = selections[target] ?? []
    return freeText === "" ? selected : [...selected, freeText]
  }

  /**
   * `target` 番目の答えだけ `answer` に差し替えて `labels` を組む。
   * 選んだ直後に送るときは `setSelections` の結果をまだ読めないため、状態ではなく引数から組む。
   * 返りが可変なのは、コマンド（`protocol/command.ts`）の zod スキーマが `string[][]` を
   * 要求するため。
   */
  const labelsWith = (target: number, answer: readonly string[]): string[][] =>
    questions.map((_, i) => [...(i === target ? answer : answerFor(i))])

  const advance = (target: number, answer: readonly string[]): void => {
    if (target < questions.length - 1) {
      setIndex(target + 1)
      return
    }
    dispatch({
      type: "answer",
      id: props.pending.id,
      answer: { kind: "answers", labels: labelsWith(target, answer) },
    })
  }

  const selectSingle = (label: string): void => {
    setSelections((current) => current.map((selected, i) => (i === index ? [label] : selected)))
    // 単一選択は「選択肢」と「自由入力」の排他。選び直したら前に打った文字は捨てる。
    setFreeTexts((current) => current.map((existing, i) => (i === index ? "" : existing)))
    advance(index, [label])
  }

  const toggleMulti = (label: string): void => {
    setSelections((current) =>
      current.map((selected, i) => {
        if (i !== index) {
          return selected
        }
        return selected.includes(label)
          ? selected.filter((candidate) => candidate !== label)
          : [...selected, label]
      }),
    )
  }

  const setFreeText = (value: string): void => {
    setFreeTexts((current) => current.map((existing, i) => (i === index ? value : existing)))
    if (!question.multiSelect && value.trim() !== "") {
      // 打っている最中に、直前に押した選択肢が光ったままにならないようにする。
      setSelections((current) => current.map((selected, i) => (i === index ? [] : selected)))
    }
  }

  const currentAnswer = answerFor(index)
  const isLast = index === questions.length - 1
  const showBack = index > 0
  // 単一選択で自由入力が空のときは、選んだ瞬間に進むのでボタンを出さない。
  const showAdvance = question.multiSelect || (freeTexts[index]?.trim() ?? "") !== ""

  return (
    <div className={`${styles["pending-answer"]} ${styles["pending-question"]}`}>
      {questions.length > 1 ? (
        <div className={styles["question-progress"]}>
          <span>{`${String(questions.length)}問中${String(index + 1)}問目`}</span>
          {showBack ? (
            <button
              type="button"
              className={styles["pending-answer-back"]}
              onClick={() => setIndex(index - 1)}
            >
              戻る
            </button>
          ) : null}
        </div>
      ) : null}
      <QuestionCard
        question={question}
        selected={selections[index] ?? []}
        freeText={freeTexts[index] ?? ""}
        onSelectSingle={selectSingle}
        onToggleMulti={toggleMulti}
        onFreeTextChange={setFreeText}
        onFreeTextEnter={() => advance(index, answerFor(index))}
      />
      {showAdvance ? (
        <div className={styles["pending-answer-actions"]}>
          <button
            type="button"
            className={styles["pending-action"]}
            disabled={currentAnswer.length === 0}
            onClick={() => advance(index, currentAnswer)}
          >
            {isLast ? "答える" : "次へ"}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function QuestionCard(props: {
  readonly question: Question
  readonly selected: readonly string[]
  readonly freeText: string
  readonly onSelectSingle: (label: string) => void
  readonly onToggleMulti: (label: string) => void
  readonly onFreeTextChange: (value: string) => void
  readonly onFreeTextEnter: () => void
}): ReactElement {
  const { question } = props

  const hasFreeTextOption = question.options.some(
    (option) => option.label === FREE_TEXT_OPTION_LABEL,
  )

  return (
    <div className={styles["question-card"]}>
      <p className={styles["question-header"]}>
        {question.header}
        {question.multiSelect ? "（複数選べる）" : ""}
      </p>
      <p className={styles["question-text"]}>{question.text}</p>
      <ul className={styles["question-choices"]}>
        {question.options.map((option) =>
          option.label === FREE_TEXT_OPTION_LABEL ? (
            <FreeTextOption
              key={option.label}
              value={props.freeText}
              onChange={props.onFreeTextChange}
              onEnter={props.onFreeTextEnter}
            />
          ) : question.multiSelect ? (
            <li key={option.label}>
              <label
                className={`${styles["question-choice"]} ${styles["question-choice-checkbox"]}`}
              >
                <span className={styles["question-choice-checkbox-row"]}>
                  <input
                    type="checkbox"
                    checked={props.selected.includes(option.label)}
                    onChange={() => props.onToggleMulti(option.label)}
                  />
                  <span className={styles["question-choice-label"]}>{option.label}</span>
                </span>
                <span className={styles["question-choice-description"]}>{option.description}</span>
              </label>
            </li>
          ) : (
            <li key={option.label}>
              <button
                type="button"
                className={`${styles["question-choice"]}${
                  props.selected.includes(option.label) ? ` ${styles["is-selected"]}` : ""
                }`}
                onClick={() => props.onSelectSingle(option.label)}
              >
                <span className={styles["question-choice-label"]}>{option.label}</span>
                <span className={styles["question-choice-description"]}>{option.description}</span>
              </button>
            </li>
          ),
        )}
        {hasFreeTextOption ? null : (
          <FreeTextOption
            value={props.freeText}
            onChange={props.onFreeTextChange}
            onEnter={props.onFreeTextEnter}
          />
        )}
      </ul>
    </div>
  )
}

/**
 * 自由入力欄。**選択肢の有無によらず常に1つ出す**（モデルが選択肢に「その他」を含めてこなかった
 * ときの受け皿。モデルが自分で足したときは、その位置に出して二重にしない。呼び出し側
 * {@link QuestionCard} が判断する）。
 *
 * 進む操作は箱の下の1つに統一してあるので、ここには送るボタンを置かない。Enter で進む。
 */
function FreeTextOption(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onEnter: () => void
}): ReactElement {
  return (
    <li className={styles["question-choice-other"]}>
      <input
        type="text"
        className={styles["question-other-input"]}
        placeholder="自由入力"
        aria-label={FREE_TEXT_OPTION_LABEL}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.currentTarget.value.trim() === "") {
            return
          }
          event.preventDefault()
          props.onEnter()
        }}
      />
    </li>
  )
}
