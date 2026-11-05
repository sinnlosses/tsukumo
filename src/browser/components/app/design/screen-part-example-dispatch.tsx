// 見本帳の「画面の部品」のうち、依頼の入力まわり（入力欄・経過と送信の行）の例。

import { createRef } from "react"

import type { ComposerModel } from "../../page/conversation/components/dispatch/hooks/use-composer.ts"
import { PresentationalComposer } from "../../page/conversation/components/dispatch/presentational-composer.tsx"
import {
  PresentationalPhoneTurnAction,
  PresentationalTurnStatus,
} from "../../page/conversation/components/dispatch/presentational-turn-status.tsx"
import type { ScreenPartExample } from "./screen-part-example.tsx"

const noop = (): void => {}

const COMPOSER: ComposerModel = {
  input: {
    surfaceRef: createRef(),
    placeholder: "依頼を書く",
    label: "依頼の入力欄",
    draft: { text: "READMEの手順を見直して", caret: 12 },
    onChange: noop,
    onKeyDown: () => false,
  },
  modeSwitch: { mode: "plain", onToggle: noop },
  suggestion: { suggestions: { kind: "none" }, selectedIndex: 0, onSelect: noop },
  promptImage: {
    imageInputRef: createRef(),
    images: [],
    onRemoveImage: noop,
    onPaste: noop,
    onDragOver: noop,
    onDrop: noop,
    onPickImages: noop,
    onImagesChosen: noop,
  },
  band: { kind: "none" },
  answering: false,
  onSubmit: noop,
  onInsertTrigger: noop,
  newSession: { disabled: false, title: "新しいやり取りを始める", onStart: noop },
}

export const DISPATCH_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "popup",
    path: "page/conversation/components/dispatch/presentational-composer.tsx",
    render: () => (
      <>
        <PresentationalComposer {...COMPOSER} />
        <PresentationalComposer
          {...COMPOSER}
          answering
          input={{ ...COMPOSER.input, draft: { text: "", caret: 0 } }}
          band={{ kind: "inquiry", text: "答え待ちの質問があります", onJump: noop }}
        />
        <PresentationalComposer
          {...COMPOSER}
          input={{ ...COMPOSER.input, draft: { text: "/co", caret: 3 } }}
          suggestion={{
            ...COMPOSER.suggestion,
            suggestions: {
              kind: "command",
              matches: [
                { name: "compact", description: "会話を要約して縮める" },
                { name: "config", description: "設定を開く" },
              ],
            },
          }}
        />
        <PresentationalComposer
          {...COMPOSER}
          band={{ kind: "disconnected", text: "サーバとの接続が切れています" }}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/dispatch/presentational-turn-status.tsx",
    render: () => (
      <>
        <PresentationalTurnStatus
          betweenElapsedAndAction={undefined}
          elapsed={{ kind: "none" }}
          notice={{ kind: "none" }}
          action={{
            kind: "send",
            label: "送信",
            emphasis: "solid",
            disabled: false,
            title: "⌘⏎ で送る",
          }}
        />
        <PresentationalTurnStatus
          betweenElapsedAndAction={undefined}
          elapsed={{ kind: "shown", label: "経過", text: "1:23" }}
          notice={{
            kind: "shown",
            tone: "warn",
            label: "再試行中 2/10",
            detail: "混み合っているので少し待って再試行しています",
          }}
          action={{ kind: "interrupt", label: "中断", onInterrupt: noop }}
        />
        <PresentationalTurnStatus
          betweenElapsedAndAction={undefined}
          elapsed={{ kind: "shown", label: "失敗", text: "0:42" }}
          notice={{ kind: "shown", tone: "ng", label: "利用上限", detail: "利用上限に達しました" }}
          action={{
            kind: "send",
            label: "答える",
            emphasis: "quiet",
            disabled: true,
            title: "⌘⏎ で答える",
          }}
        />
        <PresentationalPhoneTurnAction
          kind="send"
          label="送信"
          title="⌘⏎ で送る"
          disabled={false}
        />
        <PresentationalPhoneTurnAction
          kind="interrupt"
          confirming={false}
          onAsk={noop}
          onStop={noop}
          onKeep={noop}
        />
      </>
    ),
  },
]
