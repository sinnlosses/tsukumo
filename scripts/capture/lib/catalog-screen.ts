// 状態のカタログのうち、タスク一覧・入力の補完・キャラクター画面の場面。

import {
  COMPOSER_SELECTOR,
  DRAWER_TASKS_TAB_SELECTOR,
  DRAWER_TOGGLE_SELECTOR,
  TASK_BOARD_SELECTOR,
} from "./catalog-selector.ts"
import { SCENE_END_SETTLE, type CatalogEntry } from "./catalog-type.ts"

export const SCREEN_ENTRIES: readonly CatalogEntry[] = [
  {
    name: "task-board",
    scene: "report",
    label: "タスク一覧のモーダル",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "click", selector: DRAWER_TOGGLE_SELECTOR },
      { kind: "click", selector: DRAWER_TASKS_TAB_SELECTOR },
      { kind: "click", selector: TASK_BOARD_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "command-suggestions",
    scene: "report",
    label: "「/」のコマンド補完",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "/c" }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "file-suggestions",
    scene: "report",
    label: "「@」のファイル補完",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "@src/browser/" }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "character-screen",
    scene: "report",
    label: "キャラクター画面",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "hash", hash: "#character" }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "character-create",
    scene: "report",
    label: "キャラクターを作る画面",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: "#character" },
      { kind: "click", selector: `[class*="character-list-new_"]` },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
]
