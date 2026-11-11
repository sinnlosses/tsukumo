import { describe, expect, it } from "vitest"

import { REPOSITORY_SCAN_TIMEOUT_MS } from "../fixture/repository-scan-timeout.ts"
import {
  compareWithLimits,
  countByBrowserCss,
  marginDeclarationCount,
} from "./design-token-declaration.ts"

describe("design-token-margin", () => {
  it(
    "部品の CSS が 0 でない margin を宣言する数が、ファイルごとの上限を超えない",
    () => {
      const { increased, decreased } = compareWithLimits(
        countByBrowserCss(marginDeclarationCount),
        MARGIN_DECLARATION_LIMITS,
      )

      expect(increased, "部品が外の余白を持たない。親の gap で間を決める").toBe("")
      expect(
        decreased,
        "margin の宣言が減った。MARGIN_DECLARATION_LIMITS の件数を減らす（0 になったら行を消す）",
      ).toBe("")
    },
    REPOSITORY_SCAN_TIMEOUT_MS,
  )
})

describe("marginDeclarationCount", () => {
  it.each([
    "margin: 0 0 var(--space-sm)",
    "margin-top: auto",
    "margin: calc(-1 * var(--space-2xs))",
    "margin-inline: auto",
  ])("数える: %s", (declaration) => {
    expect(marginDeclarationCount(`.a { ${declaration}; }`)).toBe(1)
  })

  it.each(["margin: 0", "margin-top: 0", "padding: var(--space-sm)"])(
    "数えない: %s",
    (declaration) => {
      expect(marginDeclarationCount(`.a { ${declaration}; }`)).toBe(0)
    },
  )

  it("コメントの中の宣言は数えない", () => {
    expect(marginDeclarationCount("/* margin-top: auto; */ .a { color: red; }")).toBe(0)
  })
})

/** 部品の CSS が 0 でない margin を宣言する数の、ファイルごとの上限。親の gap へ替えて減らす向きにだけ動かす。 */
const MARGIN_DECLARATION_LIMITS: Readonly<Record<string, number>> = {
  "browser/components/app/design/design.module.css": 1,
  "browser/components/app/screen-boundary.module.css": 2,
  "browser/components/frame/portrait.module.css": 1,
  "browser/components/frame/protocol-mismatch.module.css": 1,
  "browser/components/frame/screen-nav/components/nav-drawer.module.css": 2,
  "browser/components/frame/screen-nav/components/phone-head.module.css": 2,
  "browser/components/frame/screen-nav/components/screen-nav-gate.module.css": 1,
  "browser/components/frame/screen-nav/components/screen-nav-settings-dialog.module.css": 2,
  "browser/components/frame/screen-nav/components/screen-nav-settings-face-frame.module.css": 1,
  "browser/components/frame/screen-nav/components/screen-nav-settings-look.module.css": 2,
  "browser/components/frame/screen-nav/components/screen-nav-settings.module.css": 7,
  "browser/components/frame/screen-nav/components/session-switcher.module.css": 5,
  "browser/components/frame/screen-nav/components/workflow-field/workflow-choice-field.module.css": 1,
  "browser/components/frame/screen-nav/components/workflow-message/workflow-message.module.css": 1,
  "browser/components/frame/screen-nav/components/workflow-repository/workflow-repository.module.css": 1,
  "browser/components/frame/screen-nav/components/workflow-save-band/workflow-save-band.module.css": 1,
  "browser/components/frame/screen-nav/components/workflow-steps/workflow-parked-skill-list.module.css": 1,
  "browser/components/frame/screen-nav/components/workflow-steps/workflow-step-list.module.css": 2,
  "browser/components/frame/screen-nav/screen-nav.module.css": 3,
  "browser/components/frame/sidebar/components/context-usage-row.module.css": 1,
  "browser/components/frame/sidebar/components/persona-memory-section.module.css": 3,
  "browser/components/frame/sidebar/components/plan-usage-row.module.css": 2,
  "browser/components/frame/sidebar/components/profile-card.module.css": 1,
  "browser/components/frame/sidebar/components/section.module.css": 4,
  "browser/components/frame/sidebar/components/sidebar-footer.module.css": 2,
  "browser/components/frame/sidebar/sidebar.module.css": 1,
  "browser/components/page/achievement/achievement.module.css": 1,
  "browser/components/page/achievement/components/bookmark-section/bookmark-section.module.css": 1,
  "browser/components/page/achievement/components/diary-book/diary-book.module.css": 13,
  "browser/components/page/achievement/components/diary-section/diary-section.module.css": 2,
  "browser/components/page/achievement/components/lantern-calendar/lantern-calendar.module.css": 2,
  "browser/components/page/achievement/components/surprise-section/surprise-section.module.css": 2,
  "browser/components/page/character/character.module.css": 2,
  "browser/components/page/character/components/accent-swatch/accent-swatch.module.css": 1,
  "browser/components/page/character/components/character-create/character-create.module.css": 1,
  "browser/components/page/character/components/character-edit/character-edit.module.css": 6,
  "browser/components/page/character/components/character-list/character-list.module.css": 1,
  "browser/components/page/conversation/components/character-view/stage/balloon-track.css": 2,
  "browser/components/page/conversation/components/character-view/stage/balloon.css": 2,
  "browser/components/page/conversation/components/character-view/stage/layout.css": 1,
  "browser/components/page/conversation/components/character-view/stage/speech-log.css": 2,
  "browser/components/page/conversation/components/chat-view/chat-view.module.css": 5,
  "browser/components/page/conversation/components/dispatch/form/composer.css": 3,
  "browser/components/page/conversation/components/inquiry/inquiry.module.css": 12,
  "browser/components/page/conversation/components/main-view/phone/current-step.css": 2,
  "browser/components/page/conversation/components/main-view/phone/phase-list.css": 2,
  "browser/components/page/conversation/components/main-view/turn-card/aside-thread.css": 1,
  "browser/components/page/conversation/components/main-view/turn-card/layout.css": 3,
  "browser/components/page/conversation/components/main-view/turn-card/question-record.css": 6,
  "browser/components/page/conversation/components/main-view/turn-card/report-draft.css": 1,
  "browser/components/page/conversation/components/main-view/turn-card/report-head.css": 5,
  "browser/components/page/conversation/components/main-view/turn-card/request-block.css": 1,
  "browser/components/page/conversation/components/main-view/turn-card/turn-failure-block.css": 2,
  "browser/components/page/conversation/components/main-view/turn-card/turn.css": 4,
  "browser/components/page/conversation/components/main-view/turn-card/work-strip.css": 6,
  "browser/components/page/conversation/components/main-view/welcome/welcome.css": 4,
  "browser/components/page/conversation/components/pending-ask-card/pending-ask-card.module.css": 5,
  "browser/components/page/conversation/components/prompt-image/prompt-image.module.css": 2,
  "browser/components/page/token-usage/components/context-usage-card/context-usage-card.module.css": 3,
  "browser/components/page/token-usage/components/period-choice-list/period-choice-list.module.css": 1,
  "browser/components/page/token-usage/components/period-usage-card/period-usage-card.module.css": 2,
  "browser/components/page/token-usage/components/table-card-head/table-card-head.module.css": 1,
  "browser/components/page/token-usage/components/tool-usage-card/tool-usage-card.module.css": 1,
  "browser/components/page/token-usage/components/usage-review-card/usage-review-card.module.css": 2,
  "browser/components/page/token-usage/token-usage.module.css": 1,
  "browser/components/ui/visually-hidden/visually-hidden.module.css": 1,
  "browser/features/current-work/current-work-background.module.css": 2,
  "browser/features/current-work/current-work-list.module.css": 9,
  "browser/features/current-work/current-work-step-group.module.css": 2,
  "browser/features/report/leaf/chart-grid-leaf.css": 1,
  "browser/features/report/leaf/description-list-leaf.css": 1,
  "browser/features/report/leaf/interactive-view.css": 3,
  "browser/features/report/leaf/quote-leaf.css": 2,
  "browser/features/report/leaf/table-badge.css": 1,
  "browser/features/report/leaf/table-detail.css": 1,
  "browser/features/report/leaf/trace-leaf.css": 3,
  "browser/features/report/leaf/work-record-stages.css": 1,
  "browser/features/report/renderer/compare-zoom.module.css": 3,
  "browser/features/report/renderer/gauge-block.module.css": 1,
  "browser/features/report/renderer/mermaid-block.module.css": 1,
  "browser/features/report/renderer/plot-figure.module.css": 1,
  "browser/features/report/renderer/report-notation-body.css": 12,
  "browser/features/report/renderer/report-notation-card-chain.css": 1,
  "browser/features/report/renderer/report-notation-compare-code.css": 2,
  "browser/features/report/renderer/report-notation-figure.css": 12,
  "browser/features/report/renderer/report-notation-inline.css": 9,
  "browser/features/report/renderer/report-notation-prose.css": 18,
  "browser/features/report/renderer/report-notation-result.css": 15,
  "browser/features/report/renderer/report-notation-stat.css": 7,
  "browser/features/report/renderer/report-notation-summary.css": 13,
  "browser/features/report/renderer/report-notation-timeline.css": 2,
  "browser/features/report/repository-link.module.css": 1,
  "browser/features/run-setting/run-setting-option.module.css": 1,
  "browser/features/run-setting/run-setting-select.module.css": 3,
  "browser/features/task-board/components/task-board-action.module.css": 2,
  "browser/features/task-board/components/task-board-head.module.css": 1,
  "browser/features/task-board/components/task-board-list.module.css": 1,
  "browser/features/task-board/components/task-board-sort-band.module.css": 1,
  "browser/features/task-board/components/task-board-sort-choice.module.css": 2,
  "browser/features/task-board/components/task-body.module.css": 12,
  "browser/features/task-board/components/task-legend.module.css": 1,
  "browser/features/task-board/components/task-peek.module.css": 2,
  "browser/features/task-board/components/task-run-confirm.module.css": 3,
  "browser/features/task-board/components/task-running-card.module.css": 2,
  "browser/features/task-board/task-board.module.css": 7,
  "browser/features/task-board/task-refresh-button.module.css": 1,
}
