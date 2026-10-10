// 入力欄本体の器。
// 入力欄の面（`<textarea>` かマークダウンエディタ）と補完の候補一覧を内包し、その下に道具の行（画像・`/`・`@`・面の切り替えのボタン、経過時間と送信⇄中断の <TurnStatus>）を置いた `<form>` を置く。

import clsx from "clsx"
import { AtSign, Heading, ImageIcon, Slash } from "lucide-react"
import { useState, type ReactElement, type ReactNode } from "react"

import { PROMPT_IMAGE_MEDIA_TYPES } from "../../../../../../../../shared/session-driver/prompt-image.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import { PromptImageChips } from "../../../prompt-image/prompt-image.tsx"
import dispatchStyles from "../../dispatch.module.css"
import { CommandSuggestions } from "../command-suggestions/command-suggestions.tsx"
import { FileSuggestions } from "../file-suggestions/file-suggestions.tsx"
import { MarkdownEditorSurface } from "../markdown-editor-surface/markdown-editor-surface.tsx"
import { TextAreaSurface } from "../text-area-surface/text-area-surface.tsx"
import { PhoneTurnAction, TurnStatus } from "../turn-status/turn-status.tsx"
import styles from "./composer.module.css"
import type { ComposerModel } from "./hooks/use-composer.ts"
import { usePhoneWidth } from "./hooks/use-phone-width.ts"
import type { CompletionTrigger } from "./hooks/use-suggestion.ts"

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
  label,
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
  const phone = usePhoneWidth()
  return (
    <form
      className={clsx(dispatchStyles["dispatch-form"], answering && dispatchStyles["is-answering"])}
      onSubmit={onSubmit}
    >
      {(band.kind === "disconnected" || band.kind === "clear-dropped") && (
        <Text
          element="p"
          size="secondary"
          tone={band.kind === "disconnected" ? "state-ng" : "state-warn"}
          weight="inherit"
          className={styles["dispatch-band-text"]}
        >
          <span role="status">{band.text}</span>
        </Text>
      )}
      {band.kind === "ended" && (
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="center"
          justify="between"
          wrap="wrap"
          className={styles["dispatch-band"]}
        >
          <Text
            element="p"
            size="secondary"
            tone="state-ng"
            weight="inherit"
            className={styles["dispatch-band-text"]}
          >
            <span role="status">{band.text}</span>
          </Text>
          <Button
            variant="outline"
            size="label"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["dispatch-band-jump"]}
            onClick={band.onRestart}
          >
            {RESTART_LABEL}
          </Button>
        </HStack>
      )}
      {/* 答え待ちのあいだだけ出る帯（誰が何を待っているか）と、お伺いの札へフォーカスを移す口。 */}
      {band.kind === "inquiry" && (
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="center"
          justify="between"
          wrap="wrap"
          className={styles["dispatch-band"]}
        >
          <Text
            element="p"
            size="secondary"
            tone="state-warn"
            weight="inherit"
            className={styles["dispatch-band-text"]}
          >
            {band.text}
          </Text>
          <Button
            variant="outline-hover-warn"
            size="label"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["dispatch-band-jump"]}
            onClick={band.onJump}
          >
            {INQUIRY_JUMP_LABEL}
          </Button>
        </HStack>
      )}
      <InputRow phone={phone} onPickImages={onPickImages} onInsertTrigger={onInsertTrigger}>
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
          {(mode === "plain" || phone) && (
            <TextAreaSurface
              ref={surfaceRef}
              draft={draft}
              placeholder={placeholder}
              label={label}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          )}
          {mode === "markdown" && !phone && (
            <MarkdownEditorSurface
              ref={surfaceRef}
              draft={draft}
              placeholder={placeholder}
              label={label}
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
      </InputRow>
      <div className={styles["dispatch-toolbar"]}>
        <Button
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

/** 狭い画面（760px 以下）だけ、欄の左右に ＋ と丸ボタンを置く。広い画面では欄だけを描く。 */
function InputRow({
  phone,
  onPickImages,
  onInsertTrigger,
  children,
}: {
  readonly phone: boolean
  readonly onPickImages: () => void
  readonly onInsertTrigger: (trigger: CompletionTrigger) => void
  readonly children: ReactNode
}): ReactElement {
  if (!phone) {
    return <>{children}</>
  }
  return (
    <div className={styles["dispatch-input-row"]}>
      <PhoneAttach onPickImages={onPickImages} onInsertTrigger={onInsertTrigger} />
      {children}
      <PhoneTurnAction />
    </div>
  )
}

/** 狭い画面（760px 以下）の入力欄の左の ＋ と、押すと欄の上に開く3行の面。 */
function PhoneAttach({
  onPickImages,
  onInsertTrigger,
}: {
  readonly onPickImages: () => void
  readonly onInsertTrigger: (trigger: CompletionTrigger) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  return (
    <>
      <button
        type="button"
        aria-label={ATTACH_LABEL}
        aria-expanded={open}
        className={styles["phone-attach"]}
        onClick={() => {
          setOpen(!open)
        }}
      >
        ＋
      </button>
      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={styles["phone-attach-cover"]}
            onClick={() => {
              setOpen(false)
            }}
          />
          <div
            role="group"
            aria-label={ATTACH_LABEL}
            className={styles["phone-attach-sheet"]}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                setOpen(false)
              }
            }}
          >
            <button type="button" autoFocus onClick={choose(onPickImages)}>
              画像を添える
            </button>
            <button type="button" onClick={choose(() => onInsertTrigger("/"))}>
              / コマンド
            </button>
            <button type="button" onClick={choose(() => onInsertTrigger("@"))}>
              @ ファイル
            </button>
          </div>
        </>
      )}
    </>
  )
}

const ATTACH_LABEL = "添える"
const INQUIRY_JUMP_LABEL = "お伺いへ"
const RESTART_LABEL = "新しく始める"

/** 道具の口の絵の一辺（px）。口どうしで揃える。 */
const TOOL_ICON_SIZE = 18
