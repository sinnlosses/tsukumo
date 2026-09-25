// 入力欄本体の**器だけ**（<PresentationalComposer>。docs/design.md 6.1）。`<textarea>` と補完の
// 候補一覧（`/` の <CommandSuggestions>・`@` の <FileSuggestions>）を内包し、その下に道具の行
// （画像・`/`・`@` のボタン、経過時間と送信⇄中断の <TurnStatus>）を置いた
// `<form>` を置く。フックも算出も持たず、`hooks/use-composer.ts` が
// 組み立てた値と呼び先をそのまま置く（docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { PROMPT_IMAGE_MEDIA_TYPES } from "../../../../../shared/prompt-image.ts"
import { PromptImageChips } from "../../../../components/domain/prompt-image.tsx"
import { Button } from "../../../../components/ui/button/button.tsx"
import { Text } from "../../../../components/ui/text/text.tsx"
import { VStack } from "../../../../components/ui/v-stack/v-stack.tsx"
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
      {band.kind === "question" && (
        <Text
          element="p"
          size="secondary"
          tone="state-warn"
          weight="inherit"
          className={styles["dispatch-band"] ?? ""}
        >
          {band.text}
        </Text>
      )}
      <VStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="none"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["dispatch-text-wrap"] ?? ""}
      >
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
      </VStack>
      <div className={styles["dispatch-toolbar"]}>
        <Button
          type="button"
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel="画像を添える"
          ariaHasPopup={undefined}
          title="画像を添える"
          className={styles["dispatch-tool"] ?? ""}
          onClick={onPickImages}
        >
          <ImageIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel="コマンドを補完する"
          ariaHasPopup={undefined}
          title="コマンドを補完する"
          className={styles["dispatch-tool"] ?? ""}
          onClick={() => onInsertTrigger("/")}
        >
          <SlashIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel="ファイルを補完する"
          ariaHasPopup={undefined}
          title="ファイルを補完する"
          className={styles["dispatch-tool"] ?? ""}
          onClick={() => onInsertTrigger("@")}
        >
          <AtIcon />
        </Button>
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
