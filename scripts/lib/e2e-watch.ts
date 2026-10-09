// E2E の見張りの表。ブラウザだけが読むファイルを変えたとき、どの E2E を流すかを決める。
// 根から import で届くファイルはその領域に入るので、部品を足してもこの表は直さない。

/** 画面の領域 → その領域の根の部品ファイル（リポジトリ直下からの相対パス）。 */
export const E2E_REGION_ROOTS = {
  main: ["src/browser/components/page/conversation/components/main-view/main-view.tsx"],
  character: [
    "src/browser/components/page/conversation/components/character-view/character-view.tsx",
  ],
  chat: ["src/browser/components/page/conversation/components/chat-view/chat-view.tsx"],
  dispatch: ["src/browser/components/page/conversation/components/dispatch/dispatch.tsx"],
  sidebar: [
    "src/browser/components/domain/sidebar/sidebar.tsx",
    "src/browser/components/domain/sidebar/components/run-setting-group.tsx",
    "src/browser/components/domain/sidebar/components/task-doing-count.tsx",
  ],
  "task-board": [
    "src/browser/components/page/conversation/components/requested-task-board/requested-task-board.tsx",
  ],
  "screen-nav": ["src/browser/components/domain/screen-nav/screen-nav.tsx"],
  // 会話の画面を開いたままでも、隠した `<Activity>` の中や画面の切り替えで DOM に入りうる。
  "other-screens": [
    "src/browser/components/page/achievement/achievement.tsx",
    "src/browser/components/page/achievement/components/diary-notice/diary-notice.tsx",
    "src/browser/components/page/character/character.tsx",
    "src/browser/components/page/token-usage/token-usage.tsx",
  ],
} as const satisfies Record<string, readonly string[]>

type E2eRegion = keyof typeof E2E_REGION_ROOTS

/** E2E ファイル → 見ている領域。`"every"` はページ全体を見る（どの領域を変えても流す）。 */
export const E2E_WATCHED_REGIONS = {
  "test/e2e/aside-thread.test.ts": ["main", "dispatch"],
  "test/e2e/background-task.test.ts": ["main", "dispatch"],
  "test/e2e/character-reaction.test.ts": ["character"],
  "test/e2e/chat-compact-boundary.test.ts": "every",
  "test/e2e/chat-remembered-lines.test.ts": ["sidebar", "chat"],
  "test/e2e/chat-restored-history.test.ts": ["main", "chat"],
  "test/e2e/chat-speech-gap.test.ts": ["main", "chat"],
  "test/e2e/conversation-moment.test.ts": "every",
  "test/e2e/conversation-tier.test.ts": "every",
  "test/e2e/input-dispatch.test.ts": ["main", "dispatch"],
  "test/e2e/inquiry.test.ts": ["main", "dispatch"],
  "test/e2e/live-region-focus.test.ts": "every",
  "test/e2e/markdown-composer.test.ts": ["dispatch"],
  "test/e2e/report-main-view.test.ts": ["main"],
  "test/e2e/report-task.test.ts": ["main"],
  "test/e2e/run-setting.test.ts": ["sidebar"],
  "test/e2e/session-ended.test.ts": ["main", "dispatch"],
  "test/e2e/session-resume.test.ts": ["main"],
  "test/e2e/session-switch.test.ts": "every",
  "test/e2e/speak-bubble.test.ts": ["character"],
  "test/e2e/target-size.test.ts": "every",
  "test/e2e/task-board.test.ts": ["task-board", "sidebar"],
  "test/e2e/task-list.test.ts": ["sidebar", "task-board"],
  "test/e2e/turn-failure.test.ts": ["main", "dispatch"],
  "test/e2e/turn-flow.test.ts": "every",
  "test/e2e/welcome.test.ts": ["main"],
  "test/e2e/work-strip.test.ts": ["main", "dispatch"],
} as const satisfies Record<string, readonly E2eRegion[] | "every">
