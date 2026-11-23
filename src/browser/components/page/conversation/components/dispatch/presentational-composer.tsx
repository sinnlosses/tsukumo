// 入力欄本体の器。
// 広い画面は殻（`<ComposerShell>`）の中に、添付の札・入力欄のサーフェス（`<textarea>` かマークダウンエディタ）と補完の候補一覧・道具（画像・`/`・`@`・面の切り替えのボタン）と、仕切りを挟んでモデル・effort・許可モードの札・「新規」と送信⇄中断の <TurnStatus> を並べる。
// 狭い画面（760px 以下）は殻を使わず、欄の左右に ＋ と丸ボタンを置く。

import clsx from "clsx"
import { AtSign, Heading, ImageIcon, Plus, Slash } from "lucide-react"
import {
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react"

import {
  MAX_PROMPT_IMAGES,
  PROMPT_IMAGE_MEDIA_TYPES,
} from "../../../../../../shared/session-driver/prompt-image.ts"
import { MapBoxBadge } from "../../../../../features/architecture-map/map-box-badge.tsx"
import { RunSettingGroup } from "../../../../../features/run-setting/run-setting-group.tsx"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { deferredModule } from "../../../../../stores/deferred-module.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { ComposerShell } from "../../../../ui/composer-shell/composer-shell.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { PromptImageChips } from "../prompt-image/prompt-image.tsx"
import { CommandSuggestions } from "./command-suggestion-list.tsx"
import { ComposerBandRow } from "./composer-band-row.tsx"
import styles from "./dispatch.module.css"
import type { ComposerSurface } from "./domain/composer-surface.ts"
import { FileSuggestions } from "./file-suggestion-list.tsx"
import { NEW_SESSION_LABEL, type ComposerModel } from "./hooks/use-composer.ts"
import type { CompletionTrigger } from "./hooks/use-suggestion.ts"
import { NextStepTray } from "./next-step-tray.tsx"
import { TextAreaSurface } from "./text-area-surface.tsx"
import { PhoneTurnAction, TurnStatus } from "./turn-status.tsx"

const markdownEditorSurface = deferredModule(() => import("./markdown-editor-surface.tsx"))

type PresentationalComposerProps = ComposerModel

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.input.surfaceRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalComposer({
  input: { surfaceRef, placeholder, label, draft, onChange, onKeyDown },
  modeSwitch: { mode, onToggle: onToggleMode },
  suggestion: { suggestions, selectedIndex, onSelect: onSelectSuggestion },
  mapBox,
  promptImage: {
    imageInputRef,
    images,
    onRemoveImage,
    onPaste,
    onDragOver,
    onDrop,
    onPickImages,
    onImagesChosen,
  },
  band,
  tray,
  answering,
  onSubmit,
  onInsertTrigger,
  newSession,
}: PresentationalComposerProps): ReactElement {
  const phone = usePhoneWidth()
  const chips = <PromptImageChips images={images} onRemove={onRemoveImage} />
  const imagesFull = images.length >= MAX_PROMPT_IMAGES
  const imageLabel = imagesFull ? IMAGES_FULL_LABEL : IMAGE_LABEL
  const input = (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="none"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className={styles["dispatch-text-wrap"]}
    >
      {mapBox.badge !== undefined && (
        <MapBoxBadge badge={mapBox.badge} onRemove={mapBox.onRemove} />
      )}
      {chips}
      {(mode === "plain" || phone) && (
        <TextAreaSurface
          ref={surfaceRef}
          initialDraft={draft}
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
        <MarkdownSurface
          ref={surfaceRef}
          initialDraft={draft}
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
          omittedCount={suggestions.omittedCount}
          selectedIndex={selectedIndex}
          onSelect={onSelectSuggestion}
        />
      )}
    </VStack>
  )
  const tools = (
    <>
      <Button
        variant="ghost"
        size="action"
        pressed="none"
        disabled={imagesFull}
        ariaLabel={imageLabel}
        disclosure={{ kind: "none" }}
        title={imageLabel}
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
    </>
  )
  const turnStatus = (
    <div className={styles["dispatch-toolbar-end"]}>
      <TurnStatus
        betweenElapsedAndAction={
          <Button
            variant={answering && phone ? "outline-warn" : "outline-accent"}
            size="secondary"
            pressed="none"
            disabled={newSession.disabled}
            ariaLabel={NEW_SESSION_LABEL}
            disclosure={{ kind: "none" }}
            title={newSession.title}
            className={styles["dispatch-new-session"]}
            onClick={newSession.onStart}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            <span className={styles["dispatch-new-session-label"]}>新規</span>
          </Button>
        }
      />
    </div>
  )
  return (
    <form
      className={clsx(styles["dispatch-form"], answering && styles["is-answering"])}
      onSubmit={onSubmit}
    >
      <ComposerBandRow band={band} />
      {tray.kind === "shown" && (
        <NextStepTray steps={tray.steps} folded={tray.folded} favor={tray.favor} />
      )}
      {phone ? (
        <>
          <InputRow onPickImages={onPickImages} onInsertTrigger={onInsertTrigger}>
            {input}
          </InputRow>
          <div className={styles["dispatch-toolbar"]}>
            {tools}
            {turnStatus}
          </div>
        </>
      ) : (
        <ComposerShell
          input={input}
          tools={
            <>
              {tools}
              <span className={styles["dispatch-tool-divider"]} aria-hidden="true" />
              <RunSettingGroup placement="composer" />
            </>
          }
          actions={turnStatus}
          className={styles["dispatch-shell"]}
        />
      )}
    </form>
  )
}

type MarkdownSurfaceProps = Omit<ComponentProps<typeof TextAreaSurface>, "ref"> & {
  readonly ref: RefObject<ComposerSurface | null>
}

/**
 * 読み終わるまで（読めなかったときも）は、書式の行と同じ高さの空きを上に置いた素の `<textarea>` を出す。
 * 読み込み中の `<textarea>` にフォーカスがあれば、エディタに替わったあとへ引き継ぐ。
 */
function MarkdownSurface({ ref, ...surface }: MarkdownSurfaceProps): ReactElement {
  const state = markdownEditorSurface.useLoadState()
  const pendingHadFocus = useRef(false)
  const ready = state.kind === "ready"
  useExternalSync(() => {
    if (ready && pendingHadFocus.current) {
      pendingHadFocus.current = false
      ref.current?.focus()
    }
  }, [ready, ref])
  if (state.kind === "ready") {
    return <state.module.MarkdownEditorSurface ref={ref} {...surface} />
  }
  return <PendingMarkdownSurface ref={ref} hadFocus={pendingHadFocus} {...surface} />
}

function PendingMarkdownSurface({
  hadFocus,
  ...surface
}: MarkdownSurfaceProps & { readonly hadFocus: RefObject<boolean> }): ReactElement {
  return (
    <div
      ref={(frame) => {
        if (frame === null) {
          return undefined
        }
        return () => {
          hadFocus.current = frame.contains(document.activeElement)
        }
      }}
      className={styles["dispatch-surface-pending"]}
    >
      <div aria-hidden="true" className={styles["dispatch-format-bar-space"]} />
      <TextAreaSurface {...surface} />
    </div>
  )
}

/** 狭い画面（760px 以下）だけ、欄の左右に ＋ と丸ボタンを置く。 */
function InputRow({
  onPickImages,
  onInsertTrigger,
  children,
}: {
  readonly onPickImages: () => void
  readonly onInsertTrigger: (trigger: CompletionTrigger) => void
  readonly children: ReactNode
}): ReactElement {
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
const IMAGE_LABEL = "画像を添える"
const IMAGES_FULL_LABEL = `画像は${MAX_PROMPT_IMAGES}枚まで（外すと添えられる）`
/** 道具の口の絵の一辺（px）。口どうしで揃える。 */
const TOOL_ICON_SIZE = 18
