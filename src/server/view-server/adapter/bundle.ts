// ブラウザ側スクリプト（`src/browser/`）と CSS を `vite build` で1本ずつにまとめる。
// 作る口と読む口を分けてある: 作るのは `pnpm run build` だけで、起動は置いてある成果物を読むだけ（`readUiBundle`）。
//
// スクリプトと CSS は1回の `vite build` から出る対。
// CSS Modules（`*.module.css`）はハッシュ化した class 名を JS と CSS の両方へ焼き込むので、別々に組み立てると綴りの違う対ができてしまう。
// 入口はブラウザ側の入口ファイル1つだけで、CSS はそこから import で辿れるもの（`styles/theme.css` と各機能の `*.module.css`）が1本にまとまる。
// スクリプトは入口の1本と、入口から `import()` で分けたチャンクに分かれる（CSS は分けない）。
//
// 成果物は `dist/browser/` に置く（`.gitignore` してあるので、各自が `pnpm run build` で作る）。
// 組み立てるとき、ソースの指紋を成果物の隣に置く。起動時にいまのソースの指紋と比べ、違えば知らせる（`readUiBundle` の `outdated`）。
// 古くても画面は動くので止めはしない。
//
// `vite build` を起こすのは `runViteBuild`。

import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { bundledFilePath } from "../../adapter/bundled-path.ts"
import { sourceFingerprint } from "./source-fingerprint.ts"
import { runViteBuild } from "./vite-build.ts"

/**
 * 出し先に置かれる対の名前。Vite の設定の `entryFileNames` と `assetFileNames` に合わせる
 * （ハッシュ付きの名前にしないので、出し直しても同じ名前で読める）。
 */
const UI_SCRIPT_FILE_NAME = "ui.js"

/** `import()` で分けたチャンクの拡張子。Vite の設定の `chunkFileNames` に合わせる。 */
const CHUNK_FILE_EXTENSION = ".js"
const STYLE_SHEET_FILE_NAME = "main.css"

/** 組み立てたときのソースの指紋を置くファイル（`.js` でないのでチャンクに数えない）。 */
const SOURCE_FINGERPRINT_FILE_NAME = "source-fingerprint.txt"

/**
 * ブラウザ側のソースの置き場。組み立ての入口であり、指紋に入る置き場の1つでもある。
 */
export const UI_SOURCE_DIR_RELATIVE_PATH: readonly string[] = ["src", "browser"]

/**
 * 成果物の指紋に入るソースの置き場で、`src/browser/` は `src/shared/` を
 * import している。
 */
const BUNDLED_SOURCE_DIR_RELATIVE_PATHS: readonly (readonly string[])[] = [
  UI_SOURCE_DIR_RELATIVE_PATH,
  ["src", "shared"],
]

/** 成果物の置き場。`.gitignore` してあるので、各自が `pnpm run build` で作る。 */
const BUILT_DIR_RELATIVE_PATH: readonly string[] = ["dist", "browser"]

/** 組み立てた1組。片方だけ配らない（class 名が食い違う）。 */
export type UiBundle = {
  readonly uiScript: string
  readonly styleSheet: string
  /** 入口から `import()` で分けたチャンク（出し先のファイル名 → 中身）。配ってよい名前はこの鍵だけ。 */
  readonly chunks: ReadonlyMap<string, string>
  /** 対の中身から決めた ETag（引用符つき）。どれか1本でも変われば変わる。 */
  readonly etag: string
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
 * 置いてある成果物を読んだ結果。読めたときは古いかどうかも一緒に返す。
 * 古さは「配れない理由」ではなく「配るけれど知らせること」なので、失敗の側には寄せない。
 */
export type StoredBundleResult =
  | { readonly ok: true; readonly bundle: UiBundle; readonly outdated: boolean }
  | { readonly ok: false; readonly reason: string }

/** 成果物の置き場（絶対パス）。起こす場所（cwd）には依存しない。 */
export function builtUiDir(): string {
  return bundledFilePath(...BUILT_DIR_RELATIVE_PATH)
}

/**
 * `builtDir` にある成果物を読む。`vite build` は起こさない（起動の経路はここだけを通る）。
 * 無ければ起動時の前提不足として扱えるよう、`pnpm run build` を促す理由を添えて失敗を返す。
 */
export async function readUiBundle(builtDir: string): Promise<StoredBundleResult> {
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
 * ブラウザ側（`src/browser/`）を組み立てて `outDir` に置き、置いたものを読んで返す。
 * JSX は `@vitejs/plugin-react` が変換し、CSS Modules は `vite build` が class 名をハッシュ化して JS 側の対応表に入れる。
 */
export async function buildUiBundle(outDir: string): Promise<BundleResult> {
  // 組み立てる前に取る。組み立て中にソースが変わっても、次の起動で古いと分かる。
  const fingerprint = await bundledSourceFingerprint()
  const result = await bundleWithVite(bundledFilePath(...UI_SOURCE_DIR_RELATIVE_PATH), outDir)
  if (result.ok && fingerprint !== undefined) {
    await writeFile(join(outDir, SOURCE_FINGERPRINT_FILE_NAME), fingerprint)
  }
  return result
}

/**
 * {@link BUNDLED_SOURCE_DIR_RELATIVE_PATHS} の下の指紋。どれか1つでも読めなければ `undefined`。
 * 見るのはそこだけで、依存（`node_modules`）や tsconfig の変化は拾わない。そこまで見るなら
 * 組み立て直すほうが早いので、気づく口として割り切っている。
 */
export async function bundledSourceFingerprint(): Promise<string | undefined> {
  const fingerprints = await Promise.all(
    BUNDLED_SOURCE_DIR_RELATIVE_PATHS.map((segments) =>
      sourceFingerprint(bundledFilePath(...segments), []),
    ),
  )
  return fingerprints.includes(undefined) ? undefined : fingerprints.join(":")
}

/**
 * `sourceDir` の入口を `vite build` で `outDir` へまとめ、出た対の中身を返す。
 * 失敗（プロセスの異常終了・出力が揃わない）のときは理由を添えて返す。
 */
async function bundleWithVite(sourceDir: string, outDir: string): Promise<BundleResult> {
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
 * 置き場から {@link UI_SCRIPT_FILE_NAME} と {@link STYLE_SHEET_FILE_NAME} を読む。どちらかが
 * 無ければ `undefined`（対で配れないものを「組み上がった」と呼ばない）。置き場そのものが
 * 無いときも同じ。入口以外の `.js` はチャンクとして名前ごと読む。
 */
async function readPair(dir: string): Promise<UiBundle | undefined> {
  const [uiScript, styleSheet, chunks] = await Promise.all([
    readFile(join(dir, UI_SCRIPT_FILE_NAME), "utf8").catch(() => undefined),
    readFile(join(dir, STYLE_SHEET_FILE_NAME), "utf8").catch(() => undefined),
    readChunks(dir),
  ])
  if (uiScript === undefined || styleSheet === undefined || chunks === undefined) {
    return undefined
  }

  return { uiScript, styleSheet, chunks, etag: bundleEtag(uiScript, styleSheet, chunks) }
}

function bundleEtag(
  uiScript: string,
  styleSheet: string,
  chunks: ReadonlyMap<string, string>,
): string {
  const hash = createHash("sha1")
  for (const part of [uiScript, styleSheet, ...[...chunks].flat()]) {
    hash.update(part).update("\0")
  }
  return `"${hash.digest("hex")}"`
}

/** 置き場の直下にある、入口以外の `.js`（名前 → 中身）。1つでも読めなければ `undefined`。 */
async function readChunks(dir: string): Promise<ReadonlyMap<string, string> | undefined> {
  const names = await readdir(dir).catch(() => undefined)
  if (names === undefined) {
    return undefined
  }

  const chunkNames = names.filter(
    (name) => name.endsWith(CHUNK_FILE_EXTENSION) && name !== UI_SCRIPT_FILE_NAME,
  )
  const contents = await Promise.all(
    chunkNames.map((name) => readFile(join(dir, name), "utf8").catch(() => undefined)),
  )
  const entries = chunkNames.flatMap((name, index) => {
    const content = contents[index]
    return content === undefined ? [] : [[name, content] as const]
  })
  return entries.length === chunkNames.length ? new Map(entries) : undefined
}

async function isOutdated(builtDir: string): Promise<boolean> {
  const [stored, current] = await Promise.all([
    readFile(join(builtDir, SOURCE_FINGERPRINT_FILE_NAME), "utf8")
      .then((text) => text.trim())
      .catch(() => undefined),
    bundledSourceFingerprint(),
  ])
  return isBundleOutdated(stored, current)
}

/**
 * 成果物が、いまのソースから組み立てたものでないか。時刻でなく中身の指紋で比べる
 * （`git checkout` で時刻だけ動いても、中身が同じなら古いと言わない）。
 *
 * 成果物に指紋が無い（組み立てが指紋を埋める前の成果物・消えた・読めない）ときは古いとする。
 * いまのソースを読めなかったときは比べられないので古いと言わない
 * （「分からない」を「古い」に寄せると、出どころの怪しい警告が毎回出て読まれなくなる）。
 */
function isBundleOutdated(
  storedFingerprint: string | undefined,
  currentFingerprint: string | undefined,
): boolean {
  if (storedFingerprint === undefined) {
    return true
  }
  return currentFingerprint !== undefined && storedFingerprint !== currentFingerprint
}
