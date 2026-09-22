// 答え待ちの質問の自由入力欄（docs/design.md 6.1）。**選択肢の有無によらず常に1つ出す**
// （並べ方は `hooks/use-question-ask.ts` が決める）。進む操作は箱の下の1つに統一してあるので、
// ここには送るボタンを置かない。Enter で進むかどうかもフックが決める。

import { type KeyboardEvent, type ReactElement } from "react"

import { FREE_TEXT_OPTION_LABEL } from "../../../../shared/question.ts"
import styles from "../dispatch.module.css"

export function FreeTextOption(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onKeyDown: (event: Pick<KeyboardEvent, "key" | "preventDefault">) => void
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
        onKeyDown={props.onKeyDown}
      />
    </li>
  )
}
