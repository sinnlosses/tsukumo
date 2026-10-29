# A2UI で `report` を描く試作（2026-10-28）

ステータス: 一次情報（使い捨ての試作の記録）。本文の決定は ADR（登録したタスクが書く）が持つ。

問い: tsukumo の `report`（節・表・地の文）を A2UI v0.9 のカタログで描けるか。AI は節の数と構造の規約を守るか。
試作は `/tmp/a2ui-prototype`（再起動で消える）で動かし、動いた形をここに写した。

## 結果

| 確かめたこと                                      | 結果                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 4 部品（Report・Section・Table・Paragraph）の描画 | 実ブラウザで節 2・表 1・地の文 2 が描けた（`batch-render.png`。console にエラーなし）                   |
| 部品を 1 つずつ別メッセージで送る                 | 親が先に描かれ、届いていない子は `[Loading id...]`、届くたびに埋まった（`stream-render.png`）           |
| 子の型をスキーマで縛る                            | できない。`ComponentIdSchema` は純粋な文字列で、`children` は ID の並びしか持たない                     |
| A2UI の標準の検証が拾う誤り                       | 必須欄の欠け（`columns` 無し）は拾う。未知の部品名・Report の子が Paragraph・Section の入れ子は拾わない |
| AI（Sonnet、`claude -p`）に書かせた 12 件         | 10 件が一発で通過。節の数は 12 件すべて求めたとおり（2・3・4）。構造の規約違反は 0 件                   |
| 落ちた 2 件                                       | `version` の書き忘れ・葉の `component` の書き忘れ。検証のエラー文を返すと 2 件とも直った                |
| 例（few-shot）の有無                              | 例なし 5/6・例あり 5/6 で差は見えない（件数が少ない）                                                   |

## 使った口（`@a2ui/react` 0.14.0・`@a2ui/web_core` 0.14.0）

- 部品の定義: `{name, schema: z.object(...)}`（Zod。`CommonSchemas.ChildList` が子の ID の並び）
- React の実装: `createComponentImplementation(api, ({props, buildChild}) => ...)`。`buildChild(id)` で子を描く
- カタログ: `new Catalog(id, 'v0.9', [impls], [])`。`catalog.toJson()` が JSON Schema を返す（AI に渡す）
- 描画: `new MessageProcessor([catalog])` に `processMessages(messages)`、`<A2uiSurface surface={...}>`
- 型の注意: `A2uiSurface` に自作カタログの `MessageProcessor` を渡すと `ReactCatalogComponent` と合わず `as never` が要った
- peer の注意: `@a2ui/react` は zod ^3.25.76 を求める。tsukumo は zod 4（共存は未測定）
- node から `catalog.tsx` を読むと `HTMLElement is not defined` で落ちる（React の実装が DOM に触る）。定義だけを `api.ts` に分けた

## 部品の定義（`src/api.ts`）

```ts
import { CommonSchemas } from "@a2ui/web_core/v0_9"
import { z } from "zod"

export const ReportApi = {
  name: "Report",
  schema: z.object({
    conclusion: z.array(z.string()).describe("結論。1〜2文。読み手から見た変化を書く"),
    children: CommonSchemas.ChildList.describe("Section の ID の並び。根拠が要る数だけ置く"),
  }),
}
export const SectionApi = {
  name: "Section",
  schema: z.object({
    heading: z.string().describe("その節の結論を言う語。30字以内"),
    children: CommonSchemas.ChildList.describe("Table か Paragraph の ID の並び"),
  }),
}
export const TableApi = {
  name: "Table",
  schema: z.object({
    title: z.string().describe("何を並べた表か。1文"),
    columns: z.array(z.string()).describe("列の見出し。5つまで"),
    rows: z.array(z.array(z.string())).describe("行ごとのセル。短い語句・数にする"),
  }),
}
export const ParagraphApi = {
  name: "Paragraph",
  schema: z.object({ text: z.string().describe("地の文。1段落1話題") }),
}
export const REPORT_CATALOG_ID = "https://tsukumo.example/prototype/report-catalog/v1"
```

## React の実装（`src/catalog.tsx` の要点）

```tsx
import { createComponentImplementation } from "@a2ui/react/v0_9"
import { Catalog } from "@a2ui/web_core/v0_9"

type ChildRef = string | { id: string; basePath?: string }
const idOf = (c: ChildRef) => (typeof c === "string" ? c : c.id)

export const Section = createComponentImplementation(SectionApi, ({ props, buildChild }) => (
  <section>
    <h2>{props.heading as string}</h2>
    {(props.children as unknown as ChildRef[]).map((c) => (
      <div key={idOf(c)}>{buildChild(idOf(c))}</div>
    ))}
  </section>
))
// Report・Table・Paragraph も同じ形
export const reportCatalog = new Catalog(
  REPORT_CATALOG_ID,
  "v0.9",
  [Report, Section, Table, Paragraph],
  [],
)
```

## AI が出す想定のメッセージ（`src/messages.ts`）

```json
{"version":"v0.9","createSurface":{"surfaceId":"report","catalogId":"https://tsukumo.example/prototype/report-catalog/v1"}}
{"version":"v0.9","updateComponents":{"surfaceId":"report","components":[
  {"id":"root","component":"Report","conclusion":["…"],"children":["sec-1","sec-2"]},
  {"id":"sec-1","component":"Section","heading":"…","children":["tbl-1","p-1"]},
  {"id":"tbl-1","component":"Table","title":"…","columns":["観点","A2UI","tsukumo"],"rows":[["…","…","…"]]},
  {"id":"p-1","component":"Paragraph","text":"…"},
  {"id":"sec-2","component":"Section","heading":"…","children":["p-2"]},
  {"id":"p-2","component":"Paragraph","text":"…"}]}}
```

## 構造の検査（`validate.ts` の要点）

A2UI の `MessageProcessor.processMessages` に通したあと、受け付けた部品の一覧を自前で読む:

- `root` があり `Report` である
- `Report` の子は全部 `Section`、`Section` の子は `Table` か `Paragraph`（入れ子の `Section` は違反）
- 参照先が定義されている・どこからも参照されない部品が無い
- 節の数が求めた数と同じ・見出しが 30 字以内・表の列が 5 つ以内・結論が 1〜2 文

対照（正しい例 1・誤り 5 種）は 6 件とも想定どおり判定した。

## AI に書かせたときのプロンプト（`gen-prompt.ts` の要点）

システムプロンプト = 「JSON Lines だけを出す。1 行目 `createSurface`（surfaceId は `report`）、2 行目 `updateComponents`、ルートの id は `root`、使える部品はカタログだけ」＋ `catalog.toJson()` の JSON（約 5,400 字）。
例ありの条件はそのあとに上のメッセージを 1 例添えた（約 6,300 字）。
依頼 = 「A2UI と tsukumo の report の違いを比べる報告を、節をちょうど n つにして書いて。少なくとも 1 つの節に表を入れる」＋材料の箇条書き 5 行。
呼び出し: `claude -p --model sonnet --tools "" --disable-slash-commands --setting-sources "" --strict-mcp-config --no-session-persistence --system-prompt "$(cat prompts/A.txt)" "$(cat prompts/user-3.txt)"`。
再試行は、前回の出力と `VALIDATION_FAILED` のエラー文を依頼に足して同じ呼び出し。

## 限界

- 部品は 4 つだけ。本番の `report`（`checks`・`keyFigures`・`claims`・図の部品）を足したときの通過率は未測定
- 1 題材・Sonnet だけ・12 件。例の有無の差は言えない
- Agent SDK が tool 引数の途中経過を流すか（段階描画に使えるか）は未測定
- 出典: [a2ui.org](https://a2ui.org/)・[メッセージ仕様](https://a2ui.org/reference/messages/)・[v0.9 仕様](https://a2ui.org/specification/v0.9-a2ui/)・[リポジトリ](https://github.com/google/A2UI)
