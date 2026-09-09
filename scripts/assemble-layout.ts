// biim 風の4分割レイアウトを組み立てる。サイドカー本体からは呼ばれない一度きりの道具なので
// scripts/ に置く（docs/architecture.md「scripts/ は本体から呼ばれない調査用の道具置き場」）。
//
// **このスクリプトはユーザーが実際に使っている Orca のペイン／タブを操作する。**
// 実行してよいのはユーザー自身か、目視確認をしながら進めるメインセッションだけ
// （このファイルを直接実行するテストは書かない。下の assembleLayout を
// 差し替えたポートに向けて呼ぶテストだけを test/scripts/ に置く）。
//
// 使い方: bun run scripts/assemble-layout.ts http://127.0.0.1:7327
//   （URL は `bun run start <transcript>` が起動時に表示するもの）
//
// レイアウト（docs/requirements.md 4.7 が正典）:
//
//   ┌────────────────────────────────────────┬────────┐
//   │ メインビュー                            │サイドバー│
//   │  作業の進行＋レポート（HTML・広い）      │ （狭い） │
//   ├─────────────────────┬──────────────────┴────────┤
//   │ キャラビュー（半分）   │ 入力 claude TUI（半分）      │
//   └─────────────────────┴───────────────────────────┘
//
// **組み立ての手順**（`docs/requirements.md` 4.7「先に上下で割り、上段と下段をそれぞれ別々に
// 左右分割する」のとおり。`assembleLayout` の実装がそのままこの並び）:
//
//   1. 画面を上下に割る（上段＝メイン＋サイドバー、下段＝キャラ＋入力）
//   2. 上段を左右に割る（左＝メイン、右＝サイドバー）
//   3. メインビューを開く／サイドバーを開く
//   4. 下段を左右に割る（左＝キャラ、右＝入力）
//   5. キャラビューを開く
//
// **入力ペイン（右下）には何もしない。** 分割で残った領域をそのまま使うので、既存の `claude`
// セッションはこのスクリプトから一度も触らない（`--command` で新しい `claude` を起動しない）。
//
// **幅の比率は自動化していない。** `orca terminal split` に幅・比率を指定するフラグが無いため
// （実測。`docs/requirements.md` 4.7 / 5章）、領域を作るところまでを自動化し、幅の調整は
// ユーザーが1度手で行う前提にした（`README.md`「画面レイアウトの組み立て」）。
//
// **二重に組み立てることは防げない。** 分割（openPane）に「もう分割済みか」を判定する手段が
// 無いため（`orca terminal list --include-visual-layouts` で読めるはずだが、その JSON の形を
// 確かめるには実際に Orca を操作する必要があり、それはこのスクリプトの制約そのものと衝突する）、
// 自動判定は入れていない。**このスクリプトは1度だけ実行すること。**
// ビューを開く側（showView）は同じ URL なら開き直すだけなので、そちらは何度呼んでも安全。

import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Host, type HostResult } from "../src/host.ts"
import { createOrcaHost } from "../src/orca-host.ts"
import { viewPath } from "../src/view.ts"

export type LayoutStep = {
  readonly description: string
  readonly result: HostResult
}

/**
 * レイアウトを組み立てる1回分。**手順（何番目に何を頼むか）を固定するのがこの関数の役目**で、
 * 実際にホストへ頼むのは引数の `host` （テストでは差し替えたポートを渡す。本番は
 * `createOrcaHost()`）。失敗した手順があっても後続を止めない
 * （`docs/coding-standards.md`「エラーハンドリング」— 常駐処理ではないが、1箇所の失敗で
 * 残りの領域まで諦める理由が無い）。呼び出し側（下の CLI 実行部）が結果をまとめて表示する。
 */
export async function assembleLayout(host: Host, baseUrl: string): Promise<readonly LayoutStep[]> {
  const steps: LayoutStep[] = []
  const run = async (description: string, action: () => Promise<HostResult>): Promise<void> => {
    steps.push({ description, result: await action() })
  }

  await run("画面を上下に割る", () => host.openPane({ placement: "below", command: undefined }))
  await run("上段を左右に割る（メイン / サイドバー）", () =>
    host.openPane({ placement: "beside", command: undefined }),
  )
  await run("メインビューを開く", () => host.showView(viewUrl(baseUrl, "main")))
  await run("サイドバーを開く", () => host.showView(viewUrl(baseUrl, "sidebar")))
  await run("下段を左右に割る（キャラ / 入力）", () =>
    host.openPane({ placement: "beside", command: undefined }),
  )
  await run("キャラビューを開く", () => host.showView(viewUrl(baseUrl, "character")))

  return steps
}

function viewUrl(baseUrl: string, view: "main" | "sidebar" | "character"): string {
  return new URL(viewPath(view), baseUrl).toString()
}

// CLI として直接実行されたときだけ本番のホストを叩く。import されただけ（テストから）では
// 何も実行しない（`Bun.*` に寄せず、Node 標準の方法でエントリポイントかどうかを見分ける）。
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)
if (isMainModule) {
  await main()
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2]
  if (baseUrl === undefined) {
    process.stderr.write("使い方: bun run scripts/assemble-layout.ts <サイドカーが表示したURL>\n")
    process.exit(2)
    return
  }

  const steps = await assembleLayout(createOrcaHost(), baseUrl)
  for (const step of steps) {
    const line = step.result.ok
      ? `OK: ${step.description}`
      : `失敗: ${step.description} — ${step.result.reason}`
    process.stdout.write(`${line}\n`)
  }

  process.stdout.write(
    "\n幅はまだ整っていません。境目をドラッグして、メイン/サイドバー・キャラ/入力の比率を調整してください。\n",
  )
}
