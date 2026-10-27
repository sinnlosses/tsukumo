import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  arrayField,
  descendants,
  literalString,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { astNumber } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram } from "./source-file.ts"

// browser の単体テストで、見た目の class 名を `expect(…)` で確かめない
// （docs/coding-standards/test.md「消すかどうか」。見た目は目視の担当）。
// 数えるのは、`expect(…)` の引数の中の `.className` の読みと class セレクタ（`.名前`）を含む
// `querySelector` / `querySelectorAll`、および `toHaveClass` の呼び出し。
// `expect` の外で要素を引くだけの `querySelector(".名前")`、JSX の `className=` 属性、`x.className = …` の代入は数えない。
// 既存はファイルごとの現在の件数を上限に固定し、増やさない。減らしたら上限も下げる。
const ALLOWED_COUNTS: Readonly<Record<string, number>> = {
  "test/browser/components/domain/screen-nav/components/phone-head.test.tsx": 18,
  "test/browser/components/domain/screen-nav/screen-nav.test.tsx": 17,
  "test/browser/components/page/achievement/components/day-switch/day-switch.test.tsx": 3,
  "test/browser/components/page/achievement/components/diary-book/diary-book.test.tsx": 2,
  "test/browser/components/page/achievement/components/diary-section/diary-section.test.tsx": 4,
  "test/browser/components/page/achievement/components/lantern-calendar/lantern-calendar.test.tsx": 4,
  "test/browser/components/page/achievement/presentational-achievement.test.tsx": 7,
  "test/browser/components/page/character/character.test.tsx": 5,
  "test/browser/components/page/character/components/character-create/character-create.test.tsx": 3,
  "test/browser/components/page/character/components/character-edit/character-edit-delete.test.tsx": 1,
  "test/browser/components/page/character/components/character-edit/character-edit.test.tsx": 5,
  "test/browser/components/page/conversation/components/character-view/balloon-track.test.tsx": 4,
  "test/browser/components/page/conversation/components/character-view/character-view-pinned-speech.test.tsx": 6,
  "test/browser/components/page/conversation/components/character-view/character-view.test.tsx": 19,
  "test/browser/components/page/conversation/components/character-view/speech-log.test.tsx": 2,
  "test/browser/components/page/conversation/components/chat-view/chat-view.test.tsx": 2,
  "test/browser/components/page/conversation/components/dispatch/components/command-suggestion-list/command-suggestion-list.test.tsx": 2,
  "test/browser/components/page/conversation/components/dispatch/components/file-suggestion-list/file-suggestion-list.test.tsx": 1,
  "test/browser/components/page/conversation/components/inquiry/inquiry.test.tsx": 2,
  "test/browser/components/page/conversation/components/main-view/components/mini-portrait/mini-portrait.test.tsx": 5,
  "test/browser/components/page/conversation/components/main-view/components/question-record/question-record.test.tsx": 5,
  "test/browser/components/page/conversation/components/main-view/components/turn-list/turn-list.test.tsx": 5,
  "test/browser/components/page/conversation/components/main-view/components/turn/turn.test.tsx": 7,
  "test/browser/components/page/conversation/components/main-view/main-view.test.tsx": 1,
  "test/browser/components/page/conversation/components/markdown/renderer/markdown-renderer-code.test.tsx": 27,
  "test/browser/components/page/conversation/components/markdown/renderer/markdown-renderer-html.test.tsx": 1,
  "test/browser/components/page/conversation/components/markdown/renderer/markdown-renderer-image.test.tsx": 10,
  "test/browser/components/page/conversation/components/markdown/renderer/markdown-renderer-link.test.tsx": 2,
  "test/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.test.tsx": 27,
  "test/browser/components/page/conversation/components/markdown/renderer/mermaid-block.test.tsx": 11,
  "test/browser/components/page/conversation/components/markdown/renderer/notation.test.tsx": 5,
  "test/browser/components/page/conversation/components/pending-ask-card/pending-ask-card.test.tsx": 3,
  "test/browser/components/page/conversation/components/prompt-image/prompt-image.test.tsx": 2,
  "test/browser/components/page/token-usage/components/context-usage-card/context-usage-card.test.tsx": 5,
  "test/browser/components/page/token-usage/components/usage-review-card/usage-review-card.test.tsx": 6,
  "test/browser/components/page/token-usage/presentational-token-usage.test.tsx": 8,
  "test/browser/components/ui/dialog/dialog.test.tsx": 1,
  "test/browser/components/ui/menu/menu.test.tsx": 1,
  "test/browser/components/ui/stack/stack.test.tsx": 1,
  "test/browser/components/ui/text/text.test.tsx": 1,
  "test/browser/features/current-work/current-work-detail.test.tsx": 17,
  "test/browser/features/current-work/current-work.test.tsx": 18,
  "test/browser/features/run-setting/components/run-setting-group.test.tsx": 1,
  "test/browser/features/task-board/task-board.test.tsx": 2,
  "test/browser/features/task-board/task-list.test.tsx": 1,
  "test/browser/features/task-board/task-run.test.tsx": 2,
}

describe("class 名の assertion", () => {
  it("test/browser のファイルごとの件数が、許可リストの上限と一致する", () => {
    const browserRoot = `${REPOSITORY_ROOT}/test/browser`
    const counts = Object.fromEntries(
      listSourceFiles(browserRoot).flatMap((relPath) => {
        const count = classAssertionCount(
          readFileSync(`${browserRoot}/${relPath}`, "utf8"),
          relPath,
        )
        return count === 0 ? [] : [[`test/browser/${relPath}`, count]]
      }),
    )

    expect(classAssertionProblems(counts, ALLOWED_COUNTS)).toEqual([])
  })

  it("許可リストの合計は 300 件以内", () => {
    expect(
      Object.values(ALLOWED_COUNTS).reduce((sum, count) => sum + count, 0),
    ).toBeLessThanOrEqual(300)
  })

  it.each([
    ["className の読み", 'expect(el.className).toContain("x")', 1],
    ["オプショナルチェーンの className", 'expect(el?.className).toBe("x")', 1],
    ["class セレクタの querySelector", 'expect(document.querySelector(".a")).toBeNull()', 1],
    ["タグ付きの class セレクタ", 'expect(c.querySelector("dialog.a")).toBeNull()', 1],
    ["querySelectorAll", 'expect(c.querySelectorAll(".a")).toHaveLength(0)', 1],
    ["toHaveClass", 'expect(el).toHaveClass("x")', 1],
    ["1 つの expect に 2 つ", 'expect([a.className, b.className]).toEqual(["x", "y"])', 2],
  ])("見本を数える: %s", (_name, source, count) => {
    expect(classAssertionCount(source, "sample.ts")).toBe(count)
  })

  it.each([
    ["expect の外の lookup", 'const a = container.querySelector(".a")'],
    ["タグだけのセレクタ", 'expect(c.querySelector("img")).toBeNull()'],
    ["属性セレクタの値の点", "expect(c.querySelector('[data-x=\"a.b\"]')).toBeNull()"],
    ["JSX の className 属性", 'const a = <div className="x" />'],
    ["className の代入", 'el.className = "x"'],
    ["expect の外の className の読み", "const a = el.className"],
  ])("見本を数えない: %s", (_name, source) => {
    expect(classAssertionCount(source, "sample.tsx")).toBe(0)
  })

  it.each([
    ["上限どおり", { "a.ts": 2 }, { "a.ts": 2 }, []],
    ["増えた", { "a.ts": 3 }, { "a.ts": 2 }, ["a.ts"]],
    ["許可リストに無い", { "b.ts": 1 }, {}, ["b.ts"]],
    ["減ったのに上限が残る", { "a.ts": 1 }, { "a.ts": 2 }, ["a.ts"]],
    ["0 件になったのに上限が残る", {}, { "a.ts": 2 }, ["a.ts"]],
  ])("上限との照合: %s", (_name, counts, allowed, files) => {
    expect(classAssertionProblems(counts, allowed).map((line) => line.split(" ")[0])).toEqual(files)
  })
})

function classAssertionProblems(
  counts: Readonly<Record<string, number>>,
  allowed: Readonly<Record<string, number>>,
): readonly string[] {
  return [...new Set([...Object.keys(counts), ...Object.keys(allowed)])]
    .toSorted()
    .flatMap((path) => {
      const actual = counts[path] ?? 0
      const limit = allowed[path] ?? 0
      if (actual > limit) {
        return [
          `${path} は class 名の assertion が ${actual} 件で、上限 ${limit} を超える。見た目は目視に任せ、出し分けは data 属性・role・文言で確かめる（docs/coding-standards/test.md「消すかどうか」）`,
        ]
      }
      return actual < limit
        ? [`${path} は ${actual} 件に減った。ALLOWED_COUNTS の上限 ${limit} を ${actual} に下げる`]
        : []
    })
}

function classAssertionCount(source: string, fileName: string): number {
  const nodes = descendants(parseSourceProgram(source, fileName))
  const found = new Set<number>()
  for (const call of nodes.filter(isExpectCall)) {
    for (const node of arrayField(call, "arguments").flatMap(descendants)) {
      if (isClassName(node) || isClassSelectorQuery(node)) {
        found.add(astNumber(node, "start") ?? -1)
      }
    }
  }
  for (const node of nodes) {
    if (isToHaveClass(node)) {
      found.add(astNumber(node, "start") ?? -1)
    }
  }
  return found.size
}

function isExpectCall(node: AstNode): boolean {
  return (
    stringField(node, "type") === "CallExpression" &&
    stringField(objectField(node, "callee"), "name") === "expect"
  )
}

function propertyName(callee: AstNode | undefined): string | undefined {
  return stringField(callee, "type") === "MemberExpression"
    ? stringField(objectField(callee, "property"), "name")
    : undefined
}

function isClassName(node: AstNode): boolean {
  return propertyName(node) === "className"
}

function isToHaveClass(node: AstNode): boolean {
  return (
    stringField(node, "type") === "CallExpression" &&
    propertyName(objectField(node, "callee")) === "toHaveClass"
  )
}

function isClassSelectorQuery(node: AstNode): boolean {
  if (stringField(node, "type") !== "CallExpression") {
    return false
  }
  const name = propertyName(objectField(node, "callee"))
  if (name !== "querySelector" && name !== "querySelectorAll") {
    return false
  }
  const selector = literalString(arrayField(node, "arguments")[0])
  return selector !== undefined && /\.[A-Za-z_-]/.test(selector.replace(/\[[^\]]*\]/g, ""))
}
