import { describe, expect, it } from "vitest"

import { readGraphSource } from "../../../src/shared/report/graph-source.ts"

describe("readGraphSource", () => {
  it("包みで節点の形を決め、辺とラベルを読む", () => {
    expect(
      readGraphSource(
        "(架空の始点) -> 架空の処理: 渡す\n架空の処理 -> {架空の分岐?}\n{架空の分岐?} -> (架空の終点): yes",
      ),
    ).toEqual({
      nodes: [
        { name: "架空の始点", shape: "round", change: "unchanged", tone: "none", note: "" },
        { name: "架空の処理", shape: "box", change: "unchanged", tone: "none", note: "" },
        { name: "架空の分岐?", shape: "decision", change: "unchanged", tone: "none", note: "" },
        { name: "架空の終点", shape: "round", change: "unchanged", tone: "none", note: "" },
      ],
      edges: [
        {
          from: 0,
          to: 1,
          label: "渡す",
          change: "unchanged",
          tone: "none",
          dashed: false,
          returns: false,
        },
        {
          from: 1,
          to: 2,
          label: "",
          change: "unchanged",
          tone: "none",
          dashed: false,
          returns: false,
        },
        {
          from: 2,
          to: 3,
          label: "yes",
          change: "unchanged",
          tone: "none",
          dashed: false,
          returns: false,
        },
      ],
      groups: [],
      brokenLines: [],
    })
  })

  describe("囲み", () => {
    it("[群の名] 〜 [] の間の行で名指した節点（辺は両端）を群に入れる", () => {
      const reading = readGraphSource("X\n[架空の群]\nA\nB -> C\n[]\nC -> D")

      expect(reading.nodes.map(({ name }) => name)).toEqual(["X", "A", "B", "C", "D"])
      expect(reading.groups).toEqual([
        { name: "架空の群", nodes: [1, 2, 3], inner: [], tone: "none" },
      ])
      expect(reading.brokenLines).toEqual([])
    })

    it("群は2つ並べられる", () => {
      const reading = readGraphSource("[甲]\nA\n[]\n[乙]\nB\n[]")

      expect(reading.groups).toEqual([
        { name: "甲", nodes: [0], inner: [], tone: "none" },
        { name: "乙", nodes: [1], inner: [], tone: "none" },
      ])
      expect(reading.brokenLines).toEqual([])
    })

    it.each([
      ["内側だけが空", "[甲]\nA\n[乙]\n[]\n[]", [3]],
      ["3階層", "[甲]\n[乙]\n[丙]\nA\n[]\n[]\n[]", [3]],
      ["閉じ忘れ", "[甲]\nA", [1]],
      ["開いていない閉じ", "A\n[]", [2]],
      ["空の群", "[甲]\n[]", [1]],
      ["同じ節点が2群", "[甲]\nA\n[]\n[乙]\nA\n[]", [4, 5]],
      ["名が空・記号入り", "[ ]\n[a:b]\n[a[b]]\n[a -> b]", [1, 2, 3, 4]],
    ])("%s は壊れた行にする", (_, source, broken) => {
      expect(readGraphSource(source).brokenLines).toEqual(broken)
    })

    it("囲みは2階層まで入れ子にでき、外側は内側の添字を持つ", () => {
      const reading = readGraphSource("[外]\nX\n[内]\nA\nB\n[]\n[]\nX -> A")

      expect(reading.groups).toEqual([
        { name: "内", nodes: [1, 2], inner: [], tone: "none" },
        { name: "外", nodes: [0], inner: [0], tone: "none" },
      ])
      expect(reading.brokenLines).toEqual([])
    })

    it("外側に直の節点が無くても、内側の囲みがあれば群として読む", () => {
      const reading = readGraphSource("[外]\n[内]\nA\n[]\n[]")

      expect(reading.groups.map(({ name, inner }) => [name, inner])).toEqual([
        ["内", []],
        ["外", [0]],
      ])
      expect(reading.brokenLines).toEqual([])
    })

    it("3階層目の開きは壊れた行にし、対の閉じは飛ばして外側を壊さない", () => {
      const reading = readGraphSource("[甲]\n[乙]\n[丙]\nA\n[]\n[]\n[]")

      expect(reading.brokenLines).toEqual([3])
      expect(reading.groups.map(({ name }) => name)).toEqual(["乙", "甲"])
    })

    it("別の囲みに入った節点を内側の囲みに入れ直すと壊れた行にする", () => {
      expect(readGraphSource("[外]\nA\n[内]\nA\n[]\n[]").brokenLines).toEqual([3, 4])
    })

    it("閉じ忘れの群は、中に節点があれば群として読む", () => {
      expect(readGraphSource("[甲]\nA").groups).toEqual([
        { name: "甲", nodes: [0], inner: [], tone: "none" },
      ])
    })
  })

  it("同じ名前は同じ節点で、形は最初に包みで出た行のものを採る", () => {
    const { nodes, edges } = readGraphSource("A -> {B}\nB -> C\n(C) -> A\nC -> {A}")

    expect(nodes).toEqual([
      { name: "A", shape: "decision", change: "unchanged", tone: "none", note: "" },
      { name: "B", shape: "decision", change: "unchanged", tone: "none", note: "" },
      { name: "C", shape: "round", change: "unchanged", tone: "none", note: "" },
    ])
    expect(edges.map(({ from, to }) => [from, to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 0],
    ])
  })

  it("矢印の無い行は節点だけの宣言で、空行と前後の空白は無視する", () => {
    const { nodes, edges, brokenLines } = readGraphSource("\n  (孤立)  \n\n   \n  A  ->  B  ")

    expect(nodes.map(({ name }) => name)).toEqual(["孤立", "A", "B"])
    expect(edges).toEqual([
      {
        from: 1,
        to: 2,
        label: "",
        change: "unchanged",
        tone: "none",
        dashed: false,
        returns: false,
      },
    ])
    expect(brokenLines).toEqual([])
  })

  it("読めない行は行番号（空行も数える）を返し、その行の節点は足さない", () => {
    const reading = readGraphSource("A -> B\n\nA - B\nX -> Y -> Z\n -> C\nF: 語\n()")

    expect(reading.brokenLines).toEqual([3, 4, 5, 6, 7])
    expect(reading.nodes.map(({ name }) => name)).toEqual(["A", "B"])
    expect(reading.edges).toEqual([
      {
        from: 0,
        to: 1,
        label: "",
        change: "unchanged",
        tone: "none",
        dashed: false,
        returns: false,
      },
    ])
  })

  it("行頭の + / - / ~ を辺と節点だけの行の印として読み、辺の印は端の節点に掛けない", () => {
    const { nodes, edges, brokenLines } = readGraphSource(
      "+ A -> B\n- B -> C: 語\n~ D\n+ D\n+ E\nF -> G",
    )

    expect(edges.map(({ change }) => change)).toEqual(["added", "removed", "unchanged"])
    expect(nodes.map(({ name, change }) => [name, change])).toEqual([
      ["A", "unchanged"],
      ["B", "unchanged"],
      ["C", "unchanged"],
      ["D", "changed"],
      ["E", "added"],
      ["F", "unchanged"],
      ["G", "unchanged"],
    ])
    expect(brokenLines).toEqual([4])
  })

  it("同じ節点に違う印を付けた行と、印だけの行は読めない行にする", () => {
    expect(readGraphSource("+ A\nB\n- A\n- \n+ B").brokenLines).toEqual([3, 4])
  })

  describe("行末の色の目印と点線", () => {
    it("節点・辺・群の行末の ` @a`〜` @e` を色の目印として読み、名前とラベルには含めない", () => {
      const { nodes, edges, groups, brokenLines } = readGraphSource(
        "[層] @b\nA @a\nB -> C: 渡す @c\n[]\nD @e\nD @e",
      )

      expect(nodes.map(({ name, tone }) => [name, tone])).toEqual([
        ["A", "a"],
        ["B", "none"],
        ["C", "none"],
        ["D", "e"],
      ])
      expect(edges).toEqual([
        {
          from: 1,
          to: 2,
          label: "渡す",
          change: "unchanged",
          tone: "c",
          dashed: false,
          returns: false,
        },
      ])
      expect(groups).toEqual([{ name: "層", nodes: [0, 1, 2], inner: [], tone: "b" }])
      expect(brokenLines).toEqual([])
    })

    it("-.> を点線の辺として読み、ラベルと色の目印も付けられる", () => {
      const { edges, brokenLines } = readGraphSource("A -.> B\nB -.> C: 語 @d\nC -> A")

      expect(edges.map(({ label, tone, dashed }) => [label, tone, dashed])).toEqual([
        ["", "none", true],
        ["語", "d", true],
        ["", "none", false],
      ])
      expect(brokenLines).toEqual([])
    })

    it("変更の印と色の目印は併用でき、同じ節点に違う色を付けた行は読めない行にする", () => {
      const { nodes, brokenLines } = readGraphSource("+ A @a\nA @b\nB @a\nB @a")

      expect(nodes.map(({ change, tone }) => [change, tone])).toEqual([
        ["added", "a"],
        ["unchanged", "a"],
      ])
      expect(brokenLines).toEqual([2])
    })

    it.each([
      ["a〜e の外", "A @f"],
      ["名前の中の ` @`", "A @a -> B"],
      ["ラベルの中の ` @`", "A -> B: 語 @a 語"],
      ["閉じの行の目印", "[甲]\nA\n[] @a"],
    ])("%s は読めない行にする", (_, source) => {
      expect(readGraphSource(source).brokenLines.length).toBeGreaterThan(0)
    })
  })

  describe("戻り道", () => {
    it("`A <- B: 語` を B から A へ戻る辺として読み、ほかの矢印の辺は戻り道にしない", () => {
      const { nodes, edges, brokenLines } = readGraphSource("A -> B\nB -.> C\nA <- C: 呼び直す")

      expect(nodes.map(({ name }) => name)).toEqual(["A", "B", "C"])
      expect(
        edges.map(({ from, to, label, dashed, returns }) => [from, to, label, dashed, returns]),
      ).toEqual([
        [0, 1, "", false, false],
        [1, 2, "", true, false],
        [2, 0, "呼び直す", false, true],
      ])
      expect(brokenLines).toEqual([])
    })

    it("戻り道にも行頭の印と行末の色の目印が付く", () => {
      const { edges, brokenLines } = readGraphSource("+ A <- B: 語 @c")

      expect(edges).toEqual([
        { from: 1, to: 0, label: "語", change: "added", tone: "c", dashed: false, returns: true },
      ])
      expect(brokenLines).toEqual([])
    })

    it.each([
      ["矢印が2つ", "A <- B -> C"],
      ["端の名前が空", "A <-"],
      ["群の名の中の矢印", "[a <- b]"],
    ])("%s は読めない行にする", (_, source) => {
      expect(readGraphSource(source).brokenLines).toEqual([1])
    })
  })

  it("ラベルの中の : は壊れた行にせず、最初の : より後ろを全部ラベルにする", () => {
    const { edges, brokenLines } = readGraphSource("起動 -> 集計: 12:00 に走る")
    expect(brokenLines).toEqual([])
    expect(edges).toHaveLength(1)
    expect(edges[0]?.label).toBe("12:00 に走る")
  })

  it("節点の名前の中の : は壊れた行にする", () => {
    expect(readGraphSource("A:1 -> B").brokenLines).toEqual([1])
    expect(readGraphSource("A:1").brokenLines).toEqual([1])
  })

  describe("節点の説明", () => {
    it("節点だけの行の `名前 | 説明` を読み、前後の空白を落とす。印と目印も同じ行に付く", () => {
      const { nodes, brokenLines } = readGraphSource("+ 甲 | 甲の説明 @a\n乙\n甲 -> 乙")
      expect(brokenLines).toEqual([])
      expect(nodes.map(({ name, note, change, tone }) => [name, note, change, tone])).toEqual([
        ["甲", "甲の説明", "added", "a"],
        ["乙", "", "unchanged", "none"],
      ])
    })

    it("説明は \\n で3行まで改行でき、note は実際の改行でつなぐ", () => {
      const { nodes, brokenLines } = readGraphSource("甲 | 一行目 \\n 二行目\\n三行目")

      expect(brokenLines).toEqual([])
      expect(nodes[0]?.note).toBe("一行目\n二行目\n三行目")
    })

    it("4行以上と空の行は壊れた行にする", () => {
      const reading = readGraphSource("甲 | 一\\n二\\n三\\n四\n乙 | 一\\n\\n三")

      expect(reading.brokenLines).toEqual([1, 2])
    })

    it("説明の無い節点は note が空", () => {
      expect(readGraphSource("甲 -> 乙").nodes.map(({ note }) => note)).toEqual(["", ""])
    })

    it.each([
      ["| が2つ以上", "甲 | 一 | 二"],
      ["説明が空", "甲 |"],
      ["辺の端の名前の |", "甲 | 説明 -> 乙"],
      ["違う説明の重ね書き", "甲 | 一\n甲 | 二"],
    ])("%s は読めない行にする", (_, source) => {
      expect(readGraphSource(source).brokenLines.length).toBeGreaterThan(0)
    })
  })

  it("節点が1つも無い source は節点を持たない", () => {
    expect(readGraphSource("").nodes).toEqual([])
    expect(readGraphSource("\n \n").nodes).toEqual([])
  })
})
