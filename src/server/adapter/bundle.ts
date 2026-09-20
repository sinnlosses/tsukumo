// ブラウザ側スクリプト（`src/browser/`）と CSS を `bun build` で1本ずつにまとめ、**中身を文字列で
// 返す**。失敗したときは `bun build` が stderr に書いた理由を添えて返す（呼び出し側が起動を
// 止めるか、前の版を配り続けるかを決める）。
//
// **スクリプトと CSS は1回の `bun build` から出る対**。CSS Modules（`*.module.css`）は
// ハッシュ化した class 名を JS と CSS の両方へ焼き込むので、別々に組み立てると綴りの違う対が
// できてしまう。入口は `main.tsx` の1つだけで、CSS はそこから import で辿れるもの
// （`styles/theme.css` と各機能の `*.module.css`）が1本にまとまる。
//
// **成果物をディスクに残さない**（2026-09-12 決定）。CSS Modules を通すには `--outdir` が
// 要る（出力が2本になり、標準出力では受けられない）ので、**一時ディレクトリへ出し、読んで
// すぐ消す**。残るのはメモリ上の文字列だけで、`src/server/adapter/server.ts` はそこから配る
// ——リポジトリに成果物が残らないので、古いものを配る事故も `.gitignore` への追加も出ない。
//
// **`Bun.build()` ではなく `bun build` のプロセスを起こす**のは、`Bun.*` の固有 API に寄せない
// 規約（`docs/coding-standards.md`「Bun固有APIに寄せない」）のため。`bun` は tsukumo 自身を
// 動かしている実行環境なので、外部コマンドの依存が増えるわけではない。
//
// 型検査はここではしない（`bun build` はトランスパイルだけで型を見ない）。型は
// `bun run check` の `tsc --noEmit` が見る。

import { execFile } from "node:child_process"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { bundledFilePath } from "./bundled-path.ts"

/** ブラウザ側の入口。ここから辿れる `.tsx` と `.css` が1本ずつにまとまる。 */
const UI_ENTRY = "main.tsx"

/** 一時ディレクトリの名前の頭。`bun build --outdir` の出し先で、読んだらすぐ消す。 */
const OUT_DIR_PREFIX = "tsukumo-ui-"

/**
 * `bun build` 自身の出力（進捗の要約と、失敗したときの理由）の受け取り上限。**成果物は
 * ここを通らない**（`--outdir` に出る）ので、数十KBあれば足りる。
 */
const BUILD_OUTPUT_MAX_BYTES = 1024 * 1024

/**
 * `bun build` の理由を stderr へ流すときの上限。実測では構文エラー1件が4行・230バイトだが、
 * 壊れ方によっては全ファイル分のエラーが並ぶ。**ターミナルに出す1回分**として読める長さで切る。
 */
const FAILURE_REASON_MAX_LINES = 20
const FAILURE_REASON_MAX_CHARS = 2000

/** 組み立てた1組。**片方だけ配らない**（class 名が食い違う）。 */
export type UiBundle = {
  readonly uiScript: string
  readonly styleSheet: string
}

/**
 * 組み立ての結果。**失敗したときは必ず理由が付く**形（直和）にしてあるのは、
 * 「組み立てられなかったが理由が分からない」状態を型から消すため。
 *
 * `reason` に入るのは `bun build` の出力（リポジトリ内のパスと、そこに書いたソースの断片）。
 * **利用者と Claude の会話は通らない**ので `docs/coding-standards.md`「会話内容の扱い」の
 * 対象ではなく、ターミナルにそのまま出してよい。逆に、ここに SDK のイベントや transcript から
 * 来た値を混ぜてはならない。
 */
export type BundleResult =
  | { readonly ok: true; readonly bundle: UiBundle }
  | { readonly ok: false; readonly reason: string }

/**
 * ブラウザ側（`src/browser/`）を組み立てる。JSX は tsconfig の `"jsx": "react-jsx"` で自動変換され、
 * CSS Modules は `bun build` が class 名をハッシュ化して JS 側の対応表に入れる
 * （docs/design.md 11章）。
 */
export function buildUiBundle(): Promise<BundleResult> {
  return bundleWithBun(bundledFilePath("src", "browser", UI_ENTRY))
}

/**
 * `entry` を `bun build --target=browser` でまとめ、**スクリプトと CSS の中身を返す**。
 * 失敗（プロセスの異常終了・出力が揃わない）のときは `bun build` が書いた理由を添えて返す
 * （起動時の前提不足として扱うかどうかは呼び出し側の判断）。
 */
export async function bundleWithBun(entry: string): Promise<BundleResult> {
  const outDir = await mkdtemp(join(tmpdir(), OUT_DIR_PREFIX))
  const result = await buildInto(entry, outDir)
  // 掃除に失敗しても組み立ての結果は返す（消せなかった一時ディレクトリは OS が片付ける）。
  await rm(outDir, { recursive: true, force: true }).catch(() => undefined)
  return result
}

/** `outDir` に出させ、出てきた1組を読む。**このディレクトリの後始末は呼び出し側**。 */
async function buildInto(entry: string, outDir: string): Promise<BundleResult> {
  const failure = await runBunBuild(entry, outDir)
  return failure ?? (await readBuilt(outDir))
}

/** `bun build` を起こす。うまくいったら `undefined`、だめなら理由を持った結果を返す。 */
function runBunBuild(entry: string, outDir: string): Promise<BundleResult | undefined> {
  return new Promise((resolve) => {
    execFile(
      "bun",
      ["build", entry, "--target=browser", "--outdir", outDir],
      { maxBuffer: BUILD_OUTPUT_MAX_BYTES },
      (error, _stdout, stderr) => {
        resolve(error === null ? undefined : { ok: false, reason: failureReason(error, stderr) })
      },
    )
  })
}

/**
 * 出し先から `.js` と `.css` を1本ずつ読む。**どちらかが無ければ失敗**として返す
 * （対で配れないものを「組み上がった」と呼ばない）。
 */
async function readBuilt(outDir: string): Promise<BundleResult> {
  const fileNames = await readdir(outDir)
  const scriptName = fileNames.find((name) => name.endsWith(".js"))
  const styleName = fileNames.find((name) => name.endsWith(".css"))
  if (scriptName === undefined || styleName === undefined) {
    return { ok: false, reason: "bun build がスクリプトと CSS の対を出さなかった" }
  }

  const [uiScript, styleSheet] = await Promise.all([
    readFile(join(outDir, scriptName), "utf8"),
    readFile(join(outDir, styleName), "utf8"),
  ])
  return { ok: true, bundle: { uiScript, styleSheet } }
}

/**
 * 失敗の理由を1つの文字列にする。`bun build` の stderr が空のとき（`maxBuffer` 超過や
 * `bun` が起こせなかったときはここに何も来ない）は `execFile` の側の文面へ倒す。
 */
function failureReason(error: Error, stderr: string): string {
  const written = stderr.trim()
  return clampReason(written === "" ? error.message.trim() : written)
}

/** 長すぎる理由を上限まで切り、**切ったことを最後の行で示す**（黙って落とさない）。 */
function clampReason(reason: string): string {
  const lines = reason.split("\n")
  const kept = lines.slice(0, FAILURE_REASON_MAX_LINES).join("\n")
  const clamped =
    kept.length > FAILURE_REASON_MAX_CHARS ? kept.slice(0, FAILURE_REASON_MAX_CHARS) : kept
  return clamped === reason ? reason : `${clamped}\n…（長いので途中で切った）`
}
