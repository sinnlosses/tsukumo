// 入力欄本体の**器だけ**（<PresentationalComposer>。docs/design.md 6.1）。`<textarea>` と補完の
// 候補一覧（`/` の <CommandSuggestions>・`@` の <FileSuggestions>）を内包し、送信⇄中断
// （<TurnStatus>）を含む `<form>` を置く。フックも算出も持たず、`hooks/use-composer.ts` が
// 組み立てた値と呼び先をそのまま置く（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { PromptImageChips } from "../../components/prompt-image.tsx"
import { CommandSuggestions } from "./command-suggestions.tsx"
import styles from "./dispatch.module.css"
import { FileSuggestions } from "./file-suggestions.tsx"
import { type ComposerModel } from "./hooks/use-composer.ts"
import { TurnStatus } from "./turn-status.tsx"

export type PresentationalComposerProps = ComposerModel

/**
 * **props はここだけ分解して受ける**。ref を持つ入れ物を `props.textAreaRef` の形で描画中に
 * 読むと `react(refs)`（規約「レンダー中に ref を読み書きしない」）が落ちるため
 * （`layout/presentational-layout.tsx` と同じ理由）。
 */
export function PresentationalComposer({
  textAreaRef,
  placeholder,
  text,
  images,
  suggestions,
  selectedIndex,
  onRemoveImage,
  onSelectSuggestion,
  onChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
  onSubmit,
}: PresentationalComposerProps): ReactElement {
  return (
    <form className={styles["dispatch-form"]} onSubmit={onSubmit}>
      <div className={styles["dispatch-text-wrap"]}>
        <PromptImageChips images={images} onRemove={onRemoveImage} />
        <textarea
          ref={textAreaRef}
          className={styles["dispatch-text"]}
          placeholder={placeholder}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
          required
        />
        {suggestions.kind === "command" && (
          <CommandSuggestions
            matches={suggestions.matches}
            selectedIndex={selectedIndex}
            onSelect={onSelectSuggestion}
          />
        )}
        {suggestions.kind === "file" && (
          <FileSuggestions
            matches={suggestions.matches}
            selectedIndex={selectedIndex}
            onSelect={onSelectSuggestion}
          />
        )}
      </div>
      <TurnStatus />
    </form>
  )
}
