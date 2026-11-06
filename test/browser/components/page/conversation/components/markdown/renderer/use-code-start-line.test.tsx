import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useCodeStartLine } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/use-code-start-line.ts"
import { UNKNOWN_CODE_BLOCK_START } from "../../../../../../../../src/shared/repository/code-block-start.ts"
import { UNREADABLE_FILE_EXCERPT } from "../../../../../../../../src/shared/repository/file-excerpt.ts"
import {
  stubRepositoryFileLink,
  type RepositoryFileLinkStub,
} from "../../../../../../../fixture/repository-file-link.tsx"

let stub: RepositoryFileLinkStub | undefined

afterEach(() => {
  cleanup()
  stub?.restore()
  stub = undefined
})

function Probe(props: { readonly path?: string }) {
  const line = useCodeStartLine({ path: props.path, language: "ts", source: "架空の行" })
  return <output>{line === undefined ? "なし" : String(line)}</output>
}

function draw(path: string | undefined, answer: Parameters<typeof stubRepositoryFileLink>[2]) {
  stub = stubRepositoryFileLink(["src/fictional.ts"], UNREADABLE_FILE_EXCERPT, answer)
  render(stub.wrap(<Probe path={path} />))
  return stub
}

describe("useCodeStartLine", () => {
  it("管理下のパスで応答が line なら、その行を返し、塊を手続きへ渡す", async () => {
    const drawn = draw("src/fictional.ts", { kind: "line", startLine: 40 })

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("40")
    })
    expect(drawn.codeBlockStartRequests).toEqual([
      { path: "src/fictional.ts", language: "ts", source: "架空の行" },
    ])
  })

  it("応答が unknown なら undefined", async () => {
    const drawn = draw("src/fictional.ts", UNKNOWN_CODE_BLOCK_START)

    await waitFor(() => {
      expect(drawn.codeBlockStartRequests).toHaveLength(1)
    })
    expect(screen.getByRole("status").textContent).toBe("なし")
  })

  it.each([
    ["管理下でないパス", "src/other.ts"],
    ["path が無い", undefined],
  ])("%s は手続きを呼ばない", async (_name, path) => {
    const drawn = draw(path, { kind: "line", startLine: 40 })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(drawn.codeBlockStartRequests).toEqual([])
    expect(screen.getByRole("status").textContent).toBe("なし")
  })
})
