// 状態のカタログのうち、件専用のホーム（日記・消せるキャラクターパック）を立てて撮る場面。

import {
  DIARY_FIXTURE_BODY,
  DIARY_FIXTURE_DATE,
  SAMPLE_CHARACTER_PACK_NAME,
} from "./catalog-fixture.ts"
import {
  CHARACTER_DELETE_BAND_BUTTON_SELECTOR,
  DIARY_BODY_SELECTOR,
  DIARY_NOTICE_OPEN_SELECTOR,
  PORTRAIT_CLEAR_BUTTON_SELECTOR,
} from "./catalog-selector.ts"
import { SCENE_END_SETTLE, type CatalogEntry } from "./catalog-type.ts"

export const HOME_ENTRIES: readonly CatalogEntry[] = [
  {
    name: "diary-book",
    // `diary-written` 場面の「日記帳で開く」で見開きを開く。中身（本文・しおり）は
    // `homeSetup` が件専用のホームへ書く架空の日記から来る。
    scene: "diary-written",
    label: "日記帳の見開き",
    homeSetup: { kind: "diary", date: DIARY_FIXTURE_DATE, body: DIARY_FIXTURE_BODY },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: "#achievement" },
      { kind: "click", selector: DIARY_NOTICE_OPEN_SELECTOR },
    ],
    skipReveal: false,
    settle: { kind: "selector", selector: DIARY_BODY_SELECTOR, phase: "after-prepare" },
  },
  {
    name: "portrait-clear-confirm",
    // 消せるパックが要るので `homeSetup` が件専用のホームへ同梱の `chou` のコピーを置く。
    scene: "report",
    label: "表情を消す前の確かめ",
    homeSetup: { kind: "character", pack: SAMPLE_CHARACTER_PACK_NAME },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: `#character?pack=${SAMPLE_CHARACTER_PACK_NAME}` },
      { kind: "click", selector: PORTRAIT_CLEAR_BUTTON_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "character-delete-confirm",
    scene: "report",
    label: "キャラクターを消す前の確かめ",
    homeSetup: { kind: "character", pack: SAMPLE_CHARACTER_PACK_NAME },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: `#character?pack=${SAMPLE_CHARACTER_PACK_NAME}` },
      { kind: "click", selector: CHARACTER_DELETE_BAND_BUTTON_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
]
