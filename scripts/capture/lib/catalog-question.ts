// 状態のカタログのうち、答え待ち（質問・許可）の場面。

import { MAIN_REGION_SELECTOR } from "./capture-page.ts"
import { PREVIEW_IMAGE_MISSING_SELECTOR, PREVIEW_IMAGE_SELECTOR } from "./catalog-selector.ts"
import { SCENE_END_SETTLE, type CatalogEntry } from "./catalog-type.ts"

export const QUESTION_ENTRIES: readonly CatalogEntry[] = [
  {
    name: "question-multi",
    scene: "question-multi",
    label: "質問（複数選択）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-pair",
    scene: "question-pair",
    label: "質問（2問・長い説明）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-long",
    scene: "question-long",
    label: "質問（長いラベルと長い説明・複数選択と単一選択）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-preview",
    scene: "question-preview",
    label: "質問（選択肢ごとの preview を札の中、説明の下に出す）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-brief",
    scene: "question-brief",
    label: "質問（背景と判断の軸・左に選択肢・右に詳細・下に畳める比較表）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-preview-image",
    scene: "question-preview-image",
    label:
      "質問（preview に書いた手元の画像が札の幅に収まって出る。縦長の画像は高さの上限で止まる）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [
      { kind: "wait", selector: `${MAIN_REGION_SELECTOR} label:has-text("横長の案")` },
      { kind: "click", selector: `${MAIN_REGION_SELECTOR} label:has-text("横長の案")` },
      { kind: "scroll", selector: PREVIEW_IMAGE_SELECTOR },
    ],
    skipReveal: false,
    settle: { kind: "selector", selector: PREVIEW_IMAGE_SELECTOR, phase: "after-prepare" },
  },
  {
    name: "question-preview-image-missing",
    scene: "question-preview-image",
    label: "質問（preview の外部の URL・data:・置いていない画像は「画像を出せない」の札になる）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [
      { kind: "wait", selector: `${MAIN_REGION_SELECTOR} label:has-text("外の画像の案")` },
      { kind: "click", selector: `${MAIN_REGION_SELECTOR} label:has-text("外の画像の案")` },
      { kind: "scroll", selector: PREVIEW_IMAGE_MISSING_SELECTOR },
    ],
    skipReveal: false,
    settle: { kind: "selector", selector: PREVIEW_IMAGE_MISSING_SELECTOR, phase: "after-prepare" },
  },
  {
    name: "permission",
    scene: "permission",
    label: "許可プロンプト",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
]
