// 見本帳の「画面の部品」のうち、質問の記録の例。

import { PresentationalQuestionRecord } from "../../page/conversation/components/main-view/presentational-question-record.tsx"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

export const INQUIRY_EXAMPLES: readonly ScreenPartExample[] = [
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
                {
                  key: "a1",
                  label: "新しい順",
                  chosen: true,
                  isFreeText: false,
                  isEntrusted: false,
                },
                {
                  key: "a2",
                  label: "名前順",
                  chosen: false,
                  isFreeText: false,
                  isEntrusted: false,
                },
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
                { key: "a1", label: "見出し", chosen: true, isFreeText: false, isEntrusted: false },
                { key: "a2", label: "表", chosen: false, isFreeText: false, isEntrusted: false },
                {
                  key: "a3",
                  label: "余白を広めに",
                  chosen: true,
                  isFreeText: true,
                  isEntrusted: false,
                },
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
