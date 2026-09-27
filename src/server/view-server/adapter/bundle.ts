// ブラウザ側スクリプト（`src/browser/`）と CSS を `vite build` で1本ずつにまとめる。作る口と
// 読む口を分けてある: 作るのは `pnpm run build` だけで、
// 起動は置いてある成果物を読むだけ（`readUiBundle`）。
//
// スクリプトと CSS は1回の `vite build` から出る対。CSS Modules（`*.module.css`）は
// ハッシュ化した class 名を JS と CSS の両方へ焼き込むので、別々に組み立てると綴りの違う対が
// できてしまう。入口はブラウザ側の入口ファイル1つだけで、CSS はそこから import で辿れるもの
// （`styles/theme.css` と各機能の `*.module.css`）が1本にまとまる。
//
// 成果物は `dist/browser/` に置く（`.gitignore` してあるので、各自が `pnpm run build` で作る）。
// 起動時に `src/browser/` と成果物の新しさを比べ、古ければ知らせる（`readUiBundle` の `outdated`）。
// 古くても画面は動くので止めはしない。
//
// `vite` は JS API ではなく CLI を `node` の子プロセスで起こす。
// 組み立ての JS API は同じプロセスの `process.env.NODE_ENV` を `production` に書き換えるので、
// 常駐するサーバの中では呼ばない。
// 設定はリポジトリ直下の Vite の設定ファイルで、入口の置き場と出し先はここが引数で渡す。
//
// 型検査はここではしない（`vite build` はトランスパイルだけで型を見ない）。型は
// `bun run check` の `tsc --noEmit` が見る。

import { execFile } from "node:child_process"
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"

import { bundledFilePath } from "../../adapter/bundled-path.ts"

/** Vite の設定ファイル。入口のファイル名と、出す2つのファイル名はここに書いてある。 */
export const VITE_CONFIG_RELATIVE_PATH: readonly string[] = ["vite.config.ts"]

/** `vite` の CLI の実体（`node_modules/.bin/vite` が指す先）。 */
const VITE_CLI_RELATIVE_PATH: readonly string[] = ["node_modules", "vite", "bin", "vite.js"]

/**
 * 出し先に置かれる対の名前。Vite の設定の `entryFileNames` と `assetFileNames` に合わせる
 * （ハッシュ付きの名前にしないので、出し直しても同じ名前で読める）。
 */
const UI_SCRIPT_FILE_NAME = "main.js"
const STYLE_SHEET_FILE_NAME = "main.css"

/**
 * ブラウザ側のソースの置き場。組み立ての入口であり、新しさを比べる相手でもあるので
 * ここが持つ（開発サーバの root も同じ1つ）。
 */
export const UI_SOURCE_DIR_RELATIVE_PATH: readonly string[] = ["src", "browser"]

/**
 * 成果物の新しさを比べる相手。束ねに入るソースの置き場で、`src/browser/` は `src/shared/` を
 * import している。
 */
const BUNDLED_SOURCE_DIR_RELATIVE_PATHS: readonly (readonly string[])[] = [
  UI_SOURCE_DIR_RELATIVE_PATH,
  ["src", "shared"],
]

/** 成果物の置き場。`.gitignore` してあるので、各自が `pnpm run build` で作る。 */
const BUILT_DIR_RELATIVE_PATH: readonly string[] = ["dist", "browser"]

/**
 * `vite build` 自身の出力（警告と、失敗したときの理由）の受け取り上限。成果物は
 * ここを通らない（`--outDir` に出る）ので、数十KBあれば足りる。
 */
const BUILD_OUTPUT_MAX_BYTES = 1024 * 1024

/**
 * `vite build` の理由を stderr へ流すときの上限。実測では構文エラー1件がスタックを除いて10行ほどだが、
 * 壊れ方によっては全ファイル分のエラーが並ぶ。ターミナルに出す1回分として読める長さで切る。
 */
const FAILURE_REASON_MAX_LINES = 20
const FAILURE_REASON_MAX_CHARS = 2000

/** 組み立てた1組。片方だけ配らない（class 名が食い違う）。 */
export type UiBundle = {
  readonly uiScript: string
  readonly styleSheet: string
}

/**
 * 組み立ての結果。失敗したときは必ず理由が付く形（直和）にしてあるのは、
 * 「組み立てられなかったが理由が分からない」状態を型から消すため。
 *
 * `reason` に入るのは `vite build` の出力（リポジトリ内のパスと、そこに書いたソースの断片）。
 * 利用者と Claude の会話は通らないので `docs/coding-standards.md`「会話内容の扱い」の
 * 対象ではなく、ターミナルにそのまま出してよい。逆に、ここに SDK のイベントや transcript から
 * 来た値を混ぜてはならない。
 */
export type BundleResult =
  | { readonly ok: true; readonly bundle: UiBundle }
  | { readonly ok: false; readonly reason: string }

/**
 * 置いてある成果物を読んだ結果。読めたときは古いかどうかも一緒に返す — 古さは
 * 「配れない理由」ではなく「配るけれど知らせること」なので、失敗の側には寄せない。
 */
export type StoredBundleResult =
  | { readonly ok: true; readonly bundle: UiBundle; readonly outdated: boolean }
  | { readonly ok: false; readonly reason: string }

/** 成果物の置き場（絶対パス）。起こす場所（cwd）には依存しない。 */
export function builtUiDir(): string {
  return bundledFilePath(...BUILT_DIR_RELATIVE_PATH)
}

/**
 * 置いてある成果物を読む。`vite build` は起こさない（起動の経路はここだけを通る。
 * `docs/design.md`「ビルドと依存」）。無ければ起動時の前提不足として扱えるよう、`pnpm run build` を促す理由を
 * 添えて失敗を返す。
 */
export async function readUiBundle(): Promise<StoredBundleResult> {
  const builtDir = builtUiDir()
  const bundle = await readPair(builtDir)
  if (bundle === undefined) {
    return {
      ok: false,
      reason: `${builtDir} にスクリプトと CSS の対が無い（pnpm run build で作る）`,
    }
  }

  return { ok: true, bundle, outdated: await isOutdated(builtDir) }
}

/**
 * ブラウザ側（`src/browser/`）を組み立てて `dist/browser/` に置き、置いたものを読んで返す。
 * JSX は `@vitejs/plugin-react` が変換し、CSS Modules は `vite build` が class 名を
 * ハッシュ化して JS 側の対応表に入れる（`docs/design.md`「ビルドと依存」）。
 */
export function buildUiBundle(): Promise<BundleResult> {
  return bundleWithVite(bundledFilePath(...UI_SOURCE_DIR_RELATIVE_PATH), builtUiDir())
}

/**
 * `sourceDir` の入口（Vite の設定の `input`）を `vite build` で `outDir` へまとめ、
 * 出た対の中身を返す。失敗（プロセスの異常終了・出力が揃わない）のときは `vite build` が
 * 書いた理由を添えて返す。
 *
 * 失敗しても `outDir` には手を触れないので、前に置いた成果物はそのまま残る
 * （書きかけを保存したときに、配っているものが消えない）。
 * `vite build` が出し先を空にするのは、組み立てが通って書き出す直前だけ。
 */
export async function bundleWithVite(sourceDir: string, outDir: string): Promise<BundleResult> {
  const failure = await runViteBuild(sourceDir, outDir)
  if (failure !== undefined) {
    return failure
  }

  const bundle = await readPair(outDir)
  return bundle === undefined
    ? { ok: false, reason: "vite build がスクリプトと CSS の対を出さなかった" }
    : { ok: true, bundle }
}

/**
 * `vite build` を起こす。うまくいったら `undefined`、だめなら理由を持った結果を返す。
 * `node` で起こすのは、`bun test` から呼ばれたときも起動と同じランタイムで組み立てるため。
 */
function runViteBuild(sourceDir: string, outDir: string): Promise<BundleResult | undefined> {
  return new Promise((resolve) => {
    execFile(
      "node",
      [
        bundledFilePath(...VITE_CLI_RELATIVE_PATH),
        "build",
        sourceDir,
        "--config",
        bundledFilePath(...VITE_CONFIG_RELATIVE_PATH),
        "--outDir",
        outDir,
      ],
      { maxBuffer: BUILD_OUTPUT_MAX_BYTES },
      (error, _stdout, stderr) => {
        resolve(error === null ? undefined : { ok: false, reason: failureReason(error, stderr) })
      },
    )
  })
}

/**
 * 置き場から {@link UI_SCRIPT_FILE_NAME} と {@link STYLE_SHEET_FILE_NAME} を読む。どちらかが
 * 無ければ `undefined`（対で配れないものを「組み上がった」と呼ばない）。置き場そのものが
 * 無いときも同じ。
 */
async function readPair(dir: string): Promise<UiBundle | undefined> {
  const [uiScript, styleSheet] = await Promise.all([
    readFile(join(dir, UI_SCRIPT_FILE_NAME), "utf8").catch(() => undefined),
    readFile(join(dir, STYLE_SHEET_FILE_NAME), "utf8").catch(() => undefined),
  ])
  if (uiScript === undefined || styleSheet === undefined) {
    return undefined
  }

  return { uiScript, styleSheet }
}

/**
 * ソースのほうが成果物より新しいか。どちらかの時刻を見られなかったときは古いと言わない —
 * 「分からない」を「古い」に寄せると、出どころの怪しい警告が毎回出て読まれなくなる。
 *
 * 見るのは {@link BUNDLED_SOURCE_DIR_RELATIVE_PATHS} の下だけで、依存（`node_modules`）や
 * tsconfig の変化は拾わない。そこまで見るなら組み立て直すほうが早いので、気づく口として
 * 割り切っている。
 */
async function isOutdated(builtDir: string): Promise<boolean> {
  const [builtAt, ...sourceTimes] = await Promise.all([
    newestModifiedAt(builtDir),
    ...BUNDLED_SOURCE_DIR_RELATIVE_PATHS.map((segments) =>
      newestModifiedAt(bundledFilePath(...segments)),
    ),
  ])
  const known = sourceTimes.filter((time) => time !== undefined)
  return builtAt !== undefined && known.some((time) => time > builtAt)
}

/** `dir` の下（再帰）でいちばん新しい更新時刻。読めなければ `undefined`。 */
async function newestModifiedAt(dir: string): Promise<number | undefined> {
  const names = await readdir(dir, { recursive: true }).catch(() => undefined)
  if (names === undefined) {
    return undefined
  }

  const times = await Promise.all(names.map((name) => modifiedAt(join(dir, name))))
  const known = times.filter((time) => time !== undefined)
  return known.length === 0 ? undefined : Math.max(...known)
}

/** 1件の更新時刻。消えた直後などで読めなければ `undefined`（そこだけ飛ばす）。 */
function modifiedAt(path: string): Promise<number | undefined> {
  return stat(path)
    .then((stats) => stats.mtimeMs)
    .catch(() => undefined)
}

/**
 * 失敗の理由を1つの文字列にする。`vite build` の stderr が空のとき（`maxBuffer` 超過や
 * `node` が起こせなかったときはここに何も来ない）は `execFile` の側の文面へ倒す。
 *
 * `vite build` は端末でなくても色の制御文字を書き、理由のあとに vite 自身のスタックを
 * 続けるので、どちらも落とす（行頭が空白と `at ` の行）。
 */
function failureReason(error: Error, stderr: string): string {
  const written = stripVTControlCharacters(stderr)
    .split("\n")
    .filter((line) => !/^\s+at /.test(line))
    .join("\n")
    .trim()
  return clampReason(written === "" ? error.message.trim() : written)
}

/** 長すぎる理由を上限まで切り、切ったことを最後の行で示す（黙って落とさない）。 */
function clampReason(reason: string): string {
  const lines = reason.split("\n")
  const kept = lines.slice(0, FAILURE_REASON_MAX_LINES).join("\n")
  const clamped =
    kept.length > FAILURE_REASON_MAX_CHARS ? kept.slice(0, FAILURE_REASON_MAX_CHARS) : kept
  return clamped === reason ? reason : `${clamped}\n…（長いので途中で切った）`
}
