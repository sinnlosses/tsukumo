// 入力欄本体の器。
// 入力欄の面（`<textarea>` かマークダウンエディタ）と補完の候補一覧を内包し、その下に道具の行（画像・`/`・`@`・面の切り替えのボタン、経過時間と送信⇄中断の <TurnStatus>）を置いた `<form>` を置く。

import clsx from "clsx"
import { AtSign, Heading, ImageIcon, Slash } from "lucide-react"
import type { ReactElement } from "react"

import { PROMPT_IMAGE_MEDIA_TYPES } from "../../../../../../../../shared/session-driver/prompt-image.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import { PromptImageChips } from "../../../prompt-image/prompt-image.tsx"
import styles from "../../dispatch.module.css"
import { CommandSuggestions } from "../command-suggestions/command-suggestions.tsx"
import { FileSuggestions } from "../file-suggestions/file-suggestions.tsx"
import { MarkdownEditorSurface } from "../markdown-editor-surface/markdown-editor-surface.tsx"
import { TextAreaSurface } from "../text-area-surface/text-area-surface.tsx"
import { TurnStatus } from "../turn-status/turn-status.tsx"
import type { ComposerModel } from "./hooks/use-composer.ts"

export type PresentationalComposerProps = ComposerModel

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.surfaceRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalComposer({
  surfaceRef,
  mode,
  onToggleMode,
  imageInputRef,
  placeholder,
  band,
  answering,
  draft,
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
      {/* 質問に答えている間だけ出る帯（誰が聞いているか）。 */}
      {band.kind === "question" && (
        <Text
          element="p"
          size="secondary"
          tone="state-warn"
          weight="inherit"
          className={styles["dispatch-band"]}
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
        className={styles["dispatch-text-wrap"]}
      >
        <PromptImageChips images={images} onRemove={onRemoveImage} />
        {mode === "plain" && (
          <TextAreaSurface
            ref={surfaceRef}
            draft={draft}
            placeholder={placeholder}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        )}
        {mode === "markdown" && (
          <MarkdownEditorSurface
            ref={surfaceRef}
            draft={draft}
            placeholder={placeholder}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        )}
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
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title="画像を添える"
          className={styles["dispatch-tool"]}
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
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title="コマンドを補完する"
          className={styles["dispatch-tool"]}
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
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title="ファイルを補完する"
          className={styles["dispatch-tool"]}
          onClick={() => onInsertTrigger("@")}
        >
          <AtSign size={TOOL_ICON_SIZE} strokeWidth={1.8} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="action"
          pressed={mode === "markdown" ? "on" : "off"}
          disabled={false}
          ariaLabel="マークダウンエディタで書く"
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title="マークダウンエディタで書く"
          className={styles["dispatch-tool"]}
          onClick={onToggleMode}
        >
          <Heading size={TOOL_ICON_SIZE} strokeWidth={1.8} />
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

/** 道具の口の絵の一辺（px）。口どうしで揃える。 */
const TOOL_ICON_SIZE = 18
