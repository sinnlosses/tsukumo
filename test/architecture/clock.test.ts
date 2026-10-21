import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { withoutComments } from "../comment-line.ts"
import {
  astAllChildren,
  astChildren,
  astNumber,
  astObject,
  astString,
  parseProgram,
  type AstNode,
} from "./ast-node.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

// 「いま」を読む場所を2つに保つ。E2E は時計をこの2箇所で凍らせる（サーバは
// `TSUKUMO_FIXED_CLOCK`、ブラウザは E2E の側で `clock.ts` が呼ぶ関数を差し替える）ので、ほかで
// 読まれると固定が黙って効かなくなる（docs/architecture/testing.md「E2E の成果物と再現」）。
describe("Temporal.Now を読む箇所", () => {
  it("`Temporal.Now` を読むのは src/server/adapter/local-time.ts と src/browser/utils/clock.ts だけ", () => {
    const allowed = new Set(["server/adapter/local-time.ts", "browser/utils/clock.ts"])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        /\bTemporal\.Now\b/.test(withoutComments(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))),
      )

    expect(offenders).toEqual([])
  })
})

// 単体テストには React Compiler が掛からず、描画中の時刻の読み取りが固まるのが見えないので、ここで落とす。
describe("描画中に時計を読む箇所", () => {
  // React の外で、フレームを受けた手から呼ばれる。
  const RENDER_CLOCK_EXEMPT_FILES = new Set([
    "browser/domain/refresh.ts",
  ]) satisfies ReadonlySet<string>

  it("src/browser/ で時計を読む呼び出しは、effect・state の初期化関数・タイマーとリスナーの手・on… のイベントの手の中にある", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("browser/"))
      .filter((relPath) => relPath !== "browser/utils/clock.ts")
      .filter((relPath) => !RENDER_CLOCK_EXEMPT_FILES.has(relPath))
      .flatMap((relPath) =>
        renderTimeClockReads(relPath, readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).map(
          (line) => `${relPath}:${String(line)}`,
        ),
      )

    expect(offenders).toEqual([])
  })

  it("描画中の呼び出しを拾い、許す文脈の中の呼び出しは拾わない", () => {
    const header = 'import { nowEpochMilliseconds as clockNow } from "../utils/clock.ts"\n'
    const lines = (body: string): readonly number[] => renderTimeClockReads("a.tsx", header + body)

    expect(lines("function Part() {\n  const t = clockNow()\n  return t\n}")).toEqual([3])
    expect(lines("function format() {\n  return clockNow()\n}")).toEqual([3])
    expect(lines("function Part() {\n  const [t] = useState(clockNow())\n}")).toEqual([3])
    expect(lines("function Part() {\n  const r = useRef(clockNow())\n}")).toEqual([3])
    expect(lines("function Part() {\n  const [t] = useState(clockNow)\n}")).toEqual([])
    expect(
      renderTimeClockReads(
        "a.ts",
        'import * as clock from "../utils/clock.ts"\nexport const x = 1\n',
      ),
    ).toEqual([1])

    expect(lines("function Part() {\n  useEffect(() => {\n    clockNow()\n  }, [])\n}")).toEqual([])
    expect(
      lines(
        "function Part() {\n  useEffect(() => {\n    const t = setInterval(() => {\n      const f = () => clockNow()\n      f()\n    }, 1)\n  }, [])\n}",
      ),
    ).toEqual([])
    expect(lines("function Part() {\n  const [t] = useState(() => clockNow())\n}")).toEqual([])
    expect(lines("function Part() {\n  return <b onClick={() => clockNow()} />\n}")).toEqual([])
    expect(lines("function onOpen() {\n  clockNow()\n}")).toEqual([])
    expect(lines("const handlers = { onSwitch: () => clockNow() }")).toEqual([])
    expect(lines("const onTick = () => clockNow()")).toEqual([])
    expect(lines("target.addEventListener('x', () => clockNow())")).toEqual([])
  })

  it("構文エラーのあるソースは throw する", () => {
    expect(() => renderTimeClockReads("a.ts", "const = (")).toThrow("a.ts を読めない")
  })
})

const CLOCK_READERS = ["nowEpochMilliseconds"] satisfies readonly string[]
const CLOCK_MODULE_SUFFIX = "utils/clock.ts"
const EVENT_HANDLER_NAME = /^on[A-Z]/

// 呼び出し名ごとに、描画の外で走る関数を渡す引数の位置。
const DEFERRED_CALL_ARGUMENT_INDEX: ReadonlyMap<string, number> = new Map([
  ["useEffect", 0],
  ["useLayoutEffect", 0],
  ["useInsertionEffect", 0],
  ["useState", 0],
  ["useReducer", 2],
  ["setTimeout", 0],
  ["setInterval", 0],
  ["requestAnimationFrame", 0],
  ["addEventListener", 1],
])

function renderTimeClockReads(fileName: string, source: string): readonly number[] {
  const program = parseProgram(fileName, source)
  const reads: number[] = []
  const lineOf = (node: AstNode): number => {
    const start = astNumber(node, "start") ?? 0
    return source.slice(0, start).split("\n").length
  }
  const localNames = new Set<string>()

  for (const statement of astChildren(program, "body")) {
    if (astString(statement, "type") !== "ImportDeclaration") {
      continue
    }
    const importSource = astString(astObject(statement, "source"), "value")
    if (importSource === undefined || !importSource.endsWith(CLOCK_MODULE_SUFFIX)) {
      continue
    }
    for (const specifier of astChildren(statement, "specifiers")) {
      const type = astString(specifier, "type")
      if (type === "ImportNamespaceSpecifier") {
        reads.push(lineOf(specifier))
      }
      if (type === "ImportSpecifier") {
        const imported = astString(astObject(specifier, "imported"), "name")
        const local = astString(astObject(specifier, "local"), "name")
        if (imported !== undefined && local !== undefined && CLOCK_READERS.includes(imported)) {
          localNames.add(local)
        }
      }
    }
  }

  const visit = (node: AstNode, ancestors: readonly AstNode[]): void => {
    const type = astString(node, "type")
    if (type === "ImportDeclaration") {
      return
    }
    if (
      type === "Identifier" &&
      localNames.has(astString(node, "name") ?? "") &&
      !isDeferredContext(ancestors) &&
      !isDeferredCallArgument(node, ancestors.at(-1))
    ) {
      reads.push(lineOf(node))
    }
    for (const child of astAllChildren(node)) {
      visit(child, [...ancestors, node])
    }
  }
  visit(program, [])
  return reads
}

// 識別子を囲む関数のどれか1つが、描画の外で走る関数なら true。
function isDeferredContext(ancestors: readonly AstNode[]): boolean {
  return ancestors.some((node, index) => {
    const type = astString(node, "type")
    if (type === "FunctionDeclaration") {
      return EVENT_HANDLER_NAME.test(astString(astObject(node, "id"), "name") ?? "")
    }
    if (type !== "ArrowFunctionExpression" && type !== "FunctionExpression") {
      return false
    }
    const parent = ancestors[index - 1]
    return parent !== undefined && isDeferredFunctionSlot(node, parent, ancestors[index - 2])
  })
}

function isDeferredFunctionSlot(
  fn: AstNode,
  parent: AstNode,
  grandParent: AstNode | undefined,
): boolean {
  const parentType = astString(parent, "type")
  if (parentType === "CallExpression") {
    return isDeferredArgument(fn, parent)
  }
  if (parentType === "VariableDeclarator") {
    return EVENT_HANDLER_NAME.test(astString(astObject(parent, "id"), "name") ?? "")
  }
  if (parentType === "Property") {
    return EVENT_HANDLER_NAME.test(astString(astObject(parent, "key"), "name") ?? "")
  }
  if (parentType === "JSXExpressionContainer" && grandParent !== undefined) {
    return EVENT_HANDLER_NAME.test(astString(astObject(grandParent, "name"), "name") ?? "")
  }
  return false
}

function isDeferredCallArgument(node: AstNode, parent: AstNode | undefined): boolean {
  return (
    parent !== undefined &&
    astString(parent, "type") === "CallExpression" &&
    isDeferredArgument(node, parent)
  )
}

function isDeferredArgument(argument: AstNode, call: AstNode): boolean {
  const callee = astObject(call, "callee")
  const calleeName =
    astString(callee, "type") === "MemberExpression"
      ? astString(astObject(callee, "property"), "name")
      : astString(callee, "name")
  return (
    calleeName !== undefined &&
    DEFERRED_CALL_ARGUMENT_INDEX.get(calleeName) ===
      astChildren(call, "arguments").indexOf(argument)
  )
}
