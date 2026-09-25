// ブラウザ側スクリプト（`src/browser/`）と CSS を `bun build` で1本ずつにまとめる。**作る口と
// 読む口を分けてある**: 作るのは `bun run build`（と `bun run dev` の見張り）だけで、
// **起動は置いてある成果物を読むだけ**（{@link readUiBundle}）。
//
// **スクリプトと CSS は1回の `bun build` から出る対**。CSS Modules（`*.module.css`）は
// ハッシュ化した class 名を JS と CSS の両方へ焼き込むので、別々に組み立てると綴りの違う対が
// できてしまう。入口は `main.tsx` の1つだけで、CSS はそこから import で辿れるもの
// （`styles/theme.css` と各機能の `*.module.css`）が1本にまとまる。
//
// **成果物は `dist/browser/` に置く**。かつては「成果物をディスクに残さない」と決めていた
// （`--outdir` に一時ディレクトリを渡し、読んですぐ消す）が、**起動のたびに `bun build` を
// 起こすのをやめる**ために置く側へ変えた。当時挙げていた理由はこう引き継ぐ:
//
// - **古い成果物を配る事故** — 起動時に `src/browser/` と成果物の新しさを比べ、古ければ1行で
//   知らせる（{@link readUiBundle} の `outdated`）。**黙って配らない**のが答えで、画面は動くので
//   止めはしない
// - **`.gitignore` への追加が出ない** — 出た。`dist/` を無視する（2.6MB の生成物を、
//   `src/browser/` を直すたびに履歴へ入れない）。代わりに `bun install` のあと `bun run build` を
//   1回打つ手数が増える
//
// **`Bun.build()` ではなく `bun build` のプロセスを起こす**のは、`Bun.*` の固有 API に寄せない
// 規約（`docs/coding-standards.md`「Bun固有APIに寄せない」）のため。`bun` が要るのは
// **組み立てるときだけ**になり、起動の経路からは消えた。
//
// 型検査はここではしない（`bun build` はトランスパイルだけで型を見ない）。型は
// `bun run check` の `tsc --noEmit` が見る。

import { execFile } from "node:child_process"
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"

import { bundledFilePath } from "../../adapter/bundled-path.ts"

/** ブラウザ側の入口。ここから辿れる `.tsx` と `.css` が1本ずつにまとまる。 */
const UI_ENTRY = "main.tsx"

/**
 * ブラウザ側のソースの置き場。組み立ての入口であり、**新しさを比べる相手**でもあるので
 * ここが持つ（`src/server/view-server/adapter/ui-rebuild.ts` の見張り先も同じ1つ）。
 */
export const UI_SOURCE_DIR_RELATIVE_PATH: readonly string[] = ["src", "browser"]

/**
 * 成果物の新しさを比べる相手。**束ねに入るソースの置き場**で、`src/browser/` は `src/shared/` を
 * import している。見張り（`src/server/view-server/adapter/ui-rebuild.ts`）が `src/browser/` しか見ないのとは
 * 別の話で、あちらは**動作中に**サーバ側とブラウザ側が食い違うのを避けるため。起動時は
 * プロセスごと入れ替わるので、`src/shared/` も見てよい。
 */
const BUNDLED_SOURCE_DIR_RELATIVE_PATHS: readonly (readonly string[])[] = [
  UI_SOURCE_DIR_RELATIVE_PATH,
  ["src", "shared"],
]

/** 成果物の置き場。`.gitignore` してあるので、各自が `bun run build` で作る。 */
const BUILT_DIR_RELATIVE_PATH: readonly string[] = ["dist", "browser"]

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
 * 置いてある成果物を読んだ結果。**読めたときは古いかどうかも一緒に返す** — 古さは
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
 * 置いてある成果物を読む。**`bun build` は起こさない**（起動の経路はここだけを通る。
 * docs/design.md 11章）。無ければ起動時の前提不足として扱えるよう、`bun run build` を促す理由を
 * 添えて失敗を返す。
 */
export async function readUiBundle(): Promise<StoredBundleResult> {
  const builtDir = builtUiDir()
  const bundle = await readPair(builtDir)
  if (bundle === undefined) {
    return {
      ok: false,
      reason: `${builtDir} にスクリプトと CSS の対が無い（bun run build で作る）`,
    }
  }

  return { ok: true, bundle, outdated: await isOutdated(builtDir) }
}

/**
 * ブラウザ側（`src/browser/`）を組み立てて `dist/browser/` に置き、置いたものを読んで返す。
 * JSX は tsconfig の `"jsx": "react-jsx"` で自動変換され、CSS Modules は `bun build` が class 名を
 * ハッシュ化して JS 側の対応表に入れる（docs/design.md 11章）。
 *
 * 呼ぶのは `bun run build`（`scripts/build-ui.ts`）と `bun run dev` の見張り
 * （`src/server/view-server/adapter/ui-rebuild.ts`）の2つだけ。**見張りも同じ場所へ出す**ので、
 * 開発中に直したぶんはそのまま次の起動に乗る。
 */
export function buildUiBundle(): Promise<BundleResult> {
  return bundleWithBun(bundledFilePath(...UI_SOURCE_DIR_RELATIVE_PATH, UI_ENTRY), builtUiDir())
}

/**
 * `entry` を `bun build --target=browser` で `outDir` へまとめ、**出た対の中身を返す**。
 * 失敗（プロセスの異常終了・出力が揃わない）のときは `bun build` が書いた理由を添えて返す。
 *
 * **失敗しても `outDir` には手を触れない**ので、前に置いた成果物はそのまま残る
 * （書きかけを保存したときに、配っているものが消えない）。
 */
export async function bundleWithBun(entry: string, outDir: string): Promise<BundleResult> {
  const failure = await runBunBuild(entry, outDir)
  if (failure !== undefined) {
    return failure
  }

  const bundle = await readPair(outDir)
  return bundle === undefined
    ? { ok: false, reason: "bun build がスクリプトと CSS の対を出さなかった" }
    : { ok: true, bundle }
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
 * 置き場から `.js` と `.css` を1本ずつ読む。**どちらかが無ければ `undefined`**
 * （対で配れないものを「組み上がった」と呼ばない）。置き場そのものが無いときも同じ。
 */
async function readPair(dir: string): Promise<UiBundle | undefined> {
  const fileNames = await readdir(dir).catch(() => undefined)
  const scriptName = fileNames?.find((name) => name.endsWith(".js"))
  const styleName = fileNames?.find((name) => name.endsWith(".css"))
  if (scriptName === undefined || styleName === undefined) {
    return undefined
  }

  const [uiScript, styleSheet] = await Promise.all([
    readFile(join(dir, scriptName), "utf8"),
    readFile(join(dir, styleName), "utf8"),
  ])
  return { uiScript, styleSheet }
}

/**
 * ソースのほうが成果物より新しいか。**どちらかの時刻を見られなかったときは古いと言わない** —
 * 「分からない」を「古い」に寄せると、出どころの怪しい警告が毎回出て読まれなくなる。
 *
 * 見るのは {@link BUNDLED_SOURCE_DIR_RELATIVE_PATHS} の下だけで、依存（`node_modules`）や
 * tsconfig の変化は拾わない。そこまで見るなら組み立て直すほうが早いので、**気づく口**として
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
