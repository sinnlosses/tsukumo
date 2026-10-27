import { existsSync, readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  featureReadersOf,
  listSourceFiles,
  relativeImportSpecifiers,
  resolveRelativeImport,
  SRC_ROOT,
} from "./source-file.ts"

// 画面を組み立てる部品のまとまり（`docs/architecture.md`「領域の機能と、置かれる機能」）の一覧。
// まとまりどうしの辺は `.dependency-cruiser.cjs` が見て、ここは一覧に無いディレクトリを `throw` で落とす。
//
// - 枠（`BROWSER_FRAMES`）: 全画面で共有する枠（`components/domain/<枠>/`）。差し込み口は
//   props で受け、画面を知らない。枠どうしは import しない
// - 画面（`BROWSER_SCREENS`）: 1つの画面 = 1つのページ（`components/page/<画面>/`）。`components/app/layout.tsx` が
//   出す画面を選ぶ。画面どうしは import しない。会話の画面は `<Sidebar>` を
//   置くので、画面から枠へは引いてよい
// - 置かれる機能（`BROWSER_PLACED_FEATURES`）: 自分の置き場所を持たず、枠か画面の中に
//   置いてもらう。どのまとまりも import しない（葉）ので、枠・画面から引いても輪にならない
//
// 一覧は `browser/` からの相対パスで引く（枠と画面は `components/domain/<枠>/` と
// `components/page/<画面>/` に分かれているので、名前だけでは引けない）。
//
// `browser/components/`（`app/` `page/` `domain/` `ui/` の4段。一覧のパスに無いディレクトリ）・
// `browser/lib/` `browser/stores/` `browser/styles/` と `browser/main.tsx` / `browser/app.tsx` は誰から引いてもよい
// 共有部分なので、ここでは見ない。一覧に無いディレクトリが `features/` の直下・
// `components/domain/` の直下（サブディレクトリがあるとき）・`components/page/` の下に
// あれば `throw` する（足し忘れが「検査の対象外」として黙って通るのを防ぐ）。
//
// 会話の画面の4つの領域（`main-view` など）は `conversation/components/` の下の部品なので、
// 画面 `components/page/conversation` の一部として扱われる。
const BROWSER_FRAMES = ["components/domain/screen-nav", "components/domain/sidebar"] as const
const BROWSER_SCREENS = [
  "components/page/conversation",
  "components/page/character",
  "components/page/token-usage",
  "components/page/achievement",
] as const
const BROWSER_PLACED_FEATURES = [
  "features/task-board",
  "features/current-work",
  "features/run-setting",
] as const

type BrowserFeature = {
  /** `browser/` からの相対パス（`BROWSER_FRAMES` / `BROWSER_SCREENS` / `BROWSER_PLACED_FEATURES` の1件）。 */
  readonly name: string
}

// 機能をまたぐ箱に、1つの機能しか読まないファイルが残っていないことを見る
// （`docs/architecture/browser-box.md`「上げる引き金は「2つ目の読み手が出たとき」」。引き金は逆にも引き、
// 読み手が1つに戻ったものはその機能の中へ下ろす）。`components/domain/` の直下にも
// 同じ基準を掛ける（docs/architecture/browser-box.md「引き金は逆にも引く」）。`components/ui/` は汎用の部品の置き場で、
// 読み手の数を問わないので対象外（docs/architecture/browser.md「読み手の数は問わない」）。
//
// 読み手が機能の外にも居るものは対象外（下ろす先の機能が無いので、ここに残るのが正しい）。
// `components/ui/<部品>/` は1つの読み手として数える。
//
// `components/domain/` は直下のファイルだけを対象にする（サブディレクトリは全画面で共有する
// 枠（領域）で、1つの領域だけが読むのが正しい形。docs/architecture/browser-box.md「`components/domain/` の直下のファイルは
// 領域ではなく共有の部品」）。
const SHARED_BROWSER_BOXES = ["lib", "domain", "stores", "hooks"] as const

describe("browser/ の機能をまたぐ箱", () => {
  it("browser/lib/・domain/・stores/・hooks/・components/domain/ 直下に、1つの機能だけが読むファイルは無い", () => {
    const files = listSourceFiles(SRC_ROOT).filter(
      (relPath) =>
        SHARED_BROWSER_BOXES.some((box) => relPath.startsWith(`browser/${box}/`)) ||
        isDirectBrowserComponentsDomainFile(relPath),
    )
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.flatMap((relPath) => {
      const readers = featureReadersOf(
        relPath,
        "browser/",
        (path) => browserFeatureOf(path)?.name ?? uiPartOf(path),
      )
      return readers.features.length === 1 && readers.outsideFeatureCount === 0
        ? [`src/${relPath}（読むのは ${readers.features.join("")} だけ）`]
        : []
    })

    expect(offenders.join("\n")).toBe("")
  })
})

// `components/ui/` の置き方（docs/architecture/directory.md「1部品1フォルダは真似しない」の例外）を検査で守る。
// 直下にファイルを置かない（部品ごとのディレクトリの中に置く）、`ui/<部品>/` には必ず
// `<部品>.tsx` がある（ディレクトリ名がそのまま部品のファイル名になる）の2つ。barrel file
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

// ページの形（`docs/architecture/directory.md`「ページの形」）。`components/page/<ページ>/` の直下は
// container / presenter の対（`<ページ>.tsx` / `presentational-<ページ>.tsx`）・`<ページ>.module.css`・
// `domain/` `hooks/` `components/` だけ。部品（`components/<部品>/`）も同じ作り（`<部品>.tsx` /
// `presentational-<部品>.tsx` / `<部品>.module.css` / `hooks/` `domain/` `components/`）で、ほかに
// 概念のディレクトリを名前の一覧（`PAGE_CONCEPT_DIRECTORIES`）で許す。
// 子部品は部品と同じディレクトリに `<子部品>.tsx` を平らに並べる。
// `<部品>.tsx` は自分の `components/` と概念のディレクトリを `export … from` で再エクスポートできない。
// `components/` の直下はディレクトリだけで、`hooks/` は部品の形（`<名前>.tsx` など）を求めない
// 固定の置き場として例外にする。
const PAGE_CONCEPT_DIRECTORIES: ReadonlySet<string> = new Set(["renderer", "stage"])

type PageNodeRule = {
  /** このディレクトリ自身が `components/` を持ってよいか。 */
  readonly allowsComponents: boolean
  /** `components/` の子（部品）が自分の `components/` を持ってよいか（ページの直下だけ）。 */
  readonly allowsGrandchildComponents: boolean
  /** 部品のディレクトリか（概念のディレクトリと、平らに並べた子部品の `.tsx` を許す）。 */
  readonly isComponent: boolean
  /** 複数の部品が読む状態の `stores/` を持ってよいか（ページの直下だけ）。 */
  readonly allowsStores: boolean
}

const PAGE_ROOT_RULE: PageNodeRule = {
  allowsComponents: true,
  allowsGrandchildComponents: true,
  isComponent: false,
  allowsStores: true,
}

describe("components/page/ の形", () => {
  it("ページ・部品の直下は、名前から作る対・CSS・domain/・hooks/・components/（と部品の概念のディレクトリ）だけ", () => {
    const offenders = BROWSER_SCREENS.flatMap((screen) =>
      pageNodeViolations(`browser/${screen}`, screen.split("/").pop() ?? "", PAGE_ROOT_RULE),
    )

    expect(offenders.join("\n")).toBe("")
  })

  it("部品のディレクトリの外から import してよいのは <部品>.tsx だけ（main.tsx / app.tsx とテストは除く）", () => {
    const offenders = componentBoundaryViolations()

    expect(offenders.join("\n")).toBe("")
  })

  it("部品の <部品>.tsx は、自分の components/ と概念のディレクトリの中を export … from で再エクスポートしない", () => {
    const offenders = componentReexportViolations()

    expect(offenders.join("\n")).toBe("")
  })
})

/** ページ・部品1件の直下を検査する（`docs/architecture/directory.md`「ページの形」）。 */
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
      const isChildComponent = rule.isComponent && /^(?!index\.).+\.tsx$/.test(entry.name)
      return allowedFiles.has(entry.name) || isChildComponent
        ? []
        : [`src/${relPath}/${entry.name}（規約の外のファイル）`]
    }
    if (entry.name === "domain" || entry.name === "hooks") {
      return []
    }
    if (entry.name === "stores" && rule.allowsStores) {
      return []
    }
    if (rule.isComponent && PAGE_CONCEPT_DIRECTORIES.has(entry.name)) {
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

/**
 * `components/` の直下（ページ・部品どちらの下でも同じ形）を検査する。直下はディレクトリだけで、
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
      isComponent: true,
      allowsStores: false,
    })
  })
}

/**
 * ページの下の部品ディレクトリ（`components/` の直下で `hooks/` を除いたもの）の一覧。
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

/** 入口の箱（`main`）のファイル。入口の `main.tsx` と、その中身の `<App>` を持つ `app.tsx`。 */
const ENTRY_FILES: ReadonlySet<string> = new Set(["browser/main.tsx", "browser/app.tsx"])

/**
 * 部品のディレクトリの外から、中の `<部品>.tsx` 以外を import している箇所
 * （`main.tsx` / `app.tsx` と、画面を選ぶ `components/app/` は除く）。
 */
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
          !ENTRY_FILES.has(edge.fromPath) &&
          !edge.fromPath.startsWith("browser/components/app/") &&
          !edge.fromPath.startsWith(`${componentRelPath}/`),
      )
      .map((edge) => `src/${edge.fromPath} → src/${edge.toPath}（${componentRelPath} の外から）`)
  })
}

/**
 * 部品の `<部品>.tsx` が、自分の `components/`（子部品）と概念のディレクトリの中のファイルを
 * `export … from` で再エクスポートしている箇所。`hooks/` と `domain/` は数えない。
 */
function componentReexportViolations(): readonly string[] {
  return pageComponentDirectories().flatMap((componentRelPath) => {
    const dirName = componentRelPath.split("/").pop() ?? ""
    const entryRelPath = `${componentRelPath}/${dirName}.tsx`
    if (!existsSync(`${SRC_ROOT}/${entryRelPath}`)) {
      return []
    }
    const ownedPrefixes = [
      `${componentRelPath}/components/`,
      ...[...PAGE_CONCEPT_DIRECTORIES].map((concept) => `${componentRelPath}/${concept}/`),
    ]
    const content = readFileSync(`${SRC_ROOT}/${entryRelPath}`, "utf8")
    return [
      ...content.matchAll(
        /export\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+["'](\.[^"']+)["']/g,
      ),
    ].flatMap(([, specifier]) => {
      const toPath = specifier === undefined ? "" : resolveRelativeImport(entryRelPath, specifier)
      return ownedPrefixes.some((prefix) => toPath.startsWith(prefix))
        ? [
            `src/${entryRelPath} → src/${toPath}（自分の子部品か概念のディレクトリの再エクスポート）`,
          ]
        : []
    })
  })
}

/** `browser/components/ui/<部品>/` の中のファイルなら、その部品のパス。 */
function uiPartOf(relPath: string): string | undefined {
  const [browser, components, ui, part] = relPath.split("/")
  return browser === "browser" && components === "components" && ui === "ui" && part !== undefined
    ? `browser/components/ui/${part}`
    : undefined
}

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
 * `browser/` 相対パスから、枠・画面・置かれる機能のどれかを返す。`BROWSER_FRAMES` / `BROWSER_SCREENS` /
 * `BROWSER_PLACED_FEATURES` のどれかのパスの下にあれば一致したものを返し、共有部分（`browser/lib/` など）は
 * `undefined`。一覧に無いディレクトリが `features/` の直下・`components/domain/` の直下（サブディレクトリが
 * あるとき）・`components/page/` の下にあれば `throw`（新しい枠・画面・機能を足したら、
 * 3つの一覧のどれかに足す）。
 */
function browserFeatureOf(relPath: string): BrowserFeature | undefined {
  if (!relPath.startsWith("browser/")) {
    return undefined
  }
  const path = relPath.slice("browser/".length)

  const frame = BROWSER_FRAMES.find((p) => path === p || path.startsWith(`${p}/`))
  if (frame !== undefined) {
    return { name: frame }
  }
  const screen = BROWSER_SCREENS.find((p) => path === p || path.startsWith(`${p}/`))
  if (screen !== undefined) {
    return { name: screen }
  }
  const placed = BROWSER_PLACED_FEATURES.find((p) => path === p || path.startsWith(`${p}/`))
  if (placed !== undefined) {
    return { name: placed }
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
