// カタログの件を撮る前の下ごしらえ。作業場所と件専用のホームに架空の中身を置く。

import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { tsukumoHomePath } from "../../../src/server/adapter/tsukumo-home.ts"
import { appendDiaryParagraph } from "../../../src/server/diary/adapter/diary.ts"
import { FAKE_BEADS_ISSUES_PATH } from "../../../src/server/repository/adapter/fake-beads.ts"
import { parseDateKey } from "../../../src/shared/achievement/achievement.ts"
import { fictionalPng } from "../../shared/fictional-png.ts"
import { REPOSITORY_ROOT } from "../../shared/repository-root.ts"
import type { CatalogEntry, HomeSetup } from "./catalog-entry.ts"

/** `bd list --json` の1件の形の架空の課題（`report-task-finished` 場面の `task.id`）。 */
const FICTIONAL_ISSUE = {
  id: "t-002",
  title: "架空のタスク",
  status: "open",
  created_at: "2026-01-14T00:00:00Z",
  dependencies: [],
  description: "## 目的・背景\n\n架空の本文で、実物のタスクではない。",
  acceptance_criteria: "",
  notes: "",
} satisfies Readonly<Record<string, unknown>>

/**
 * `--scene` に対応する、画像の作業場所を要る件。同じ `scene` の件に `report-image` があればその最初の件、
 * 無ければ undefined。作業場所と演出の扱い（`skipReveal`）は、`--cwd` の有無に関わらずこの件に従う。
 */
export function imageSceneEntry(
  scene: string,
  catalog: readonly CatalogEntry[],
): CatalogEntry | undefined {
  return catalog.find(
    (entry) => entry.scene === scene && entry.workspaceSetup.kind === "report-image",
  )
}

/** `--scene` の tsukumo を起こす先。渡された `--cwd`・件専用の画像の作業場所・この作業ツリーのどれか。 */
export type LaunchPlace =
  | { readonly kind: "given"; readonly cwd: string }
  | { readonly kind: "image-workspace"; readonly entry: CatalogEntry }
  | { readonly kind: "repository" }

/** `--cwd` があればそれを優先し、無ければ場面に画像の件があればその作業場所、無ければ作業ツリー。 */
export function launchPlaceOf(
  cwd: string | undefined,
  scene: string,
  catalog: readonly CatalogEntry[],
): LaunchPlace {
  if (cwd !== undefined) {
    return { kind: "given", cwd }
  }
  const entry = imageSceneEntry(scene, catalog)
  return entry === undefined ? { kind: "repository" } : { kind: "image-workspace", entry }
}

/** `entry.workspaceSetup` に合わせて作業場所を用意し、その場所を返す。 */
export function workspaceOf(entry: CatalogEntry, outDir: string): string {
  if (entry.workspaceSetup.kind === "repository") {
    return REPOSITORY_ROOT
  }
  const workspace = path.join(outDir, "workspace", entry.name)
  if (entry.workspaceSetup.kind === "task-list") {
    mkdirSync(path.join(workspace, path.dirname(FAKE_BEADS_ISSUES_PATH)), { recursive: true })
    writeFileSync(path.join(workspace, FAKE_BEADS_ISSUES_PATH), JSON.stringify([FICTIONAL_ISSUE]))
    return workspace
  }
  mkdirSync(path.join(workspace, "report-image-fixture"), { recursive: true })
  writeFileSync(path.join(workspace, "report-image-fixture", "before.png"), fictionalPng(240, 180))
  writeFileSync(path.join(workspace, "report-image-fixture", "after.png"), fictionalPng(320, 180))
  writeFileSync(path.join(workspace, "report-image-fixture", "tall.png"), fictionalPng(180, 900))
  return workspace
}

/**
 * `entry.homeSetup` を件専用のホームへ反映する。`default` は何もしない
 * （`home` の要らない件では呼ばなくてよい）。
 */
export async function applyHomeSetup(setup: HomeSetup, homeDir: string): Promise<void> {
  if (setup.kind === "default") {
    return
  }
  if (setup.kind === "character") {
    const source = path.join(REPOSITORY_ROOT, "characters", "chou")
    const dest = path.join(tsukumoHomePath("characters", homeDir), setup.pack)
    mkdirSync(path.dirname(dest), { recursive: true })
    cpSync(source, dest, { recursive: true })
    return
  }

  const date = parseDateKey(setup.date)
  if (date === undefined) {
    throw new Error(`日記の日付が YYYY-MM-DD の実在の日でない: ${setup.date}`)
  }
  const written = await appendDiaryParagraph(
    REPOSITORY_ROOT,
    {
      date,
      writtenAtEpochMilliseconds: diaryEpochMilliseconds(setup.date),
      body: setup.body,
      expression: "proud",
      writer: { pack: "tsukumo", name: "tsukumo" },
      bookmark: {
        kind: "placed",
        // `T-` + 数字にしない（`docs/coding-standards.md`
        // 「タスク番号を書かない」。しおりの id は自由な文字列なので、
        // その形に見えない架空の名で足りる）。
        taskId: "架空-1",
        summary: "架空の要約（capture-catalog.ts が撮るためのダミー）",
        reason: "架空の理由",
      },
    },
    tsukumoHomePath("diary", homeDir),
  )
  if (!written) {
    process.stdout.write("架空の日記を書けなかった（git の共有 .git が見えないなど）\n")
  }
}

/** 架空の日記の書いた時刻（`date` のその日の昼どき。エポックミリ秒）。 */
function diaryEpochMilliseconds(date: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime({
    timeZone: Temporal.Now.timeZoneId(),
    plainTime: "14:32",
  }).epochMilliseconds
}
