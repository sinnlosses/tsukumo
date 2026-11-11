// 見本帳の「画面の部品」のうち、答え待ちのカードと質問の記録の例。

import { PresentationalQuestionRecord } from "../../page/conversation/components/main-view/presentational-question-record.tsx"
import { PresentationalPendingAskCard } from "../../page/conversation/components/pending-ask-card/presentational-pending-ask-card.tsx"
import type {
  InquiryModel,
  InquiryOptionRow,
} from "../../page/conversation/stores/inquiry-answer.ts"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

function option(number: number, text: string, description: string): InquiryOptionRow {
  return {
    number,
    label: text,
    text,
    recommended: number === 1,
    description,
    preview: undefined,
    selected: false,
    irreversible: false,
    figures: [],
  }
}

type ActiveInquiry = Exclude<InquiryModel, { readonly kind: "none" }>

const COMMON = {
  id: "ask-sample",
  askedAt: 0,
  multiSelect: false,
  progressLabel: "1 / 1",
  questionCount: 1,
  showBack: false,
  last: true,
  focusedLabel: { kind: "none" },
  onFocus: noop,
  canAnswer: true,
  onToggle: noop,
  onChoose: noop,
  onAnswer: noop,
  onBack: noop,
} as const

const QUESTION: ActiveInquiry = {
  ...COMMON,
  kind: "question",
  header: "並べ方",
  brief: undefined,
  imageSizes: [],
  unshelvedImages: [],
  text: "一覧はどの順に並べますか？",
  writtenAnswer: "",
  writing: false,
  onAnswerWithText: noop,
  options: [
    option(1, "新しい順", "更新の新しいものを上に"),
    option(2, "名前順", "あいうえお順"),
    option(3, "手動", "利用者が並べ替える"),
  ],
}

const PERMISSION: ActiveInquiry = {
  ...COMMON,
  kind: "permission",
  toolName: "Bash",
  targetText: "ls -la",
  options: [option(1, "許可", ""), option(2, "拒否", "")],
}

const MULTI: ActiveInquiry = {
  ...QUESTION,
  multiSelect: true,
  progressLabel: "2 / 3",
  questionCount: 3,
  showBack: true,
  last: false,
  options: [
    { ...option(1, "見出し", ""), selected: true },
    option(2, "表", ""),
    option(3, "図", ""),
  ],
}

const NO_CHIPS = { all: [], shown: [], omittedCount: 0 }

export const INQUIRY_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "flow",
    path: "page/conversation/components/pending-ask-card/presentational-pending-ask-card.tsx",
    render: () => (
      <>
        <PresentationalPendingAskCard
          inquiry={QUESTION}
          chips={NO_CHIPS}
          sheet={{ kind: "closed" }}
          onOpenSheet={noop}
          onCloseSheet={noop}
        />
        <PresentationalPendingAskCard
          inquiry={PERMISSION}
          chips={{ all: ["ls -la"], shown: ["ls -la"], omittedCount: 0 }}
          sheet={{ kind: "closed" }}
          onOpenSheet={noop}
          onCloseSheet={noop}
        />
        <PresentationalPendingAskCard
          inquiry={MULTI}
          chips={{
            all: ["a.ts", "b.ts", "c.ts", "d.ts"],
            shown: ["a.ts", "b.ts"],
            omittedCount: 2,
          }}
          sheet={{ kind: "closed" }}
          onOpenSheet={noop}
          onCloseSheet={noop}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-question-record.tsx",
    render: () => (
      <>
        <PresentationalQuestionRecord
          toolUseId="toolu_sample_single"
          questions={[
            {
              key: "q1",
              header: "並べ方",
              text: "一覧はどの順に並べますか？",
              multiSelect: false,
              answers: [
                { key: "a1", label: "新しい順", chosen: true, isFreeText: false },
                { key: "a2", label: "名前順", chosen: false, isFreeText: false },
              ],
              previews: [],
              previewsOpened: false,
              onTogglePreviews: noop,
              brief: undefined,
            },
          ]}
        />
        <PresentationalQuestionRecord
          toolUseId="toolu_sample_multi"
          questions={[
            {
              key: "q1",
              header: "載せる欄",
              text: "載せる欄を選んでください",
              multiSelect: true,
              answers: [
                { key: "a1", label: "見出し", chosen: true, isFreeText: false },
                { key: "a2", label: "表", chosen: false, isFreeText: false },
                { key: "a3", label: "余白を広めに", chosen: true, isFreeText: true },
              ],
              previews: [],
              previewsOpened: false,
              onTogglePreviews: noop,
              brief: undefined,
            },
          ]}
        />
      </>
    ),
  },
]
