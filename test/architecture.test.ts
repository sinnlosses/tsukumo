import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 層をディレクトリで表す（docs/design.md 2章「層と依存の向き」）。ここは正規表現と node:fs だけで、
// 許した辺以外の import を落とす。外部ツールは増やさない。
//
// **3層（shared / server / browser）で、サーバ側は判断（`server/core/`）と境界
// （`server/adapter/`）の2段**。配線は `src/` 直下のファイル（`cli.ts` / `main.ts` と、
// そこから呼ばれる起動の段取り）。
// `adapter ──▶ core ──▶ shared ◀── browser` で、**`core → adapter` は禁止**
// （docs/research/architecture-proposal.md 3章「許す依存の辺」。段2で切った）。

type Layer = "shared" | "core" | "adapter" | "browser" | "cli"

// 各層が import してよい先（docs/coding-standards.md「層と依存の向き」の表そのもの）。
const ALLOWED_IMPORTS: Readonly<Record<Layer, ReadonlySet<Layer>>> = {
  shared: new Set(["shared"]),
  core: new Set(["shared", "core"]),
  adapter: new Set(["shared", "core", "adapter"]),
  browser: new Set(["shared", "browser"]),
  cli: new Set(["shared", "core", "adapter", "browser", "cli"]),
}

// `core` を「純粋な判断」に保つための禁止（3章「許す依存の辺」）。外の世界に触るものは
// すべて `adapter/` にあり、`core` はそれを import できないので、ここを塞ぐと
// **`core` から外の世界へ出る道が閉じる**。
const OUTSIDE_WORLD_IMPORT = /from\s+["'](node:|@anthropic-ai\/|ws")/

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url)).replace(/\/$/, "")

type Violation = {
  readonly fromPath: string
  readonly fromLayer: Layer
  readonly toPath: string
  readonly toLayer: Layer
}

describe("層と依存の向き", () => {
  it("src/ の相対 import は、許した辺（shared/core/adapter/browser + cli）だけで構成されている", () => {
    const files = listSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findViolations(relPath))

    expect(violationsMessage(violations)).toBe("")
  })

  it("shared と core は node: / SDK / ws に触らない。shared は document/window/localStorage にも", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => {
        const layer = layerOf(relPath)
        return layer === "shared" || layer === "core"
      })
      .filter((relPath) => {
        const code = nonCommentContent(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
        return (
          OUTSIDE_WORLD_IMPORT.test(code) ||
          (layerOf(relPath) === "shared" && /\b(document|window|localStorage)\b/.test(code))
        )
      })

    expect(offenders).toEqual([])
  })
})

// `orca` コマンドを起こすのはアダプタ1つに閉じ込める（docs/architecture.md 原則3、
// src/server/adapter/orca-host.ts 冒頭コメント）。`execFile("orca", …)` のような呼び出しは必ず
// コマンド名の文字列リテラル "orca" を伴うので、それを orca-host.ts の外から探す。
// ファイル名（`orca-host.ts`）やバッククォートで囲んだ日本語の説明文はクォートされた文字列
// リテラルではないので拾わない。
describe("orca コマンドを起こす箇所", () => {
  it("`orca` コマンドを呼ぶのは src/server/adapter/orca-host.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "server/adapter/orca-host.ts")
      .filter((relPath) => /["']orca["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")))

    expect(offenders).toEqual([])
  })
})

// ここから、層の辺だけでは表せない限定の検査（`adapter` の中のどのファイルか、まで絞る）。

// SDK（`@anthropic-ai/claude-agent-sdk`）を起こすのは駆動のファイル1つに閉じ込める
// （docs/architecture.md 原則3、src/server/adapter/sdk-driver.ts 冒頭コメント）。import 文の
// クォートされた specifier だけを拾うので、バッククォートで囲んだ日本語の説明文は拾わない
// （orca の検査と同じやり方）。
describe("Agent SDK を import する箇所", () => {
  it("`@anthropic-ai/claude-agent-sdk` を import するのは src/server/adapter/sdk-driver.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "server/adapter/sdk-driver.ts")
      .filter((relPath) =>
        /from\s+["']@anthropic-ai\/claude-agent-sdk["']/.test(
          readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
        ),
      )

    expect(offenders).toEqual([])
  })
})

// `node:child_process` を起こすのはホスト（orca）・ビルド（bun build）・git 管理下のファイルの
// 列挙（git ls-files）の3つの境界に閉じ込める（docs/architecture.md 原則3）。
describe("子プロセスを起こす箇所", () => {
  it("`node:child_process` を import するのは src/server/adapter/ の orca-host.ts・bundle.ts・repository-file.ts だけ", () => {
    const allowed = new Set([
      "server/adapter/orca-host.ts",
      "server/adapter/bundle.ts",
      "server/adapter/repository-file.ts",
    ])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        /from\s+["']node:child_process["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
      )

    expect(offenders).toEqual([])
  })
})

// 環境変数の読み取りは配線層の1ファイルに集める（docs/coding-standards.md「外の世界に依存する値
// は読み取りを1モジュールに集約する」）。コメント中の `` `process.env` `` のような説明文は
// 拾わない（実コードの行だけを見る）。
//
// **例外は `TSUKUMO_HOME` を読む `tsukumo-home.ts` の1つだけ** — ホームを使うのは adapter の
// 既定引数の中で、配線層から渡す道が無い（そのファイルの冒頭）。ここを2つに限ることで、
// 3つめが黙って増えない。
describe("process.env を読む箇所", () => {
  it("`process.env` を読むのは src/cli.ts と src/server/adapter/tsukumo-home.ts だけ", () => {
    const allowed = new Set(["cli.ts", "server/adapter/tsukumo-home.ts"])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        /\bprocess\.env\b/.test(nonCommentContent(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))),
      )

    expect(offenders).toEqual([])
  })
})

// 経路名のリテラルは shared にだけ書く。両側（core と browser）が見る値は import で共有し、
// 文字列リテラルとして再掲しない（`src/shared/session-socket.ts` が代表例）。
describe("経路名のリテラル", () => {
  it('"/ws" "/character/" "/vendor/" を文字列リテラルで書くのは shared/ だけ', () => {
    const pathLiteralPatterns = [/["']\/ws["']/, /["']\/character\/["']/, /["']\/vendor\/["']/]
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !relPath.startsWith("shared/"))
      .filter((relPath) => {
        const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
        return pathLiteralPatterns.some((pattern) => pattern.test(content))
      })

    expect(offenders).toEqual([])
  })
})

// コメントに特定の日付を書かない（`docs/coding-standards.md`「コメント」の表。「いつ決まったか・
// 誰が言ったか（特定の日付・「〜の指摘」「ユーザーの決定」）」は禁止で、理由（Why / Why not）は
// 残す。日付つきの記録は `docs/architecture.md` と `docs/history/` が持つ）。`oxlint` と同じ
// `src` `test` `scripts` の3つを見る（`package.json` の `lint`。`docs/` `develop/` は対象外——
// ドキュメントは日付つきの記録を持つのが正しい）。
//
// **行頭が `//` `*` `/*` のコメント行だけ**を対象にする。行の途中にある `//` は文字列リテラルの
// 中の `//` と区別できないので拾わない——`test/` のフィクスチャに出てくる `date` フィールドの
// ようなテストデータの日付は、行頭がコメントでないのでこれで自然に除外される。
const COMMENT_LINE_START = /^\s*(\/\/|\*|\/\*)/
const SPECIFIC_DATE = /\d{4}-\d{2}-\d{2}/

describe("コメント中の日付", () => {
  it("src / test / scripts の *.ts / *.tsx で、コメント行が特定の日付（YYYY-MM-DD）を含まない", () => {
    const offenders = ["src", "test", "scripts"].flatMap((dirName) => {
      const root = fileURLToPath(new URL(`../${dirName}`, import.meta.url)).replace(/\/$/, "")
      return listSourceFiles(root).flatMap((relPath) => {
        const lines = readFileSync(`${root}/${relPath}`, "utf8").split("\n")
        return lines.flatMap((line, index) =>
          COMMENT_LINE_START.test(line) && SPECIFIC_DATE.test(line)
            ? [`${dirName}/${relPath}:${index + 1}`]
            : [],
        )
      })
    })

    expect(offenders.join("\n")).toBe("")
  })
})

// `browser/features/` の中の横断 import を制限する（`docs/design.md` 2章「領域の機能と、置かれる機能」）。
// 機能は2種類あり、**辺は「領域 → 置かれる機能」の1方向だけ**を許す。
//
// - **領域の機能**（`BROWSER_REGIONS`）: 画面の領域か、領域に差し替わる画面を持つ。
//   `main.tsx` が置き場所を決める。**互いに import しない**
// - **置かれる機能**（`BROWSER_PLACED_FEATURES`）: 自分の置き場所を持たず、領域の中に
//   置いてもらう。**どの機能も import しない（葉）**ので、領域から引いても輪にならない
//
// `browser/components/` `browser/lib/` `browser/stores/` `browser/styles/` と `browser/main.tsx`
// （`browser/features/` の直下に無いもの）は誰から引いてもよい共有部分なので、ここでは見ない。
// **`browser/features/` の直下にどちらの一覧にも無いディレクトリがあれば `throw` する**
// （足し忘れが「検査の対象外」として黙って通るのを防ぐ。`browserBoxOf` と同じ作り）。
//
// **`markdown/` は `main-view` の中**（`browser/features/main-view/markdown/`）なので、機能の
// 一部として扱われる（state を持たない Markdown の描画プリミティブで、読むのは `main-view` だけ）。
const BROWSER_REGIONS = [
  "layout",
  "screen-nav",
  "main-view",
  "character-view",
  "character-screen",
  "chat-view",
  "token-usage",
  "sidebar",
  "dispatch",
] as const
const BROWSER_PLACED_FEATURES = ["task-board"] as const

type BrowserFeature = {
  readonly name: string
  readonly kind: "region" | "placed"
}

type BrowserFeatureViolation = {
  readonly fromPath: string
  readonly fromFeature: BrowserFeature
  readonly toPath: string
  readonly toFeature: BrowserFeature
}

describe("browser/ の機能どうしの import", () => {
  it("browser/features/<機能>/ どうしの import は「領域 → 置かれる機能」だけ", () => {
    const files = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.startsWith("browser/"))
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findBrowserFeatureViolations(relPath))

    expect(browserFeatureViolationsMessage(violations)).toBe("")
  })
})

// `src/browser/` の箱をまたぐ縦の辺（`docs/design.md` 2章「`src/browser/` の箱と、置く基準」の表そのもの）。
// 上の `BROWSER_REGIONS` / `BROWSER_PLACED_FEATURES` の検査は `features/` の中の横の辺（機能どうし）を見るのに対し、こちらは
// `main.tsx` / `features/` / `components/` / `hooks/` / `domain/` / `lib/` / `utils/` / `stores/` という
// 箱をまたぐ辺を見る
// （`shared` への辺は層の検査 `ALLOWED_IMPORTS` がすでに見ているので、ここでは対象にしない）。
//
// `browser/hooks/` は**機能の語彙を持たない React のフック**の箱で、`components/` と同じ扱い
// （誰から引いてもよく、自分は `lib/` までしか引かない）。機能に固有のフックは機能の中の
// `features/<機能>/hooks/` に置くので、こちらの箱には入らない。
//
// `browser/` 直下の `*.d.ts`（箱に属さない ambient 宣言。`css-variable.d.ts` / `css-module.d.ts`）と
// `browser/styles/`（グローバルな CSS だけで `.ts`/`.tsx` を持たない）はどの箱にも属さないので、
// import 元・import 先のどちらでも無視する。未知のディレクトリが `browser/` 直下に増えたときに
// テストの直し忘れで素通りしないよう、`main.tsx` でも `*.d.ts`/`styles` でもない未知の区画は
// `layerOf` と同じく `throw` する。
// `browser/domain/` は**画面全体の語彙**（tsukumo の語彙を名乗り、2つ以上の機能が読むもの）の箱で、
// `lib/`（ライブラリを包む道具）とは「ファイル名が tsukumo の語彙を名乗るか」で分かれる。
const BROWSER_BOXES = [
  "main",
  "features",
  "components",
  "hooks",
  "domain",
  "lib",
  "utils",
  "stores",
] as const
type BrowserBox = (typeof BROWSER_BOXES)[number]

// 各箱が import してよい先（docs/design.md 2章の表そのもの。`main` は「すべて」なので全箱を許す）。
// `utils/` は誰からも引けて、自分は `utils/` の中しか引かない（外部パッケージ・`shared` も
// 引かないことは、この表では見えないので下の「browser/utils/ の import」が見る）。
const ALLOWED_BROWSER_BOX_IMPORTS: Readonly<Record<BrowserBox, ReadonlySet<BrowserBox>>> = {
  main: new Set(["main", "features", "components", "hooks", "domain", "lib", "utils", "stores"]),
  features: new Set(["features", "components", "hooks", "domain", "lib", "utils", "stores"]),
  components: new Set(["components", "hooks", "lib", "utils"]),
  hooks: new Set(["hooks", "lib", "utils"]),
  domain: new Set(["domain", "lib", "utils"]),
  lib: new Set(["lib", "utils"]),
  utils: new Set(["utils"]),
  stores: new Set(["stores", "lib", "utils"]),
}

type BrowserBoxViolation = {
  readonly fromPath: string
  readonly fromBox: BrowserBox
  readonly toPath: string
  readonly toBox: BrowserBox
}

describe("browser/ の箱をまたぐ import", () => {
  it("src/browser/ の箱どうしの import は、docs/design.md 2章の表にある辺だけで構成されている", () => {
    const files = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.startsWith("browser/"))
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findBrowserBoxViolations(relPath))

    expect(browserBoxViolationsMessage(violations)).toBe("")
  })
})

// `utils/` の歯止め1（docs/design.md 2章「`lib/` と `utils/` に置く基準」）。箱の辺の検査は相対 import
// の `browser/` の中しか見ないので、外部パッケージ（`remeda`・`react`）・`node:`・`shared/` への
// import はここで別に落とす。**`utils/` から出る import は、`utils/` の中への相対 import だけ**。
describe("browser/utils/ の import", () => {
  it("browser/utils/ のファイルは browser/utils/ の中しか import しない", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("browser/utils/"))
      .flatMap((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
          .filter((specifier) => !isInsideBrowserUtils(relPath, specifier))
          .map((specifier) => `src/${relPath} → ${specifier}`),
      )

    expect(offenders.join("\n")).toBe("")
  })
})

// 機能をまたぐ箱に、**1つの機能しか読まないファイル**が残っていないことを見る
// （`docs/design.md` 2章「上げる引き金は2つ目の読み手が出たとき」。引き金は逆にも引き、
// 読み手が1つに戻ったものはその機能の中へ下ろす）。
//
// **読み手が機能の外だけのものは対象外**（`lib/socket.ts` と `lib/refresh.ts` は `stores/` が
// 読む。下ろす先の機能が無いので、ここに残るのが正しい）。`stores/` をまだ見ていないのは、
// `stores/brush-tip.ts` の読み手が `main-view` の1つだけで、メインビューの演出のファイル群を
// まとめるときに一緒に下ろすため。
const SHARED_BROWSER_BOXES = ["lib", "domain"] as const

describe("browser/ の機能をまたぐ箱", () => {
  it("browser/lib/ と browser/domain/ に、1つの機能だけが読むファイルは無い", () => {
    const files = listSourceFiles(SRC_ROOT).filter((relPath) =>
      SHARED_BROWSER_BOXES.some((box) => relPath.startsWith(`browser/${box}/`)),
    )
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.flatMap((relPath) => {
      const readers = browserReadersOf(relPath)
      return readers.features.length === 1 && readers.outsideFeatureCount === 0
        ? [`src/${relPath}（読むのは ${readers.features.join("")} だけ）`]
        : []
    })

    expect(offenders.join("\n")).toBe("")
  })
})

/**
 * `browser/` のファイル1件を import している機能の名前（重複を畳んだもの）と、機能の外
 * （`main.tsx` / `stores/` / `lib/` など）からの読み手の数。
 */
function browserReadersOf(targetRelPath: string): {
  readonly features: readonly string[]
  readonly outsideFeatureCount: number
} {
  const readers = listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath.startsWith("browser/") && relPath !== targetRelPath)
    .filter((relPath) =>
      relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
        (specifier) => resolveRelativeImport(relPath, specifier) === targetRelPath,
      ),
    )

  return {
    features: [...new Set(readers.flatMap((relPath) => browserFeatureOf(relPath)?.name ?? []))],
    outsideFeatureCount: readers.filter((relPath) => browserFeatureOf(relPath) === undefined)
      .length,
  }
}

/** ファイル1件の相対 import から、許した箱の辺に無いものだけを違反として返す。 */
function findBrowserBoxViolations(relPath: string): readonly BrowserBoxViolation[] {
  const fromBox = browserBoxOf(relPath)
  if (fromBox === undefined) {
    return []
  }

  const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
  const allowed = ALLOWED_BROWSER_BOX_IMPORTS[fromBox]
  return relativeImportSpecifiers(content).flatMap((specifier) => {
    const toPath = resolveRelativeImport(relPath, specifier)
    const toBox = browserBoxOf(toPath)
    return toBox === undefined || allowed.has(toBox)
      ? []
      : [{ fromPath: relPath, fromBox, toPath, toBox }]
  })
}

/**
 * `browser/` 相対パスから箱を決める。箱に属さない `browser/css-variable.d.ts` と `browser/styles/`（CSS のみ）は
 * `undefined`（import 元・import 先のどちらでも無視する）。`browser/` の外は対象外なので `undefined`。
 */
function browserBoxOf(relPath: string): BrowserBox | undefined {
  if (!relPath.startsWith("browser/")) {
    return undefined
  }
  if (relPath === "browser/main.tsx") {
    return "main"
  }
  if (relPath.endsWith(".d.ts") && relPath.split("/").length === 2) {
    return undefined
  }
  const [, second] = relPath.split("/")
  if (
    second === "features" ||
    second === "components" ||
    second === "hooks" ||
    second === "domain" ||
    second === "lib" ||
    second === "utils" ||
    second === "stores"
  ) {
    return second
  }
  if (second === "styles") {
    return undefined
  }
  throw new Error(
    `src/${relPath} の browser 箱を判定できない（新しい箱なら BROWSER_BOXES と ALLOWED_BROWSER_BOX_IMPORTS を足す）`,
  )
}

function browserBoxViolationsMessage(violations: readonly BrowserBoxViolation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromBox}） → src/${v.toPath}（${v.toBox}）`)
    .join("\n")
}

/** ファイル1件の相対 import から、許した辺（領域 → 置かれる機能）に無いものを違反として返す。 */
function findBrowserFeatureViolations(relPath: string): readonly BrowserFeatureViolation[] {
  const fromFeature = browserFeatureOf(relPath)
  if (fromFeature === undefined) {
    return []
  }

  const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
  return relativeImportSpecifiers(content).flatMap((specifier) => {
    const toPath = resolveRelativeImport(relPath, specifier)
    const toFeature = browserFeatureOf(toPath)
    if (toFeature === undefined || toFeature.name === fromFeature.name) {
      return []
    }
    // 許すのは「領域 → 置かれる機能」だけ。領域どうしも、置かれる機能から出る辺も落とす。
    const allowed = fromFeature.kind === "region" && toFeature.kind === "placed"
    return allowed ? [] : [{ fromPath: relPath, fromFeature, toPath, toFeature }]
  })
}

/**
 * `browser/features/<機能>/...` の形なら機能を返す。共有部分（`browser/lib/` など）は undefined。
 * どちらの一覧にも無いディレクトリは `throw`（新しい機能を足したら、どちらの種類かを決める）。
 */
function browserFeatureOf(relPath: string): BrowserFeature | undefined {
  const [top, second, third] = relPath.split("/")
  if (top !== "browser" || second !== "features" || third === undefined) {
    return undefined
  }
  if (BROWSER_REGIONS.some((region) => region === third)) {
    return { name: third, kind: "region" }
  }
  if (BROWSER_PLACED_FEATURES.some((feature) => feature === third)) {
    return { name: third, kind: "placed" }
  }
  throw new Error(
    `src/${relPath} の機能の種類を判定できない（BROWSER_REGIONS か BROWSER_PLACED_FEATURES に足す）`,
  )
}

function browserFeatureViolationsMessage(violations: readonly BrowserFeatureViolation[]): string {
  return violations
    .map(
      (v) =>
        `src/${v.fromPath}（${v.fromFeature.name}／${v.fromFeature.kind}） → src/${v.toPath}（${v.toFeature.name}／${v.toFeature.kind}）`,
    )
    .join("\n")
}

/**
 * 単行コメント（`// ...`）だけの行を落とした中身を返す。`process.env` や `document` の説明を
 * バッククォートで書いたコメント（例: `` // `process.env` を読むのはここ1箇所 ``）を実コードの
 * 出現と取り違えないための下ごしらえ（このリポジトリの `.ts`/`.tsx` にブロックコメントは
 * 出てこない前提。JSDoc の `* ` 始まりの行にこの語が出てこないことは書いた時点で確認した）。
 */
function nonCommentContent(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
}

/** `src/` 配下の `.ts` / `.tsx` を再帰的に集める。相対パス（`shared/character.ts`）で返す。 */
function listSourceFiles(root: string, dir = root): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(root, fullPath)
    }
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [fullPath.slice(root.length + 1)] : []
  })
}

/** ファイル1件の相対 import をすべて調べ、許した辺に無いものを違反として返す。 */
function findViolations(relPath: string): readonly Violation[] {
  const fromLayer = layerOf(relPath)
  const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
  const allowed = ALLOWED_IMPORTS[fromLayer]

  return relativeImportSpecifiers(content).flatMap((specifier) => {
    const toPath = resolveRelativeImport(relPath, specifier)
    const toLayer = layerOf(toPath)
    return allowed.has(toLayer) ? [] : [{ fromPath: relPath, fromLayer, toPath, toLayer }]
  })
}

/** `from "./x.ts"` / `from "../y.ts"` の形（import・re-export の両方）をすべて拾う。 */
function relativeImportSpecifiers(content: string): readonly string[] {
  const matches = content.matchAll(/from\s+["'](\.[^"']+)["']/g)
  return [...matches].flatMap(([, specifier]) => specifier ?? [])
}

/** `from "..."` と副作用だけの `import "..."` の specifier を、相対かどうかを問わずすべて拾う。 */
function importSpecifiers(content: string): readonly string[] {
  const matches = content.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)
  return [...matches].flatMap(([, specifier]) => specifier ?? [])
}

/** specifier が相対で、解いた先が `browser/utils/` の中か。 */
function isInsideBrowserUtils(fromRelPath: string, specifier: string): boolean {
  return (
    specifier.startsWith(".") &&
    resolveRelativeImport(fromRelPath, specifier).startsWith("browser/utils/")
  )
}

/** import 元の相対パスと specifier から、import 先の `src/` 相対パスを解く。 */
function resolveRelativeImport(fromRelPath: string, specifier: string): string {
  const fromDirSegments = fromRelPath.split("/").slice(0, -1)
  const segments = [...fromDirSegments, ...specifier.split("/")]

  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === "." || segment === "") {
      continue
    }
    if (segment === "..") {
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  return resolved.join("/")
}

/**
 * `src/` 相対パスから層を決める。**`src/` 直下のファイルは配線層**（`cli.ts` と `main.ts`、
 * そこから呼ばれる起動の段取り。`core` と `adapter` を結べるのはここだけ）、`shared/` と
 * `browser/` は先頭ディレクトリ、サーバ側は2段（`server/core/` と `server/adapter/`）で決まる。
 * `server/` の直下に置いたファイルは判断か境界かを名乗っていないので `throw` する。
 */
function layerOf(relPath: string): Layer {
  if (!relPath.includes("/")) {
    return "cli"
  }
  const [top, second] = relPath.split("/")
  if (top === "shared" || top === "browser") {
    return top
  }
  if (top === "server" && (second === "core" || second === "adapter")) {
    return second
  }
  throw new Error(`src/${relPath} の層を判定できない（層のディレクトリの外にある）`)
}

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
