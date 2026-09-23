// 入力欄本体の**器だけ**（<PresentationalComposer>。docs/design.md 6.1）。`<textarea>` と補完の
// 候補一覧（`/` の <CommandSuggestions>・`@` の <FileSuggestions>）を内包し、その下に道具の行
// （画像・`/`・`@` のボタン、操作の案内、経過時間と送信⇄中断の <TurnStatus>）を置いた
// `<form>` を置く。フックも算出も持たず、`hooks/use-composer.ts` が
// 組み立てた値と呼び先をそのまま置く（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { PROMPT_IMAGE_MEDIA_TYPES } from "../../../shared/prompt-image.ts"
import { PromptImageChips } from "../../components/prompt-image.tsx"
import { CommandSuggestions } from "./command-suggestions.tsx"
import styles from "./dispatch.module.css"
import { FileSuggestions } from "./file-suggestions.tsx"
import { type ComposerModel } from "./hooks/use-composer.ts"
import { TurnStatus } from "./turn-status.tsx"

export type PresentationalComposerProps = ComposerModel

/** 操作の案内。道具の行に1行で出し、入らなければ末尾から省く（全文は `title` で読める）。 */
const OPERATION_HINT =
  "Enter で改行 · ⌘Enter で送信 · / でコマンド · @ でファイル · 画像は貼り付けかドロップでも"

/**
 * **props はここだけ分解して受ける**。ref を持つ入れ物を `props.textAreaRef` の形で描画中に
 * 読むと `react(refs)`（規約「レンダー中に ref を読み書きしない」）が落ちるため
 * （`layout/presentational-layout.tsx` と同じ理由）。
 */
export function PresentationalComposer({
  textAreaRef,
  imageInputRef,
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
  onPickImages,
  onImagesChosen,
  onInsertTrigger,
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
      <div className={styles["dispatch-toolbar"]}>
        <button
          type="button"
          className={styles["dispatch-tool"]}
          aria-label="画像を添える"
          title="画像を添える"
          onClick={onPickImages}
        >
          <ImageIcon />
        </button>
        <button
          type="button"
          className={styles["dispatch-tool"]}
          aria-label="コマンドを補完する"
          title="コマンドを補完する"
          onClick={() => onInsertTrigger("/")}
        >
          /
        </button>
        <button
          type="button"
          className={styles["dispatch-tool"]}
          aria-label="ファイルを補完する"
          title="ファイルを補完する"
          onClick={() => onInsertTrigger("@")}
        >
          @
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept={PROMPT_IMAGE_MEDIA_TYPES.join(",")}
          multiple
          hidden
          onChange={onImagesChosen}
        />
        <span className={styles["dispatch-hint"]} title={OPERATION_HINT}>
          {OPERATION_HINT}
        </span>
        <TurnStatus />
      </div>
    </form>
  )
}

/** 山と日の絵（画像を添える）。入力欄の道具の絵なのでコードに置く（原則4 の対象外）。 */
function ImageIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <rect
        x="1.8"
        y="2.8"
        width="12.4"
        height="10.4"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="5.6" cy="6.3" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M2.2 11.6l3.6-3.2 2.6 2.2 2.2-1.8 3.2 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
