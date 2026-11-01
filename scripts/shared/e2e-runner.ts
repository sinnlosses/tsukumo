// E2E のファイルを `@playwright/test` と vitest のどちらで流すかを決める表と、ファイルの列を分ける関数。

/** `@playwright/test` で流す E2E のファイル（`test/e2e/<シナリオ>.test.ts`）。載らないファイルは vitest で流す。 */
export const PLAYWRIGHT_E2E_FILES: readonly string[] = [
  "test/e2e/aside-thread.test.ts",
  "test/e2e/background-task.test.ts",
  "test/e2e/body-fence.test.ts",
  "test/e2e/character-reaction.test.ts",
  "test/e2e/chat-compact-boundary.test.ts",
  "test/e2e/chat-remembered-line-list.test.ts",
  "test/e2e/chat-restored-history.test.ts",
  "test/e2e/chat-speech-gap.test.ts",
  "test/e2e/conversation-moment.test.ts",
  "test/e2e/conversation-tier.test.ts",
  "test/e2e/design-gallery.test.ts",
  "test/e2e/image-layout.test.ts",
  "test/e2e/input-dispatch.test.ts",
  "test/e2e/inquiry.test.ts",
  "test/e2e/live-region-focus.test.ts",
  "test/e2e/markdown-composer.test.ts",
  "test/e2e/phone-composer.test.ts",
  "test/e2e/phone-inquiry.test.ts",
  "test/e2e/report-main-view.test.ts",
  "test/e2e/report-spacing.test.ts",
  "test/e2e/report-task.test.ts",
  "test/e2e/run-setting.test.ts",
  "test/e2e/session-ended.test.ts",
  "test/e2e/session-switch.test.ts",
  "test/e2e/spacing-media.test.ts",
  "test/e2e/spacing-verdict.test.ts",
  "test/e2e/speak-bubble.test.ts",
  "test/e2e/target-size.test.ts",
  "test/e2e/task-board.test.ts",
  "test/e2e/task-list.test.ts",
  "test/e2e/turn-failure.test.ts",
  "test/e2e/turn-flow.test.ts",
  "test/e2e/usage-review-own-session.test.ts",
  "test/e2e/welcome.test.ts",
  "test/e2e/work-strip-phase-popover.test.ts",
  "test/e2e/work-strip.test.ts",
  "test/e2e/workflow-setting.test.ts",
]

export type E2eRunnerSplit = {
  readonly vitest: readonly string[]
  readonly playwright: readonly string[]
}

/** `./` 付きの渡し方も表のパスと同じものとして扱う。 */
export function splitE2eFiles(
  files: readonly string[],
  playwrightFiles: readonly string[] = PLAYWRIGHT_E2E_FILES,
): E2eRunnerSplit {
  const table = new Set(playwrightFiles)
  const inTable = (file: string): boolean => table.has(file.replace(/^\.\//, ""))
  return {
    vitest: files.filter((file) => !inTable(file)),
    playwright: files.filter(inTable),
  }
}
