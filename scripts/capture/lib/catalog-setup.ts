// カタログの件を撮る前の下ごしらえ。作業場所と件専用のホームに架空の中身を置く。

import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { appendDiaryParagraph } from "../../../src/server/diary/adapter/diary.ts"
import { fictionalPng } from "../../shared/fictional-png.ts"
import { REPOSITORY_ROOT } from "../../shared/repository-root.ts"
import type { CatalogEntry, HomeSetup } from "./catalog-entry.ts"

/** `entry.workspaceSetup` に合わせて作業場所を用意し、その場所を返す。 */
export function workspaceOf(entry: CatalogEntry, outDir: string): string {
  if (entry.workspaceSetup.kind === "repository") {
    return REPOSITORY_ROOT
  }
  const workspace = path.join(outDir, "workspace", entry.name)
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
    const dest = path.join(homeDir, "characters", setup.pack)
    mkdirSync(path.dirname(dest), { recursive: true })
    cpSync(source, dest, { recursive: true })
    return
  }

  const written = await appendDiaryParagraph(
    REPOSITORY_ROOT,
    {
      date: setup.date,
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
    homeDir,
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
