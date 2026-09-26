// 入力欄本体の器だけ（<PresentationalComposer>。docs/design.md 6.1）。`<textarea>` と補完の
// 候補一覧（`/` の <CommandSuggestions>・`@` の <FileSuggestions>）を内包し、その下に道具の行
// （画像・`/`・`@` のボタン、経過時間と送信⇄中断の <TurnStatus>）を置いた
// `<form>` を置く。フックも算出も持たず、`hooks/use-composer.ts` が
// 組み立てた値と呼び先をそのまま置く（docs/design.md 2章「機能の中を分ける」）。

import clsx from "clsx"
import { AtSign, ImageIcon, Slash } from "lucide-react"
import { type ReactElement } from "react"

import { PROMPT_IMAGE_MEDIA_TYPES } from "../../../../../../../../shared/prompt-image.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import { PromptImageChips } from "../../../prompt-image/prompt-image.tsx"
import styles from "../../dispatch.module.css"
import { CommandSuggestions } from "../command-suggestions/command-suggestions.tsx"
import { FileSuggestions } from "../file-suggestions/file-suggestions.tsx"
import { TurnStatus } from "../turn-status/turn-status.tsx"
import { type ComposerModel } from "./hooks/use-composer.ts"

export type PresentationalComposerProps = ComposerModel

/**
 * props はここだけ分解して受ける。ref を持つ入れ物を `props.textAreaRef` の形で描画中に
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
      className={clsx(styles["dispatch-form"], answering && styles["is-answering"])}
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
          <ImageIcon size={TOOL_ICON_SIZE} strokeWidth={1.8} />
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
          <Slash size={TOOL_ICON_SIZE} strokeWidth={1.8} />
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
          <AtSign size={TOOL_ICON_SIZE} strokeWidth={1.8} />
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
