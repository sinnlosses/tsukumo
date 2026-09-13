// 答え待ちの箱（許可要求・質問）。`<Composer>` の `<textarea>` の上に出す（2026-09-11 決定。
// docs/design.md 6.1）。答え待ちが無いときは何も描かない。
//
// **`multiSelect` はチェックボックスで複数選べる**（docs/design.md 6.1「複数選択はチェックボックス」）。
// 旧実装（`src/presentation/browser/pending-answer.ts`）は選択肢ボタンを押すたびに同じ質問の中の
// 他の選択を必ず解除していたため、**`multiSelect` の値に関わらず単一選択的な挙動だった**
// （develop/progress.md「未解決」で疑われていた点。確認できた）。ここでは再現しない。
//
// **`answer.labels[i]` は `questions[i]` への答え1つ**（`protocol/pending-ask.ts` の契約）。
// 複数選択で2つ以上選んだときは、ここで「、」でつないで1つの文字列にする。質問の件数で
// `labels` の意味が変わらないようにするため（SDK に渡す `answers` も質問1件に対して1つの
// 文字列で、その形をそのまま保つ）。自由入力に書いた文字列は同じ並びの末尾に足す。

import { useState, type ReactElement } from "react"

import { type Answer, type PendingAsk } from "../../protocol/pending-ask.ts"
import { type Question } from "../../protocol/question.ts"
import { useSession } from "../app.tsx"
import { summarizeToolInput } from "../component/tool-summary.ts"

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
    <div className="pending-answer pending-permission">
      <p className="pending-summary">
        <span className="pending-tool">{props.pending.toolName}</span>
        {summary === "" ? "" : `: ${summary}`}
      </p>
      <div className="pending-actions">
        <button
          type="button"
          className="pending-action pending-allow"
          onClick={() => send({ kind: "allow" })}
        >
          許可
        </button>
        <button
          type="button"
          className="pending-action pending-deny"
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
}): ReactElement {
  const { dispatch } = useSession()
  const questions = props.pending.questions
  const [selections, setSelections] = useState<readonly (readonly string[])[]>(
    questions.map(() => []),
  )
  const [freeTexts, setFreeTexts] = useState<readonly string[]>(questions.map(() => ""))

  // 質問が1件だけで単一選択なら、選ぶ／自由入力を送った瞬間に答える（旧実装と同じ）。
  // それ以外（複数の質問／複数選択）は、全部に答えてから「答える」ボタンで送る。
  const needsSubmitButton = questions.length > 1 || (questions[0]?.multiSelect ?? false)

  const answerFor = (index: number): string[] => {
    const freeText = freeTexts[index]?.trim() ?? ""
    const selected = selections[index] ?? []
    return freeText === "" ? [...selected] : [...selected, freeText]
  }

  const send = (): void => {
    const labels = questions.map((_, index) => answerFor(index).join("、"))
    dispatch({
      type: "answer",
      id: props.pending.id,
      answer: { kind: "answers", labels },
    })
  }

  const selectSingle = (index: number, label: string): void => {
    setSelections((current) => current.map((selected, i) => (i === index ? [label] : selected)))
    if (!needsSubmitButton) {
      dispatch({
        type: "answer",
        id: props.pending.id,
        answer: { kind: "answers", labels: [label] },
      })
    }
  }

  const toggleMulti = (index: number, label: string): void => {
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

  const setFreeText = (index: number, value: string): void => {
    setFreeTexts((current) => current.map((existing, i) => (i === index ? value : existing)))
  }

  const sendFreeText = (index: number): void => {
    if (needsSubmitButton) {
      return
    }
    const value = freeTexts[index]?.trim() ?? ""
    if (value === "") {
      return
    }
    dispatch({
      type: "answer",
      id: props.pending.id,
      answer: { kind: "answers", labels: [value] },
    })
  }

  const allAnswered = questions.every((_, index) => answerFor(index).length > 0)

  return (
    <div className="pending-answer pending-question">
      {questions.map((question, index) => (
        <QuestionCard
          key={index}
          question={question}
          selected={selections[index] ?? []}
          freeText={freeTexts[index] ?? ""}
          onSelectSingle={(label) => selectSingle(index, label)}
          onToggleMulti={(label) => toggleMulti(index, label)}
          onFreeTextChange={(value) => setFreeText(index, value)}
          onFreeTextSend={() => sendFreeText(index)}
        />
      ))}
      {needsSubmitButton ? (
        <button
          type="button"
          className="pending-action pending-answer-submit"
          disabled={!allAnswered}
          onClick={send}
        >
          答える
        </button>
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
  readonly onFreeTextSend: () => void
}): ReactElement {
  const { question } = props
  const hasFreeTextOption = question.options.some(
    (option) => option.label === FREE_TEXT_OPTION_LABEL,
  )

  return (
    <div className="question-card">
      <p className="question-header">
        {question.header}
        {question.multiSelect ? "（複数選べる）" : ""}
      </p>
      <p className="question-text">{question.text}</p>
      <ul className="question-choices">
        {question.options.map((option) =>
          option.label === FREE_TEXT_OPTION_LABEL ? (
            <FreeTextOption
              key={option.label}
              value={props.freeText}
              onChange={props.onFreeTextChange}
              onSend={props.onFreeTextSend}
            />
          ) : question.multiSelect ? (
            <li key={option.label}>
              <label className="question-choice question-choice-checkbox">
                <span className="question-choice-checkbox-row">
                  <input
                    type="checkbox"
                    checked={props.selected.includes(option.label)}
                    onChange={() => props.onToggleMulti(option.label)}
                  />
                  <span className="question-choice-label">{option.label}</span>
                </span>
                <span className="question-choice-description">{option.description}</span>
              </label>
            </li>
          ) : (
            <li key={option.label}>
              <button
                type="button"
                className={`question-choice question-option-button${
                  props.selected.includes(option.label) ? " is-selected" : ""
                }`}
                onClick={() => props.onSelectSingle(option.label)}
              >
                <span className="question-choice-label">{option.label}</span>
                <span className="question-choice-description">{option.description}</span>
              </button>
            </li>
          ),
        )}
        {hasFreeTextOption ? null : (
          <FreeTextOption
            value={props.freeText}
            onChange={props.onFreeTextChange}
            onSend={props.onFreeTextSend}
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
 */
function FreeTextOption(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onSend: () => void
}): ReactElement {
  return (
    <li className="question-choice-other">
      <input
        type="text"
        className="question-other-input"
        placeholder="自由入力"
        aria-label={FREE_TEXT_OPTION_LABEL}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <button type="button" className="question-other-send" onClick={props.onSend}>
        送る
      </button>
    </li>
  )
}
