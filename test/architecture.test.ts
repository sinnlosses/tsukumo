import { describe, expect, it } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 層をディレクトリで表す（docs/design.md 2章「層と依存の向き」）。ここは正規表現と node:fs だけで、
// 許した辺以外の import を落とす。外部ツールは増やさない。
//
// **3層（shared / server / browser）で、サーバ側は機能ごとに判断（`server/<機能>/core/`）と
// 境界（`server/<機能>/adapter/`）の2段、どの機能にも属さない共有の箱は `server/core/`
// `server/adapter/` の直下**（docs/design.md 2章「サーバの機能と、機能どうしの辺」）。配線は
// `src/` 直下のファイル（`cli.ts` / `main.ts` と、そこから呼ばれる起動の段取り）。
// `adapter ──▶ core ──▶ shared ◀── browser` で、**`core → adapter` は禁止**（機能をまたいでも
// 同じに効く）。機能どうしの辺は `SERVER_FEATURE_IMPORTS` にある組だけで、層ごとに循環させない。

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

// サーバの機能（docs/design.md 2章「サーバの機能と、機能どうしの辺」の1つめの表）。**機能を足す
// ときは、ここと `SERVER_FEATURE_IMPORTS` に足す**（一覧に無いディレクトリを `server/` の下に
// 作ると `layerOf` が throw する）。まだ移していないファイルは共有の箱（`server/core/`
// `server/adapter/` の直下）に居るまま動く。
const SERVER_FEATURES = [
  "report",
  "system-prompt",
  "context-usage",
  "token-usage",
  "usage-review",
  "host",
  "repository",
  "achievement",
  "character-pack",
  "diary",
  "chat",
  "visit",
  "session-driver",
  "session",
  "view-server",
] as const
type ServerFeature = (typeof SERVER_FEATURES)[number]

// 機能 A が import してよい機能 B（同じ節の2つめの表そのもの。表に無い組は落とす）。共有の箱は
// どの機能からも読んでよいので、ここには出てこない。
const SERVER_FEATURE_IMPORTS: Readonly<Record<ServerFeature, ReadonlySet<ServerFeature>>> = {
  report: new Set([]),
  "system-prompt": new Set(["report", "chat", "session-driver"]),
  "context-usage": new Set(["session-driver"]),
  "token-usage": new Set([]),
  "usage-review": new Set([]),
  host: new Set([]),
  repository: new Set([]),
  achievement: new Set(["repository"]),
  "character-pack": new Set([]),
  diary: new Set(["character-pack", "repository", "session-driver"]),
  chat: new Set(["character-pack", "session-driver"]),
  visit: new Set([]),
  "session-driver": new Set(["chat", "report", "usage-review", "view-server"]),
  session: new Set([
    "session-driver",
    "chat",
    "visit",
    "diary",
    "token-usage",
    "context-usage",
    "character-pack",
  ]),
  "view-server": new Set(["session", "achievement"]),
}

type ServerLayer = "core" | "adapter"

/** `server/` の下のファイルの置き場。共有の箱か、機能の層か。 */
type ServerPlace =
  | { readonly kind: "shared"; readonly layer: ServerLayer }
  | { readonly kind: "feature"; readonly feature: ServerFeature; readonly layer: ServerLayer }

/** 機能 A から別の機能 B への import 1本（同じ機能の中の辺は含めない）。 */
type ServerFeatureEdge = {
  readonly fromPath: string
  readonly fromFeature: ServerFeature
  readonly fromLayer: ServerLayer
  readonly toPath: string
  readonly toFeature: ServerFeature
  readonly toLayer: ServerLayer
}

describe("server/ の機能どうしの import", () => {
  it("機能どうしの import は SERVER_FEATURE_IMPORTS にある組だけ", () => {
    const offenders = serverFeatureEdges()
      .filter((edge) => !SERVER_FEATURE_IMPORTS[edge.fromFeature].has(edge.toFeature))
      .map(
        (edge) =>
          `src/${edge.fromPath}（${edge.fromFeature}） → src/${edge.toPath}（${edge.toFeature}）`,
      )

    expect(offenders.join("\n")).toBe("")
  })

  it("機能の core/ どうし・adapter/ どうしの辺は、それぞれ循環しない", () => {
    const cycles = (["core", "adapter"] as const).flatMap((layer) => {
      const cycle = findFeatureCycle(featureGraphOf(serverFeatureEdges(), layer))
      return cycle.length === 0 ? [] : [`${layer}: ${cycle.join(" → ")}`]
    })

    expect(cycles.join("\n")).toBe("")
  })

  // 上の2つが黙って空振りしないことの確かめ（検査の道具そのものの振る舞い）。
  it("層の判定は、知らない機能・機能の中で core/ adapter/ の外・server/ の直下で throw する", () => {
    expect(layerOf("server/report/core/report-tool.ts")).toBe("core")
    expect(layerOf("server/core/config.ts")).toBe("core")
    expect(layerOf("server/adapter/lib/json-file.ts")).toBe("adapter")
    expect(() => layerOf("server/unknown-feature/core/x.ts")).toThrow()
    expect(() => layerOf("server/report/x.ts")).toThrow()
    expect(() => layerOf("server/report/lib/x.ts")).toThrow()
    expect(() => layerOf("server/x.ts")).toThrow()
  })

  it("循環の検出は、機能どうしの輪を見つける", () => {
    const graph = new Map<ServerFeature, ReadonlySet<ServerFeature>>([
      ["report", new Set(["system-prompt"])],
      ["system-prompt", new Set(["report"])],
    ])

    expect(findFeatureCycle(graph)).toEqual(["report", "system-prompt", "report"])
    expect(
      findFeatureCycle(
        new Map<ServerFeature, ReadonlySet<ServerFeature>>([
          ["system-prompt", new Set(["report"])],
        ]),
      ),
    ).toEqual([])
  })
})

// 移行が終わり、`server/core/` `server/adapter/` の直下（`lib/` を含む）に残るのは、どの機能にも
// 属さない共有の箱の6ファイルだけになった（docs/design.md 2章「サーバの機能と、機能どうしの辺」）。
// 共有の箱は「どの機能の語彙も名乗らず、読み手が2つ以上ある」ものだけを置く場所なので、
// 機能を読んではいけない（読むなら、その機能の中か機能どうしの辺の表で表す）し、読み手が
// 1つの機能だけに絞られたら、その機能の中へ下ろすのが正しい（`browser/domain/` の検査と同じ形）。
describe("server/ の共有の箱", () => {
  it("共有の箱（server/core/・server/adapter/ の直下）は機能のディレクトリを import しない", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter(
        (relPath) => relPath.startsWith("server/") && serverPlaceOf(relPath).kind === "shared",
      )
      .flatMap((relPath) =>
        relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).flatMap(
          (specifier) => {
            const toPath = resolveRelativeImport(relPath, specifier)
            if (!toPath.startsWith("server/")) {
              return []
            }
            return serverPlaceOf(toPath).kind === "feature"
              ? [`src/${relPath} → src/${toPath}`]
              : []
          },
        ),
      )

    expect(offenders.join("\n")).toBe("")
  })

  it("共有の箱に、1つの機能だけが読むファイルは無い", () => {
    const files = listSourceFiles(SRC_ROOT).filter(
      (relPath) => relPath.startsWith("server/") && serverPlaceOf(relPath).kind === "shared",
    )
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.flatMap((relPath) => {
      const readers = serverSharedBoxReadersOf(relPath)
      return readers.features.length === 1 && readers.outsideFeatureCount === 0
        ? [`src/${relPath}（読むのは ${readers.features.join("")} だけ）`]
        : []
    })

    expect(offenders.join("\n")).toBe("")
  })
})

// `orca` コマンドを起こすのはアダプタ1つに閉じ込める（docs/architecture.md 原則3、
// src/server/host/adapter/orca-host.ts 冒頭コメント）。`execFile("orca", …)` のような呼び出しは必ず
// コマンド名の文字列リテラル "orca" を伴うので、それを orca-host.ts の外から探す。
// ファイル名（`orca-host.ts`）やバッククォートで囲んだ日本語の説明文はクォートされた文字列
// リテラルではないので拾わない。
describe("orca コマンドを起こす箇所", () => {
  it("`orca` コマンドを呼ぶのは src/server/host/adapter/orca-host.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "server/host/adapter/orca-host.ts")
      .filter((relPath) => /["']orca["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")))

    expect(offenders).toEqual([])
  })
})

// ここから、層の辺だけでは表せない限定の検査（`adapter` の中のどのファイルか、まで絞る）。

// SDK（`@anthropic-ai/claude-agent-sdk`）を import するのは機能の `adapter/` 直下
// （`server/<機能>/adapter/`）の `sdk-` で始まるファイルに閉じ込める（docs/architecture.md 原則3）。
// SDK は1つの境界だが1ファイルには収まらないので、**許す先を一覧ではなく名前で決める** —
// 足すファイルは名前で SDK の境界を名乗ることになり、名乗らずに import すればここで落ちる。
// import 文のクォートされた specifier だけを拾うので、バッククォートで囲んだ日本語の説明文は
// 拾わない（orca の検査と同じやり方）。
const SDK_BOUNDARY_FILE = /^server\/[^/]+\/adapter\/sdk-[^/]+\.ts$/

describe("Agent SDK を import する箇所", () => {
  it("`@anthropic-ai/claude-agent-sdk` を import するのは機能の adapter/ 直下の sdk- で始まるファイルだけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !SDK_BOUNDARY_FILE.test(relPath))
      .filter((relPath) =>
        /from\s+["']@anthropic-ai\/claude-agent-sdk["']/.test(
          readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
        ),
      )

    expect(offenders).toEqual([])
  })
})

// 手続き（oRPC）の依存の辺（docs/design.md 2章「コマンドの受け手と手続きの置き方」の「許す依存の
// 辺」）。受け手を付ける `@orpc/server` は外の世界に触る側（機能の `adapter/` と配線）だけが読み、
// `core` と共有の箱からは読まない。契約だけを書く `@orpc/contract` は `shared` が読んでよい
// （ブラウザも読むので、`@orpc/server` と `node:` は読まない）。
const ORPC_SERVER_FILE = /^(?:server\/[^/]+\/adapter\/.+|[^/]+)\.ts$/

// `shared` が読んでよい外部パッケージ（相対でない specifier）。`remeda` は手続きより前から読んでいる。
const SHARED_EXTERNAL_PACKAGES: ReadonlySet<string> = new Set(["zod", "@orpc/contract", "remeda"])

// `shared` の下に置いてよいディレクトリ（直下のファイルのほかに）。`contract/` は機能ごとの契約の
// 置き場、`lib/` と `utils/` は docs/design.md 2章「`lib/` と `utils/` に置く基準」。
const SHARED_DIRECTORIES: ReadonlySet<string> = new Set(["contract", "lib", "utils"])

describe("手続き（oRPC）を import する箇所", () => {
  it("`@orpc/server` を import するのは機能の adapter/ と配線（src/ 直下）だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !ORPC_SERVER_FILE.test(relPath))
      .filter((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
          (specifier) => specifier === "@orpc/server" || specifier.startsWith("@orpc/server/"),
        ),
      )

    expect(offenders).toEqual([])
  })

  it("shared が読む外部パッケージは zod・@orpc/contract・remeda だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => layerOf(relPath) === "shared")
      .flatMap((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
          .filter((specifier) => !specifier.startsWith("."))
          .filter((specifier) => !SHARED_EXTERNAL_PACKAGES.has(specifier))
          .map((specifier) => `src/${relPath} → ${specifier}`),
      )

    expect(offenders).toEqual([])
  })

  it("shared の下のディレクトリは contract/・lib/・utils/ だけ", () => {
    const directories = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("shared/") && relPath.split("/").length > 2)
      .map((relPath) => relPath.split("/")[1] ?? "")

    expect([...new Set(directories)].filter((name) => !SHARED_DIRECTORIES.has(name))).toEqual([])
  })
})

// `node:child_process` を起こすのはホスト（orca）・ビルド（bun build）・`git` を起こす1つの口
// （`main` の上のタスク一覧・成果の集計・git 管理下のファイルの列挙のどれもがここを使う）の
// 3つの境界に閉じ込める（docs/architecture.md 原則3）。
describe("子プロセスを起こす箇所", () => {
  it("`node:child_process` を import するのは orca-host.ts・bundle.ts・git.ts だけ", () => {
    const allowed = new Set([
      "server/host/adapter/orca-host.ts",
      "server/view-server/adapter/bundle.ts",
      "server/repository/adapter/git.ts",
    ])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        /from\s+["']node:child_process["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
      )

    expect(offenders).toEqual([])
  })
})

// 環境変数の読み取りは配線層の1ファイルに集める（docs/coding-standards.md「外部の入力を読む
// 場所を1つにする」）。コメント中の `` `process.env` `` のような説明文は
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

// 「いま」を読む場所を2つに保つ。E2E は時計をこの2箇所で凍らせる（サーバは
// `TSUKUMO_FIXED_CLOCK`、ブラウザは E2E の側で `clock.ts` が呼ぶ関数を差し替える）ので、ほかで
// 読まれると固定が黙って効かなくなる（docs/design.md 10章「E2E の成果物と再現」）。
describe("Temporal.Now を読む箇所", () => {
  it("`Temporal.Now` を読むのは src/server/adapter/local-time.ts と src/browser/utils/clock.ts だけ", () => {
    const allowed = new Set(["server/adapter/local-time.ts", "browser/utils/clock.ts"])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        /\bTemporal\.Now\b/.test(nonCommentContent(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))),
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

// 画面を組み立てる部品のまとまりどうしの import を制限する（`docs/design.md` 2章「領域の機能と、置かれる機能」）。
// まとまりは3種類あり、**辺は「枠・画面 → 置かれる機能」と「画面 → 枠」だけ**を許す。
//
// - **枠**（`BROWSER_FRAMES`）: 全画面で共有する枠（`components/domain/<枠>/`）。差し込み口は
//   props で受け、画面を知らない。**枠どうしは import しない**
// - **画面**（`BROWSER_SCREENS`）: 1つの画面 = 1つのページ（`components/page/<画面>/`）。`main.tsx` が
//   出す画面を選ぶ。**画面どうしは import しない**。会話の画面は `<Layout>` と `<Sidebar>` を
//   置くので、画面から枠へは引いてよい
// - **置かれる機能**（`BROWSER_PLACED_FEATURES`）: 自分の置き場所を持たず、枠か画面の中に
//   置いてもらう。**どのまとまりも import しない（葉）**ので、枠・画面から引いても輪にならない
//
// **一覧は `browser/` からの相対パスで引く**（枠と画面は `components/domain/<枠>/` と
// `components/page/<画面>/` に分かれているので、名前だけでは引けない）。
//
// `browser/components/`（`page/` `domain/` `ui/` の3段。一覧のパスに無いディレクトリ）・
// `browser/lib/` `browser/stores/` `browser/styles/` と `browser/main.tsx` は誰から引いてもよい
// 共有部分なので、ここでは見ない。**一覧に無いディレクトリが `features/` の直下・
// `components/domain/` の直下（サブディレクトリがあるとき）・`components/page/` の下に
// あれば `throw` する**（足し忘れが「検査の対象外」として黙って通るのを防ぐ。`browserBoxOf` と
// 同じ作り）。
//
// **会話の画面の4つの領域（`main-view` など）は `conversation/components/` の下の部品**なので、
// 画面 `components/page/conversation` の一部として扱われる。
const BROWSER_FRAMES = [
  "components/domain/layout",
  "components/domain/screen-nav",
  "components/domain/sidebar",
] as const
const BROWSER_SCREENS = [
  "components/page/conversation",
  "components/page/character",
  "components/page/token-usage",
  "components/page/achievement",
] as const
const BROWSER_PLACED_FEATURES = ["features/task-board"] as const

type BrowserFeatureKind = "frame" | "screen" | "placed"

type BrowserFeature = {
  /** `browser/` からの相対パス（`BROWSER_FRAMES` / `BROWSER_SCREENS` / `BROWSER_PLACED_FEATURES` の1件）。 */
  readonly name: string
  readonly kind: BrowserFeatureKind
}

/** まとまりの種類ごとに、import してよい先の種類（2章「領域の機能と、置かれる機能」）。 */
const ALLOWED_BROWSER_FEATURE_IMPORTS: Readonly<
  Record<BrowserFeatureKind, ReadonlySet<BrowserFeatureKind>>
> = {
  frame: new Set(["placed"]),
  screen: new Set(["frame", "placed"]),
  placed: new Set(),
}

type BrowserFeatureViolation = {
  readonly fromPath: string
  readonly fromFeature: BrowserFeature
  readonly toPath: string
  readonly toFeature: BrowserFeature
}

describe("browser/ の機能どうしの import", () => {
  it("枠・画面・置かれる機能どうしの import は「枠・画面 → 置かれる機能」と「画面 → 枠」だけ", () => {
    const files = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.startsWith("browser/"))
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findBrowserFeatureViolations(relPath))

    expect(browserFeatureViolationsMessage(violations)).toBe("")
  })
})

// `src/browser/` の箱をまたぐ縦の辺（`docs/design.md` 2章「`src/browser/` の箱と、置く基準」の表そのもの）。
// 上の `BROWSER_FRAMES` / `BROWSER_SCREENS` / `BROWSER_PLACED_FEATURES` の検査はまとまりどうしの横の辺を見るのに対し、こちらは
// `main.tsx` / `features/` / `components/page/` / `components/domain/` / `components/ui/` /
// `hooks/` / `domain/` / `lib/` / `utils/` / `stores/` という箱をまたぐ辺を見る
// （`shared` への辺は層の検査 `ALLOWED_IMPORTS` がすでに見ているので、ここでは対象にしない）。
//
// `browser/hooks/` は**機能の語彙を持たない React のフック**の箱で、`components/ui/` と同じ扱い
// （誰から引いてもよく、自分は `lib/` までしか引かない）。機能に固有のフックは機能の中の
// `features/<機能>/hooks/` に置くので、こちらの箱には入らない。
//
// `browser/` 直下の `*.d.ts`（箱に属さない ambient 宣言。`css-variable.d.ts` / `css-module.d.ts`）と
// `browser/styles/`（グローバルな CSS だけで `.ts`/`.tsx` を持たない）はどの箱にも属さないので、
// import 元・import 先のどちらでも無視する。未知のディレクトリが `browser/` 直下や
// `browser/components/` 直下に増えたときにテストの直し忘れで素通りしないよう、`main.tsx` でも
// `*.d.ts`/`styles` でもない未知の区画は `layerOf` と同じく `throw` する。
// `browser/domain/` は**画面全体の語彙**（tsukumo の語彙を名乗り、2つ以上の機能が読むもの）の箱で、
// `lib/`（ライブラリを包む道具）とは「ファイル名が tsukumo の語彙を名乗るか」で分かれる。
const BROWSER_BOXES = [
  "main",
  "features",
  "components/page",
  "components/domain",
  "components/ui",
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
  main: new Set([
    "main",
    "features",
    "components/page",
    "components/domain",
    "components/ui",
    "hooks",
    "domain",
    "lib",
    "utils",
    "stores",
  ]),
  "components/page": new Set([
    "components/page",
    "components/domain",
    "components/ui",
    "features",
    "hooks",
    "domain",
    "lib",
    "utils",
    "stores",
  ]),
  "components/domain": new Set([
    "components/domain",
    "components/ui",
    "features",
    "hooks",
    "domain",
    "lib",
    "utils",
    "stores",
  ]),
  features: new Set(["features", "components/ui", "hooks", "domain", "lib", "utils", "stores"]),
  "components/ui": new Set(["components/ui", "hooks", "lib", "utils"]),
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
// （`docs/design.md` 2章「上げる引き金は「2つ目の読み手が出たとき」」。引き金は逆にも引き、
// 読み手が1つに戻ったものはその機能の中へ下ろす）。**`components/domain/` の直下と
// `components/ui/` にも同じ基準を掛ける**（2章「引き金は逆にも引く」）。
//
// **読み手が機能の外だけのものは対象外**（`lib/socket.ts` と `lib/refresh.ts` は `stores/` が
// 読む。下ろす先の機能が無いので、ここに残るのが正しい）。**`stores/` はまだ対象にしていない**
// ——`stores/location-hash.ts`（`screen-nav` だけ）と `stores/main-view-turn.ts`
// （`main-view` だけ）の読み手が1機能で、状態を機能の中へ下ろしてよいかは置き場の基準とは
// 別の判断が要るため。
//
// `components/domain/` は**直下のファイルだけ**を対象にする（サブディレクトリは全画面で共有する
// 枠（領域）で、1つの領域だけが読むのが正しい形。2章「`components/domain` の直下のファイルは
// 領域ではなく共有の部品」）。`components/ui/` は部品ごとのディレクトリ（`ui/select/` など）に
// 分かれているが、その中は「共有の部品1つぶん」なので、そのまま全体を対象にする。
const SHARED_BROWSER_BOXES = ["lib", "domain"] as const

describe("browser/ の機能をまたぐ箱", () => {
  it("browser/lib/・browser/domain/・components/domain/ 直下・components/ui/ に、1つの機能だけが読むファイルは無い", () => {
    const files = listSourceFiles(SRC_ROOT).filter(
      (relPath) =>
        SHARED_BROWSER_BOXES.some((box) => relPath.startsWith(`browser/${box}/`)) ||
        isDirectBrowserComponentsDomainFile(relPath) ||
        relPath.startsWith("browser/components/ui/"),
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

// `components/ui/` の置き方（2章「1部品1フォルダは真似しない」の例外）を検査で守る。
// **直下にファイルを置かない**（部品ごとのディレクトリの中に置く）、**`ui/<部品>/` には必ず
// `<部品>.tsx` がある**（ディレクトリ名がそのまま部品のファイル名になる）の2つ。barrel file
// （`index.tsx`）で束ねていないかは、ここが `<部品>.tsx` の存在を見ることで同時に落ちる
// （`index.tsx` しか無いディレクトリは `<部品>.tsx` が無いので違反になる）。
describe("components/ui/ の置き方", () => {
  it("components/ui/ 直下にファイルは無く、ui/<部品>/ には <部品>.tsx がある", () => {
    const files = listSourceFiles(SRC_ROOT).filter((relPath) =>
      relPath.startsWith("browser/components/ui/"),
    )
    expect(files.length).toBeGreaterThan(0)

    const directFiles = files.filter((relPath) => relPath.split("/").length === 4)
    const directories = [
      ...new Set(
        files
          .filter((relPath) => relPath.split("/").length >= 5)
          .map((relPath) => relPath.split("/")[3]),
      ),
    ]
    const directoriesMissingComponent = directories.filter(
      (name) => !files.includes(`browser/components/ui/${name}/${name}.tsx`),
    )

    const offenders = [
      ...directFiles.map((relPath) => `src/${relPath}（components/ui/ の直下に置かれている）`),
      ...directoriesMissingComponent.map(
        (name) => `browser/components/ui/${name}/ に ${name}.tsx が無い`,
      ),
    ]

    expect(offenders.join("\n")).toBe("")
  })
})

// ページの形（`docs/design.md` 2章「ページの形」）。`components/page/<ページ>/` の直下は
// container / presenter の対（`<ページ>.tsx` / `presentational-<ページ>.tsx`）・`<ページ>.module.css`・
// `domain/` `hooks/` `components/` だけ。部品（`components/<部品>/`）も同じ作り（`<部品>.tsx` /
// `presentational-<部品>.tsx` / `<部品>.module.css` / `hooks/` `domain/` `components/`）で、ほかに
// 概念のディレクトリを名前の一覧（`PAGE_CONCEPT_DIRECTORIES`。いまは `markdown` だけ）で許す。
// **部品の `components/`（＝子部品）はさらに `components/` を持てない**（ネストは1段だけ）。
// `components/` の直下はディレクトリだけで、`hooks/` は部品の形（`<名前>.tsx` など）を求めない
// 固定の置き場として例外にする。
const PAGE_CONCEPT_DIRECTORIES: ReadonlySet<string> = new Set(["markdown"])

type PageNodeRule = {
  /** このディレクトリ自身が `components/` を持ってよいか。 */
  readonly allowsComponents: boolean
  /** `components/` を持つとき、その子（部品）がさらに自分の `components/`（＝子部品）を
   * 持ってよいか（ページ直下の `components/` の子＝部品だけ持てる）。 */
  readonly allowsGrandchildComponents: boolean
  /** 概念のディレクトリ（`markdown/` など）を許すか（ページの直下では許さない）。 */
  readonly allowsConcept: boolean
}

const PAGE_ROOT_RULE: PageNodeRule = {
  allowsComponents: true,
  allowsGrandchildComponents: true,
  allowsConcept: false,
}

describe("components/page/ の形", () => {
  it("ページ・部品の直下は、名前から作る対・CSS・domain/・hooks/・components/（と部品の概念のディレクトリ）だけ", () => {
    const offenders = BROWSER_SCREENS.flatMap((screen) =>
      pageNodeViolations(`browser/${screen}`, screen.split("/").pop() ?? "", PAGE_ROOT_RULE),
    )

    expect(offenders.join("\n")).toBe("")
  })

  it("部品のディレクトリの外から import してよいのは <部品>.tsx だけ（main.tsx とテストは除く）", () => {
    const offenders = componentBoundaryViolations()

    expect(offenders.join("\n")).toBe("")
  })
})

/** ページ・部品1件の直下を検査する（`docs/design.md` 2章「ページの形」）。 */
function pageNodeViolations(
  relPath: string,
  dirName: string,
  rule: PageNodeRule,
): readonly string[] {
  const allowedFiles = new Set([
    `${dirName}.tsx`,
    `presentational-${dirName}.tsx`,
    `${dirName}.module.css`,
  ])

  return readdirSync(`${SRC_ROOT}/${relPath}`, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) {
      return allowedFiles.has(entry.name)
        ? []
        : [`src/${relPath}/${entry.name}（規約の外のファイル）`]
    }
    if (entry.name === "domain" || entry.name === "hooks") {
      return []
    }
    if (rule.allowsConcept && PAGE_CONCEPT_DIRECTORIES.has(entry.name)) {
      return []
    }
    if (entry.name === "components") {
      if (!rule.allowsComponents) {
        return [`src/${relPath}/components（子部品は components/ を持てない）`]
      }
      return componentsDirViolations(`${relPath}/components`, rule.allowsGrandchildComponents)
    }
    return [`src/${relPath}/${entry.name}（規約の外のディレクトリ）`]
  })
}

/** `components/` の直下（ページ・部品どちらの下でも同じ形）を検査する。直下はディレクトリだけで、
 * `hooks/` は固定の置き場、それ以外は部品として `pageNodeViolations` へ再帰する。 */
function componentsDirViolations(
  relPath: string,
  allowsChildComponents: boolean,
): readonly string[] {
  return readdirSync(`${SRC_ROOT}/${relPath}`, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) {
      return [`src/${relPath}/${entry.name}（components/ の直下はディレクトリだけ）`]
    }
    if (entry.name === "hooks") {
      return []
    }
    return pageNodeViolations(`${relPath}/${entry.name}`, entry.name, {
      allowsComponents: allowsChildComponents,
      allowsGrandchildComponents: false,
      allowsConcept: true,
    })
  })
}

/** ページの下の部品ディレクトリ（`components/` の直下で `hooks/` を除いたもの）の一覧。
 * ネストした子部品も含めて再帰的に集める。 */
function pageComponentDirectories(): readonly string[] {
  return BROWSER_SCREENS.flatMap((screen) => componentDirectoriesUnder(`browser/${screen}`))
}

function componentDirectoriesUnder(relPath: string): readonly string[] {
  return readdirSync(`${SRC_ROOT}/${relPath}`, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) {
      return []
    }
    const childRelPath = `${relPath}/${entry.name}`
    if (entry.name !== "components") {
      return componentDirectoriesUnder(childRelPath)
    }
    return readdirSync(`${SRC_ROOT}/${childRelPath}`, { withFileTypes: true }).flatMap(
      (componentEntry) => {
        if (!componentEntry.isDirectory() || componentEntry.name === "hooks") {
          return []
        }
        const componentRelPath = `${childRelPath}/${componentEntry.name}`
        return [componentRelPath, ...componentDirectoriesUnder(componentRelPath)]
      },
    )
  })
}

/** 部品のディレクトリの外から、中の `<部品>.tsx` 以外を import している箇所（`main.tsx` は除く）。 */
function componentBoundaryViolations(): readonly string[] {
  const files = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.startsWith("browser/"))
  const edges = files.flatMap((relPath) =>
    relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).map((specifier) => ({
      fromPath: relPath,
      toPath: resolveRelativeImport(relPath, specifier),
    })),
  )

  return pageComponentDirectories().flatMap((componentRelPath) => {
    const dirName = componentRelPath.split("/").pop() ?? ""
    const entryFile = `${componentRelPath}/${dirName}.tsx`
    return edges
      .filter(
        (edge) =>
          edge.toPath.startsWith(`${componentRelPath}/`) &&
          edge.toPath !== entryFile &&
          edge.fromPath !== "browser/main.tsx" &&
          !edge.fromPath.startsWith(`${componentRelPath}/`),
      )
      .map((edge) => `src/${edge.fromPath} → src/${edge.toPath}（${componentRelPath} の外から）`)
  })
}

// `components/ui/` の variant 部品（`Select` 以外）に渡す `className` の作法を検査で守る
// （`docs/design.md` 2章「`components/ui/` の部品（variant の作法と一覧）」の「呼び出し側からの
// 上書き（className）」節「検査で守る」）。(1) 呼び出し側が渡す `className` の式が
// `styles["…"]` の字面（と `??`・テンプレート文字列での組み合わせ）だけでできていること、
// (2) その class の CSS 規則（呼び出し側の `*.module.css` で、選択子の最後の複合にその class を
// 含むもの。`::` の疑似要素は別の持ち物として数え、対象にしない）の property が、部品の CSS で
// `:where()` の外に書いた property と重ならないことを見る。
//
// **対象は動的に決める**（`readonly className: string` を持つ `components/ui/` の部品。`Select` は
// 作法の例外として名指しで外す）。自分の CSS を持たない薄い部品（`VStack` / `HStack`）は、
// レンダーする先の部品（`Stack`）の CSS を辿って「持ち物」を決める——渡した class がそのまま
// 同じ DOM ノードに乗るため。

const CLASSNAME_PROP_PATTERN = /readonly className: string/
const UI_COMPONENT_FILE_PATTERN = /^browser\/components\/ui\/([^/]+)\/\1\.tsx$/

/** `styles["…"]` / `styles['…']` の字面だけを拾う。 */
const STYLES_LITERAL_PATTERN = /styles\[(?:"([\w-]+)"|'([\w-]+)')\]/g

/**
 * `className` の式が「`styles["…"]` の字面と、`??`・テンプレート文字列での組み合わせ」だけで
 * できているか。値を足すのは使う箇所が出たときだけにし、ここもいまの用途（字面1つ・`??` での
 * 既定値・テンプレート文字列での連結）だけを許す。三項演算子の条件のように任意の式が混じる形は、
 * 使う箇所が出たら合わせて広げる。
 */
function isAllowedClassNameExpression(expr: string): boolean {
  const withoutLiterals = expr.replace(STYLES_LITERAL_PATTERN, "")
  return /^[\s`$(){}?:."']*$/.test(withoutLiterals.replace(/\?\?/g, ""))
}

/** 式の中の `styles["…"]` が引く class 名をすべて拾う（重複を畳む）。 */
function classNamesInExpression(expr: string): readonly string[] {
  return [
    ...new Set(
      [...expr.matchAll(STYLES_LITERAL_PATTERN)].flatMap(
        ([, a, b]) => (a ?? b ?? []) as string | [],
      ),
    ),
  ]
}

/** `import styles from "…"` の specifier を、この `.tsx` からの `src/` 相対パスに解く。
 * `styles` という名前で import していない（別名や無い）ファイルは `undefined`。 */
function stylesImportPath(content: string, fromRelPath: string): string | undefined {
  const match = /import\s+styles\s+from\s+["'](\.[^"']+)["']/.exec(content)
  return match?.[1] === undefined ? undefined : resolveRelativeImport(fromRelPath, match[1])
}

/** ディレクトリ名（kebab-case）から、そこに置く部品の PascalCase の名前を作る。 */
function pascalCaseOf(dirName: string): string {
  return dirName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

/**
 * `readonly className: string` を持つ `components/ui/` の部品（`Select` を除く）の一覧。
 * **自分の CSS を持たない薄い部品（`VStack` / `HStack`）は、`Omit<StackProps, "direction">` の
 * ように型を経由するので、本文に `readonly className: string` の字面が無い。** レンダーする先
 * （`.tsx` の `return <部品名`）を辿り、その先が対象ならこちらも対象に加える（固定点まで
 * 繰り返し、転送が連なっても拾う）。
 */
function classNameCheckedUiComponents(): readonly {
  readonly dirName: string
  readonly name: string
}[] {
  const entries = listSourceFiles(SRC_ROOT)
    .flatMap((relPath) => {
      const match = UI_COMPONENT_FILE_PATTERN.exec(relPath)
      return match?.[1] !== undefined ? [{ relPath, dirName: match[1] }] : []
    })
    .filter(({ dirName }) => dirName !== "select")
    .map(({ relPath, dirName }) => ({
      dirName,
      name: pascalCaseOf(dirName),
      content: readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
    }))

  const checked = new Set(
    entries.filter(({ content }) => CLASSNAME_PROP_PATTERN.test(content)).map((e) => e.dirName),
  )
  for (let grown = true; grown;) {
    grown = false
    for (const entry of entries) {
      if (checked.has(entry.dirName)) {
        continue
      }
      const renderedName = /return\s*<([A-Z]\w*)\b/.exec(entry.content)?.[1]
      const renderedDirName = entries.find((e) => e.name === renderedName)?.dirName
      if (renderedDirName !== undefined && checked.has(renderedDirName)) {
        checked.add(entry.dirName)
        grown = true
      }
    }
  }

  return entries
    .filter((e) => checked.has(e.dirName))
    .map(({ dirName, name }) => ({ dirName, name }))
}

type CssRule = {
  readonly selectors: readonly string[]
  readonly properties: readonly string[]
}

/** CSS の宣言ブロックを（ネストも含めて）1件ずつ切り出す。`@media` など宣言以外の入れ物は、
 * 中に `{` を持つので除く。 */
function cssRules(content: string): readonly CssRule[] {
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: CssRule[] = []
  const stack: { readonly selectorStart: number; readonly bodyStart: number }[] = []
  let cursor = 0
  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i]
    if (ch === "{") {
      stack.push({ selectorStart: cursor, bodyStart: i + 1 })
      cursor = i + 1
    } else if (ch === "}") {
      const frame = stack.pop()
      if (frame !== undefined) {
        const selectorText = withoutComments.slice(frame.selectorStart, frame.bodyStart - 1)
        const bodyText = withoutComments.slice(frame.bodyStart, i)
        if (!bodyText.includes("{") && !selectorText.trim().startsWith("@")) {
          rules.push({
            selectors: selectorText
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
            properties: declaredProperties(bodyText),
          })
        }
      }
      cursor = i + 1
    }
  }
  return rules
}

/** 一括指定を、比べる先で使う個々の property に開く（開かないものは字面のまま返す）。 */
const SHORTHAND_LONGHAND: Readonly<Record<string, readonly string[]>> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  border: ["border-color", "border-width", "border-style"],
  "border-top": ["border-top-color", "border-top-width", "border-top-style"],
  "border-right": ["border-right-color", "border-right-width", "border-right-style"],
  "border-bottom": ["border-bottom-color", "border-bottom-width", "border-bottom-style"],
  "border-left": ["border-left-color", "border-left-width", "border-left-style"],
  background: [
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
  ],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  gap: ["row-gap", "column-gap"],
  inset: ["top", "right", "bottom", "left"],
  font: ["font-style", "font-weight", "font-size", "line-height", "font-family"],
}

function declaredProperties(bodyText: string): readonly string[] {
  const names = bodyText
    .split(";")
    .map((decl) => decl.split(":")[0]?.trim() ?? "")
    .filter((name) => name.length > 0 && !name.startsWith("--"))
  return names.flatMap((name) => SHORTHAND_LONGHAND[name] ?? [name])
}

/** 選択子の最後の複合（最後の結合子より後ろ）が、その class を持つか。`::` の疑似要素は
 * 別の持ち物として数えるので対象にしない。 */
function lastCompoundHasClass(selector: string, className: string): boolean {
  const trimmed = selector.trim()
  if (trimmed.includes("::")) {
    return false
  }
  const compounds = trimmed
    .split(/\s+|(?=[>+~])|(?<=[>+~])/)
    .filter((part) => part.trim().length > 0)
  const last = compounds[compounds.length - 1]
  return last !== undefined && new RegExp(`\\.${className}(?=[.:#[]|$)`).test(last)
}

/** その class を最後の複合に持つ規則ぜんぶの property（重複を畳む）。 */
function propertiesOfClass(cssContent: string, className: string): readonly string[] {
  return [
    ...new Set(
      cssRules(cssContent).flatMap((rule) =>
        rule.selectors.some((selector) => lastCompoundHasClass(selector, className))
          ? rule.properties
          : [],
      ),
    ),
  ]
}

/**
 * 部品が `:where()` の外に持つ property（呼び出し側の class と競ってはいけないもの）。
 * 自分の CSS を持たない部品（`VStack` / `HStack`）は、レンダーする先の部品名を `.tsx` から辿って
 * その CSS を見る（同じ DOM ノードに乗るため。`visited` は辿りが循環しないための歯止め）。
 * **`::backdrop` などの疑似要素の規則は別の持ち物として数え、ここには含めない**
 * （`docs/design.md` 2章「`components/ui/` の部品」の検査の注記。別の要素に描くので、呼び出し側の
 * class が同じ property 名を持っていても競らない）。
 */
function ownExternalProperties(
  dirName: string,
  visited: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (visited.has(dirName)) {
    return []
  }
  const cssRelPath = `browser/components/ui/${dirName}/${dirName}.module.css`
  const tsxRelPath = `browser/components/ui/${dirName}/${dirName}.tsx`
  if (existsSync(`${SRC_ROOT}/${cssRelPath}`)) {
    const cssContent = readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8")
    return [
      ...new Set(
        cssRules(cssContent)
          .filter((rule) =>
            rule.selectors.every(
              (selector) => !selector.trim().startsWith(":where(") && !selector.includes("::"),
            ),
          )
          .flatMap((rule) => rule.properties),
      ),
    ]
  }
  if (!existsSync(`${SRC_ROOT}/${tsxRelPath}`)) {
    return []
  }
  const tsxContent = readFileSync(`${SRC_ROOT}/${tsxRelPath}`, "utf8")
  const renderedTagMatch = /return\s*<([A-Z]\w*)\b/.exec(tsxContent)
  const renderedDirName = classNameCheckedUiComponents().find(
    (c) => c.name === renderedTagMatch?.[1],
  )?.dirName
  return renderedDirName === undefined
    ? []
    : ownExternalProperties(renderedDirName, new Set([...visited, dirName]))
}

/** `.tsx` のソースから、`<部品名 ... className={式} ...>` の使用箇所をすべて拾う。 */
function jsxUsagesWithClassName(
  content: string,
  componentName: string,
): readonly { readonly tagText: string; readonly classNameExpr: string }[] {
  const tagPattern = new RegExp(`<${componentName}(?=[\\s/>])`, "g")
  const usages: { tagText: string; classNameExpr: string }[] = []
  for (const match of content.matchAll(tagPattern)) {
    const start = match.index
    let depth = 0
    let end = start
    for (let i = start; i < content.length; i++) {
      const ch = content[i]
      if (ch === "{") {
        depth++
      } else if (ch === "}") {
        depth--
      } else if (ch === ">" && depth === 0) {
        end = i + 1
        break
      }
    }
    const tagText = content.slice(start, end)
    const classNameStart = tagText.indexOf("className={")
    if (classNameStart === -1) {
      continue
    }
    let exprDepth = 1
    let exprEnd = classNameStart + "className={".length
    for (; exprEnd < tagText.length; exprEnd++) {
      const ch = tagText[exprEnd]
      if (ch === "{") {
        exprDepth++
      } else if (ch === "}") {
        exprDepth--
        if (exprDepth === 0) {
          break
        }
      }
    }
    usages.push({
      tagText,
      classNameExpr: tagText.slice(classNameStart + "className={".length, exprEnd),
    })
  }
  return usages
}

describe("components/ui/ の部品の className", () => {
  it('渡す className は styles["…"] の組み合わせだけで、その class は部品の property と重ならない', () => {
    const targets = classNameCheckedUiComponents()
    expect(targets.length).toBeGreaterThan(0)

    const files = listSourceFiles(SRC_ROOT).filter(
      (relPath) => relPath.startsWith("browser/") && relPath.endsWith(".tsx"),
    )

    const offenders = files.flatMap((relPath) => {
      const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
      return targets.flatMap(({ dirName, name }) => {
        const ownProperties = new Set(ownExternalProperties(dirName))
        return jsxUsagesWithClassName(content, name).flatMap(({ classNameExpr }) => {
          if (!isAllowedClassNameExpression(classNameExpr)) {
            return [
              `src/${relPath}: <${name}> の className が styles["…"] の組み合わせだけでできていない（${classNameExpr}）`,
            ]
          }
          const cssRelPath = stylesImportPath(content, relPath)
          if (cssRelPath === undefined) {
            return [`src/${relPath}: <${name}> に渡す className の "styles" が import されていない`]
          }
          const cssContent = readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8")
          return classNamesInExpression(classNameExpr).flatMap((className) => {
            const overlap = propertiesOfClass(cssContent, className).filter((property) =>
              ownProperties.has(property),
            )
            return overlap.length > 0
              ? [
                  `src/${relPath}: <${name}> に渡す ${className} が部品の property と重なる（${overlap.join(", ")}）`,
                ]
              : []
          })
        })
      })
    })

    expect(offenders.join("\n")).toBe("")
  })
})

/** `browser/components/domain/` の直下（サブディレクトリの中ではない）ファイルか。 */
function isDirectBrowserComponentsDomainFile(relPath: string): boolean {
  const segments = relPath.split("/")
  return (
    segments.length === 4 &&
    segments[0] === "browser" &&
    segments[1] === "components" &&
    segments[2] === "domain"
  )
}

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
 * `components/` は `page/` `domain/` `ui/` の3段（直下に残ったファイルは新しい箱として `throw`）。
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
  const [, second, third] = relPath.split("/")
  if (second === "components") {
    if (third === "page") {
      return "components/page"
    }
    if (third === "domain") {
      return "components/domain"
    }
    if (third === "ui") {
      return "components/ui"
    }
    throw new Error(
      `src/${relPath} の browser 箱を判定できない（components/ 直下は page/domain/ui の3段のはず）`,
    )
  }
  if (
    second === "features" ||
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

/** ファイル1件の相対 import から、許した辺（枠・画面 → 置かれる機能、画面 → 枠）に無いものを違反として返す。 */
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
    // 枠どうし・画面どうし・枠から画面・置かれる機能から出る辺は落とす。
    const allowed = ALLOWED_BROWSER_FEATURE_IMPORTS[fromFeature.kind].has(toFeature.kind)
    return allowed ? [] : [{ fromPath: relPath, fromFeature, toPath, toFeature }]
  })
}

/**
 * `browser/` 相対パスから、枠・画面・置かれる機能のどれかを返す。`BROWSER_FRAMES` / `BROWSER_SCREENS` /
 * `BROWSER_PLACED_FEATURES` のどれかのパスの下にあれば一致したものを返し、共有部分（`browser/lib/` など）は
 * `undefined`。**一覧に無いディレクトリが `features/` の直下・`components/domain/` の直下（サブディレクトリが
 * あるとき）・`components/page/` の下にあれば `throw`**（新しい枠・画面・機能を足したら、
 * 3つの一覧のどれかに足す）。
 */
function browserFeatureOf(relPath: string): BrowserFeature | undefined {
  if (!relPath.startsWith("browser/")) {
    return undefined
  }
  const path = relPath.slice("browser/".length)

  const frame = BROWSER_FRAMES.find((p) => path === p || path.startsWith(`${p}/`))
  if (frame !== undefined) {
    return { name: frame, kind: "frame" }
  }
  const screen = BROWSER_SCREENS.find((p) => path === p || path.startsWith(`${p}/`))
  if (screen !== undefined) {
    return { name: screen, kind: "screen" }
  }
  const placed = BROWSER_PLACED_FEATURES.find((p) => path === p || path.startsWith(`${p}/`))
  if (placed !== undefined) {
    return { name: placed, kind: "placed" }
  }

  const segments = path.split("/")
  const isUnlistedFeatureDir = segments[0] === "features" && segments.length >= 2
  const isUnlistedComponentsDomainDir =
    segments[0] === "components" && segments[1] === "domain" && segments.length >= 4
  const isUnlistedComponentsPageDir =
    segments[0] === "components" && segments[1] === "page" && segments.length >= 3
  if (isUnlistedFeatureDir || isUnlistedComponentsDomainDir || isUnlistedComponentsPageDir) {
    throw new Error(
      `src/${relPath} の機能の種類を判定できない（BROWSER_FRAMES か BROWSER_SCREENS か BROWSER_PLACED_FEATURES に足す）`,
    )
  }
  return undefined
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
 * `browser/` は先頭ディレクトリ、サーバ側は置き場（`serverPlaceOf`）の層で決まる。
 */
function layerOf(relPath: string): Layer {
  if (!relPath.includes("/")) {
    return "cli"
  }
  const [top] = relPath.split("/")
  if (top === "shared" || top === "browser") {
    return top
  }
  if (top === "server") {
    return serverPlaceOf(relPath).layer
  }
  throw new Error(`src/${relPath} の層を判定できない（層のディレクトリの外にある）`)
}

/**
 * `server/` の下のファイルの置き場を決める。`server/core/` `server/adapter/` の下（`lib/` を含む）は
 * 共有の箱、`server/<機能>/core/` `server/<機能>/adapter/` の下は機能の層。**`SERVER_FEATURES` に
 * 無いディレクトリ、機能の中で `core/` `adapter/` の外に置いたファイル、`server/` の直下の
 * ファイルは `throw`**（判断か境界かを名乗っていないものと、足し忘れた機能を素通りさせない）。
 */
function serverPlaceOf(relPath: string): ServerPlace {
  const [, second, third, ...rest] = relPath.split("/")
  if ((second === "core" || second === "adapter") && third !== undefined) {
    return { kind: "shared", layer: second }
  }
  const feature = SERVER_FEATURES.find((name) => name === second)
  if (feature === undefined) {
    throw new Error(
      `src/${relPath} の置き場を判定できない（新しい機能なら SERVER_FEATURES と SERVER_FEATURE_IMPORTS に足す）`,
    )
  }
  if ((third === "core" || third === "adapter") && rest.length > 0) {
    return { kind: "feature", feature, layer: third }
  }
  throw new Error(`src/${relPath} は機能 ${feature} の core/ か adapter/ の下に置く`)
}

/**
 * `server/` の共有の箱のファイル1件を import している機能の名前（重複を畳んだもの）と、機能の外
 * （配線層・別の共有の箱のファイルなど）からの読み手の数。`browserReadersOf` と同じ作り
 * （検索する範囲は `src/` 全体——配線層（`src/` 直下）も共有の箱を読むため）。
 */
function serverSharedBoxReadersOf(targetRelPath: string): {
  readonly features: readonly string[]
  readonly outsideFeatureCount: number
} {
  const readers = listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath !== targetRelPath)
    .filter((relPath) =>
      relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
        (specifier) => resolveRelativeImport(relPath, specifier) === targetRelPath,
      ),
    )
  const featureOf = (relPath: string): ServerFeature | undefined => {
    if (!relPath.startsWith("server/")) {
      return undefined
    }
    const place = serverPlaceOf(relPath)
    return place.kind === "feature" ? place.feature : undefined
  }

  return {
    features: [...new Set(readers.flatMap((relPath) => featureOf(relPath) ?? []))],
    outsideFeatureCount: readers.filter((relPath) => featureOf(relPath) === undefined).length,
  }
}

/** `server/` の機能のファイルから、別の機能のファイルへの相対 import をすべて返す。 */
function serverFeatureEdges(): readonly ServerFeatureEdge[] {
  return listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath.startsWith("server/"))
    .flatMap((fromPath) => {
      const from = serverPlaceOf(fromPath)
      if (from.kind !== "feature") {
        return []
      }
      return relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${fromPath}`, "utf8")).flatMap(
        (specifier) => {
          const toPath = resolveRelativeImport(fromPath, specifier)
          if (!toPath.startsWith("server/")) {
            return []
          }
          const to = serverPlaceOf(toPath)
          return to.kind === "feature" && to.feature !== from.feature
            ? [
                {
                  fromPath,
                  fromFeature: from.feature,
                  fromLayer: from.layer,
                  toPath,
                  toFeature: to.feature,
                  toLayer: to.layer,
                },
              ]
            : []
        },
      )
    })
}

/** 機能どうしの辺のうち、両端が同じ層（`core/` どうし・`adapter/` どうし）のものを機能のグラフにする。 */
function featureGraphOf(
  edges: readonly ServerFeatureEdge[],
  layer: ServerLayer,
): ReadonlyMap<ServerFeature, ReadonlySet<ServerFeature>> {
  const sameLayer = edges.filter((edge) => edge.fromLayer === layer && edge.toLayer === layer)
  return new Map(
    SERVER_FEATURES.map((feature) => [
      feature,
      new Set(
        sameLayer.filter((edge) => edge.fromFeature === feature).map((edge) => edge.toFeature),
      ),
    ]),
  )
}

/** 機能のグラフに輪があれば、最初に見つけた1つを始点に戻るまでの並びで返す。無ければ空。 */
function findFeatureCycle(
  graph: ReadonlyMap<ServerFeature, ReadonlySet<ServerFeature>>,
): readonly ServerFeature[] {
  const walk = (node: ServerFeature, path: readonly ServerFeature[]): readonly ServerFeature[] => {
    const seenAt = path.indexOf(node)
    if (seenAt >= 0) {
      return [...path.slice(seenAt), node]
    }
    return [...(graph.get(node) ?? [])].reduce<readonly ServerFeature[]>(
      (found, next) => (found.length > 0 ? found : walk(next, [...path, node])),
      [],
    )
  }
  return SERVER_FEATURES.reduce<readonly ServerFeature[]>(
    (found, start) => (found.length > 0 ? found : walk(start, [])),
    [],
  )
}

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
