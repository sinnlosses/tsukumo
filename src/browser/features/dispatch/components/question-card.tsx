// 答え待ちの質問1問ぶんの札（docs/design.md 6.1）。見出し・本文・選択肢（単一選択はボタン、
// **複数選択はチェックボックス**）と自由入力欄を置く。選択肢は `hooks/use-question-ask.ts` が
// 辞書順に並べて行（`QuestionOptionRow`）へ畳んだものを受け、判定を持たない。

import { type ReactElement } from "react"

import styles from "../dispatch.module.css"
import { type QuestionCardModel } from "../hooks/use-question-ask.ts"
import { FreeTextOption } from "./free-text-option.tsx"

export function QuestionCard(props: { readonly card: QuestionCardModel }): ReactElement {
  const { card } = props

  return (
    <div className={styles["question-card"]}>
      <p className={styles["question-header"]}>{card.header}</p>
      <p className={styles["question-text"]}>{card.text}</p>
      {card.showPreviewHint ? (
        <p className={styles["question-preview-hint"]}>
          ↑ 選択肢の比較はメインビューに出ている（触れると光る）
        </p>
      ) : null}
      <ul className={styles["question-choices"]}>
        {card.options.map((option) => {
          switch (option.kind) {
            case "free-text":
              return (
                <FreeTextOption
                  key="free-text"
                  value={card.freeText}
                  onChange={card.onFreeTextChange}
                  onKeyDown={card.onFreeTextKeyDown}
                />
              )
            case "checkbox":
              return (
                <li key={option.label}>
                  <label
                    className={`${styles["question-choice"]} ${styles["question-choice-checkbox"]}`}
                    onMouseEnter={() => card.onFocusOption(option.label)}
                    onFocus={() => card.onFocusOption(option.label)}
                  >
                    <span className={styles["question-choice-checkbox-row"]}>
                      <input
                        type="checkbox"
                        className={styles["question-choice-mark"]}
                        checked={option.checked}
                        onChange={() => card.onToggleMulti(option.label)}
                      />
                      <span className={styles["question-choice-label"]}>{option.label}</span>
                    </span>
                    <span className={styles["question-choice-description"]}>
                      {option.description}
                    </span>
                  </label>
                </li>
              )
            case "single":
              return (
                <li key={option.label}>
                  <button
                    type="button"
                    className={`${styles["question-choice"]} ${styles["question-choice-single"]}${
                      option.selected ? ` ${styles["is-selected"]}` : ""
                    }`}
                    onMouseEnter={() => card.onFocusOption(option.label)}
                    onFocus={() => card.onFocusOption(option.label)}
                    onClick={() => card.onSelectSingle(option.label)}
                  >
                    <span className={styles["question-choice-label"]}>{option.label}</span>
                    <span className={styles["question-choice-description"]}>
                      {option.description}
                    </span>
                  </button>
                </li>
              )
          }
        })}
      </ul>
    </div>
  )
}
