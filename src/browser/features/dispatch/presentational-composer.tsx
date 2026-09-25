// 入力欄本体の**器だけ**（<PresentationalComposer>。docs/design.md 6.1）。`<textarea>` と補完の
// 候補一覧（`/` の <CommandSuggestions>・`@` の <FileSuggestions>）を内包し、その下に道具の行
// （画像・`/`・`@` のボタン、経過時間と送信⇄中断の <TurnStatus>）を置いた
// `<form>` を置く。フックも算出も持たず、`hooks/use-composer.ts` が
// 組み立てた値と呼び先をそのまま置く（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { PROMPT_IMAGE_MEDIA_TYPES } from "../../../shared/prompt-image.ts"
import { PromptImageChips } from "../../components/domain/prompt-image.tsx"
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
  imageInputRef,
  placeholder,
  band,
  answering,
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
    <form
      className={`${styles["dispatch-form"]}${answering ? ` ${styles["is-answering"]}` : ""}`}
      onSubmit={onSubmit}
    >
      {/* 質問に答えている間だけ出る帯（誰が聞いているか。`hooks/use-composer.ts`）。 */}
      {band.kind === "question" && <p className={styles["dispatch-band"]}>{band.text}</p>}
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
          <SlashIcon />
        </button>
        <button
          type="button"
          className={styles["dispatch-tool"]}
          aria-label="ファイルを補完する"
          title="ファイルを補完する"
          onClick={() => onInsertTrigger("@")}
        >
          <AtIcon />
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept={PROMPT_IMAGE_MEDIA_TYPES.join(",")}
          multiple
          hidden
          onChange={onImagesChosen}
        />
        <TurnStatus />
      </div>
    </form>
  )
}

/** 道具の口の絵の一辺（px）。3つの口で揃える。 */
const TOOL_ICON_SIZE = 18

/** 山と日の絵（画像を添える）。入力欄の道具の絵なのでコードに置く（原則4 の対象外）。 */
function ImageIcon(): ReactElement {
  return (
    <svg
      width={TOOL_ICON_SIZE}
      height={TOOL_ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  )
}

/** 斜めの線（コマンドを補完する）。入力欄の道具の絵なのでコードに置く（原則4 の対象外）。 */
function SlashIcon(): ReactElement {
  return (
    <svg
      width={TOOL_ICON_SIZE}
      height={TOOL_ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 4L9 20" />
    </svg>
  )
}

/** @ の絵（ファイルを補完する）。入力欄の道具の絵なのでコードに置く（原則4 の対象外）。 */
function AtIcon(): ReactElement {
  return (
    <svg
      width={TOOL_ICON_SIZE}
      height={TOOL_ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" />
    </svg>
  )
}
