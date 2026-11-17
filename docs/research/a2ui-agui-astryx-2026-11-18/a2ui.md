# A2UI の仕様調査（2026-11-18）

入口は `docs/research/a2ui-agui-astryx-2026-11-18/index.md`（調べた日・方法・出典の略記・版の注意・要約）。

## 2. A2UI

### 2.1 版

| 対象                           | 版・状態（表示のまま）                                                                       | 出典                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 仕様 v1.0                      | "Version: 1.0 · Status: Current"。原稿は "Created: Nov 20, 2025 / Last Updated: Jun 8, 2026" | `https://a2ui.org/specification/v1.0-a2ui/`、`[a2ui]/specification/v1_0/docs/a2ui_protocol.md` 冒頭                                 |
| 仕様 v0.9                      | "Version: 0.9 / Status: Closed"                                                              | `[a2ui]/specification/v0_9/docs/a2ui_protocol.md` 冒頭                                                                              |
| 版の一覧                       | v1.0 `current`、v0.9.1 `previous`、v0.9 `previous`、v0.8 `deprecated`                        | `[a2ui]/specification/versions.json`                                                                                                |
| npm `@a2ui/web_core`           | 最新 0.15.0（2026-11-02）。0.14.0 は 2026-10-17                                              | `npm view @a2ui/web_core time`                                                                                                      |
| npm `@a2ui/react`              | 最新 0.15.0（2026-11-02）。exports は `.`・`./v0_8`・`./v0_9`・`./styles` で `./v1_0` は無い | `npm view @a2ui/react exports`                                                                                                      |
| npm `@a2ui/agent`（Agent SDK） | 0.1.0（2026-11-02）。依存 `antlr4ng`・`@a2ui/web_core ^0.15.0`、展開後 2,050,142 B           | `npm view @a2ui/agent`                                                                                                              |
| 手元                           | `@a2ui/web_core` 0.14.0・`@a2ui/react` 0.14.0（Apache-2.0）。tsukumo は `v0_9` を使用        | `nm/@a2ui/web_core/package.json`、`nm/@a2ui/react/package.json`、`package.json`、`src/browser/features/report/a2ui-surface.tsx:109` |

- 手元の web_core は `./v0_8`・`./v0_9`・`./v1_0`・`./catalogs/basic/v1` などを exports し、`SpecVersion` は `v0.8`／`v0.9`／`v0.9.1`／`v1.0` を持つ（`nm/@a2ui/web_core/package.json`、`nm/@a2ui/web_core/src/spec_versions.d.ts:5–8`）。
- **手元の `v1_0` スキーマは現行仕様より古い断面**。手元は `version: "v1.0"` と素の `catalogId`／`accessibility`／`metadata`／`checks`、main の仕様は `"1.0"` と `@catalogId`／`@accessibility`／`@metadata`／`@checks`。web_core 0.15.0 で wire の版を `'1.0'` に統一（`'v1.0'` も受理）、`@` 付き封筒キーの出力は CHANGELOG の Unreleased（`nm/@a2ui/web_core/src/v1_0/schemas/`、`[a2ui]/typescript/core/web_core/CHANGELOG.md`）。
- `@a2ui/react` の README は新規案件に v0.9 を推奨（"For new projects, it is recommended to use the **v0.9** protocol."。`nm/@a2ui/react/README.md:22`）。
- `@a2ui/react` のルートは 0.13.0 から "version-agnostic renderer runtime" で、0.14.0 の CHANGELOG には (v1_0) の項目（既定カタログを持たない面の描画）がある。専用の `./v1_0` 入口は無く、手元の chunk は `@a2ui/web_core/v0_9` から import する（`nm/@a2ui/react/CHANGELOG.md:3–13`、`nm/@a2ui/react/chunk-QAAGXJWH.js:2–4`）。v1.0 の面を React で描く実用性は未検証。
- 解釈: tsukumo は当面 v0.9 を維持し、v1.0 の概念（`userMessage`・`requiresUserActivation`・`allowedParents`）は自前のカタログと検証の層で先取りするのが安全。

**v0.9（v0.9.1）→ v1.0 の差分**（`https://a2ui.org/specification/v1.0-evolution-guide/`、原稿 `[a2ui]/specification/v1_0/docs/evolution_guide.md`。手元のスキーマでも確認）

- 双方向の関数呼び出し: agent→renderer に `callRendererFunction`／`agentFunctionResponse`、renderer→agent に `callAgentFunction`／`rendererFunctionResponse`（`nm/@a2ui/web_core/src/v1_0/schemas/agent_to_renderer.json`、`renderer_to_agent.json:56,75`）。
- `createSurface` が `components`・`dataModel` を同梱可能、`catalogId` は任意、`theme` は廃止（v1.0 の `createSurface` に `theme` があると不正）。
- 予約接頭辞 `@`: `@path`（バインド）、`@call`（関数）、`@index`。`@@` でエスケープ（`common_types.json:107,219,234–235`）。
- `Action.event.userMessage` の追加（`common_types.json:316–319`、`renderer_to_agent.json:21–24`）。`updateDataModel.value` は必須（`null` で削除）。
- カタログ定義: 複数カタログの混在、`instructions`（`rules.txt` の後継）、`allowedParents`／`allowedChildren`、関数の `allowedCallers`・`requiresUserActivation`・`returnType`（`catalog_definition.json:46,134,140,173,181`）。
- 名称の変更: client→renderer、server→agent（`server_to_client.json` → `agent_to_renderer.json` など）。MIME は `application/a2ui+json`。
- v0.9 のカタログは v1.0 のランタイムで直接は利用不可（evolution guide）。

### 2.2 メッセージ

**v0.9（手元で使用中）**

| 向き          | メッセージ         | 要点                                                                                                                                                          | 出典                                                             |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| server→client | `createSurface`    | `surfaceId`・`catalogId`（必須）・`theme`・`sendDataModel`                                                                                                    | `nm/@a2ui/web_core/src/v0_9/schemas/server_to_client.json:20–45` |
| server→client | `updateComponents` | `components`（1 件以上）。"This message can be sent multiple times to update the component tree of an existing surface." いずれかの一覧に `id: "root"` が必須 | 同 `:54–75`（56 行）                                             |
| server→client | `updateDataModel`  | `path`・`value`（省略で削除）                                                                                                                                 | 同 `:84–105`                                                     |
| server→client | `deleteSurface`    | `surfaceId`                                                                                                                                                   | 同 `:114–127`                                                    |
| client→server | `action`           | `name`・`surfaceId`・`sourceComponentId`・`timestamp`・`context`（全て必須）                                                                                  | `nm/@a2ui/web_core/src/v0_9/schemas/client_to_server.json:38`    |
| client→server | `error`            | `VALIDATION_FAILED`（`path`・`message`）ほか                                                                                                                  | 同 `:63,84`                                                      |

- 部品は平坦な隣接リスト。共通部は `id`・`accessibility` のみ。子は ID の配列か、テンプレート `{componentId, path}`（"A template for generating a dynamic list of children from a data model list."）（`nm/@a2ui/web_core/src/v0_9/schemas/common_types.json:37–58`）。
- v1.0 は agent→renderer が 6 種、renderer→agent は `action`（`userMessage`・`metadata` を追加）・`callAgentFunction`・`rendererFunctionResponse`・`error`（`VALIDATION_FAILED`／`UNALLOWED_PARENT`／`UNALLOWED_CHILD`）（`renderer_to_agent.json:86`）。
- トランスポート: v1.0 は "**AG-UI** is the standard transport binding for Agent-to-User Interaction."、ほかに A2A・MCP（"can be carried over MCP tool calls, tool outputs, or resource subscriptions"）・SSE+JSON-RPC・WebSockets・REST。"End of agent turn is signaled by transport layer." 契約は順序保証付きの配送・メッセージの枠・メタデータ（双方向は任意）（`[a2ui]/specification/v1_0/docs/a2ui_protocol.md` の 31 行・102 行と Transport の節。v0.9 では AG UI は "also an excellent transport option"）。

### 2.3 段階描画

**仕様の記述**

1. "Because components may reference children or data bindings that do not yet exist, renderers should handle missing references gracefully by rendering placeholders (progressive rendering)."（v1.0 の `updateComponents` の節、223 行。v0.9 は同趣旨で 209 行: "… clients should handle this gracefully by rendering placeholders (progressive rendering)."）
2. "This model allows the agent to send component definitions in any order. Rendering can begin as soon as the `root` component is defined, with the renderer filling in or updating the rest of the tree progressively as additional definitions arrive."（v1.0、785 行）
3. "Until that component is defined, other component updates will have no visible effect, and they will be buffered until a root component is defined. Once a root component is defined, the renderer is responsible for rendering the tree in the best way possible based on the available data, skipping invalid references."（v1.0、787 行。v0.9 は 329–331 行）
4. "During the initial streaming phase, data paths may resolve to `undefined` … Renderers should handle `undefined` values gracefully (e.g., by treating them as empty strings or showing a loading indicator)"（v0.9、409 行）
5. 関数の非同期評価（v1.0）: renderer は "maintains a pending/loading state for the affected component binding (e.g., displaying a loading indicator or preserving existing component values) while awaiting `agentFunctionResponse`"

出典: `[a2ui]/specification/v1_0/docs/a2ui_protocol.md`、`[a2ui]/specification/v0_9/docs/a2ui_protocol.md`

**仕様に無いもの**: 「スケルトン」「進捗（何件中何件）」に当たる概念・メッセージ・プロパティは、仕様本文とスキーマに無い（語は placeholder と loading indicator のみ）。部品 1 個の途中（未完の JSON）を送る規定もワイヤ仕様には無く、後述の Agent SDK の層が扱う。

**レンダラの層（実装の事実）**

- `NodeResolver`: "not-yet-arrived components appear as placeholder nodes and are upgraded in place"。ノードの状態は `resolved`／`pending`／`unknown-type`／`cyclic`、`PLACEHOLDER_TYPE = "Placeholder"`（`nm/@a2ui/web_core/src/resolution/node-resolver.d.ts:5–13`、`component-node.d.ts:6,15,78`）。
- `@a2ui/react` 0.14.0: 未着ノードは固定の `<div style={{color:"gray",padding:"4px"}}>[Loading {componentId}...]</div>`（`nm/@a2ui/react/chunk-QAAGXJWH.js:224–228`、適用は `:347–366`）。根が無い間は `LoadingPlaceholder componentId="root"`（`:413–456`、450 行）。未知の型は赤字の "Unknown component type: X"（`:349–353`）。差し替え口は無い（`A2uiSurface` の props は `surface` のみ: `nm/@a2ui/react/index.d.ts:60–62`）。
- 0.11.0 の CHANGELOG: "When a late child arrives, its parent re-renders once as the placeholder is replaced"、"The first render shows the loading state even for an already populated surface"（`nm/@a2ui/react/CHANGELOG.md`）。
- `@a2ui/react` 0.15.0（未導入）: "**BREAKING CHANGE**: `A2uiSurface` no longer renders debug placeholders. A component that has not arrived, has an unknown type, or repeats one of its ancestors renders nothing, as does the surface until its root arrives … Apps that showed users the old placeholder should render their own loading state until the fallback API from #2013 lands."（`[a2ui]/typescript/renderers/react/CHANGELOG.md` の 0.15.0）
- **fallbacks（blueprint §4.4）**: issue #2013 "Renderers all handle missing components poorly, which makes streaming UX bad"（2026-07-16 起票・open）を受け、PR #3756（2026-11-03 マージ）で仕様化。

  ```typescript
  interface A2uiFallbacks<V> {
    pending?: (info: A2uiPendingInfo) => V | null | undefined
    error?: (info: A2uiErrorInfo) => V | null | undefined
  }
  interface A2uiPendingInfo {
    componentId: string
    parentComponentType?: string
  }
  interface A2uiErrorInfo {
    componentId: string
    parentComponentType?: string
    error: A2uiFallbackError
  }
  // React: <A2uiSurface surface={surface} fallbacks={{pending: info => ..., error: info => ...}} />
  ```

  - 既定は「何も描かない」で、"no layout footprint"（"It gets no size, no gap, no flex or weight share, and no part in `justify` distribution."）。fallback は当該ノードの枠に描かれ、実物の到着でその場置換。
  - "**No built-in timing.** Adapters do not delay fallbacks."（遅延表示は fallback 側の責務。`parentComponentType` に応じた遅延を想定）
  - "Not in this version": **Boundaries**（"letting one fallback replace a whole ancestor subtree (for example a Card)"）、`error.message`、回復操作、遅延の補助。
  - 2026-11-18 時点で main の `A2uiSurface` は `React.FC<{ surface: … }>` のままで `fallbacks` は未実装（`[a2ui]/typescript/renderers/react/src/A2uiSurface.tsx:39–40`）。
  - 出典: `[a2ui]/blueprints/modules/a2ui_framework_adapter.blueprint.md`（§4.4 は 329–404 行、§6 は 452 行付近）、`https://github.com/a2ui-project/a2ui/issues/2013`

**Agent SDK の層（書き手の出力 → ワイヤ）**

- 推論形式は Express（`<a2ui>…</a2ui>`、既定）と Direct JSON（`<a2ui-json>…</a2ui-json>`、"with Markdown fence stripping and incremental string healing"）（`[a2ui]/docs/site/src/content/docs/concepts/inference-formats.mdx`）。
- "Incremental stream compilation and validation: … chunked streaming (`openStream` / `open_stream`) … heal in-progress string literals on configured `progressiveKeys` (such as `"text"`), emit incremental wire deltas as statements arrive, and validate every message against `RendererState`"（同上）
- **Progressive String Healing**: "…the stream heals the unclosed string literal and parentheses on a scratch copy and emits the updated component or data path value immediately. The healed value is always a string prefix of the final value, and the full value replaces it when the string closes. … URL prefixes (`http://`, `https://`, `data:`) are never closed early." 既定は Express が `{"text"}`、Direct JSON は空（"Empty turns healing off"）。ほかに "Pre-`root` Gating on New Surfaces"、"Forward component ID references … emit immediately using the variable name as the provisional ID"（`[a2ui]/blueprints/modules/a2ui_agent.blueprint.md`）。
- 統合ガイド: "the stream reader closes partial string properties such as `text` incrementally as tokens arrive, updates the session state, and yields … messages as soon as they are ready"（`[a2ui]/docs/site/src/content/docs/guides/agent-integration.mdx` 173 行）
- エージェント兼レンダラのアプリ向けに `RendererState.of(processor)`・`StreamedAnswer` を定める blueprint がある（`[a2ui]/blueprints/features/agent_renderer_app.blueprint.md`、date_added 2026-10-28）。

**tsukumo の現状との対応**

- 引数の断片から部品が閉じる度に `report-draft-component` を送出（`src/server/report/core/body/draft-component-intake.ts:1–6`、`docs/architecture/adr/0040-report-staged-drawing.md`）。仕様の「部品単位の段階描画」に相当し、部品の途中の値は未送出。
- 草稿は根の `Report` から到達可能な部品のみを描画し、内容部品が 0 件の `Section` は描画しない（`src/browser/domain/main-view/a2ui-draft-view.ts:35–58`）。仕様の「根の定義まで保留」「不正な参照は省略」と同じ方向。
- `Report.children`（`Section` の ID）と `Section.children`（内容部品・配置部品の ID）は必須の配列（`src/shared/report/a2ui-report-catalog.ts:177–219`）。親の到着時点で子の数が確定する。
- 面への追加は `addMissingComponents` が `updateComponents` を逐次適用（`src/browser/features/report/a2ui-surface-model.ts:57–74`）。描画は `buildChild` を使わず根の実装が一覧を辿る（`src/browser/features/report/a2ui-surface.tsx:3–4,97`）ため、`@a2ui/react` の placeholder は根の初回描画以外では出現しない。骨組みは tsukumo 側の責務。

### 2.4 配置

**基本カタログ（v0.9。18 部品・14 関数）の配置関連**（`nm/@a2ui/web_core/src/v0_9/schemas/catalogs/basic/catalog.json`）

| 部品・プロパティ | 要点                                                                                                                                                                                                                     | 行        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `Row`            | `children`、`justify`（start／center／end／spaceBetween／spaceAround／spaceEvenly／stretch。既定 start）、`align`（start／center／end／stretch。既定 stretch）。"To create a grid layout, nest Columns within this Row." | 237–282   |
| `Column`         | `Row` と同じ組（縦方向）                                                                                                                                                                                                 | 283–328   |
| `List`           | `direction`（vertical／horizontal）、`align`。実装ガイドは "A scrollable list of components."                                                                                                                            | 329–365   |
| `Card`           | `child` は 1 個（複数は配置部品で包む）                                                                                                                                                                                  | 366–390   |
| `Tabs`           | `tabs[{title, child}]`                                                                                                                                                                                                   | 391–431   |
| `Modal`          | `trigger`・`content`                                                                                                                                                                                                     | 432–460   |
| `Divider`        | `axis`                                                                                                                                                                                                                   | 461–487   |
| `weight`         | "similar to the CSS 'flex-grow' property … may ONLY be set when the component is a direct descendant of a Row or Column"                                                                                                 | 1249–1254 |
| `theme`          | `primaryColor`・`iconUrl`・`agentDisplayName`                                                                                                                                                                            | 1255–1274 |

- **無いもの**: Grid、折り返し（wrap）、gap、span、padding／margin のプロパティ、幅に応じた切り替え。部品共通の配置プロパティは `weight` のみ。
- 余白の考え方（実装ガイド §3 "Layout Spacing: Margins and Padding"）: "Leaf-Margin Strategy"。"Invisible Containers have ZERO Spacing"（`Row`・`Column`・`List` は内外の余白なし）、"Leaf Components carry the Margin"（例 `8dp`）、輪郭を持つ入れ物（`Card`・`Button` など）も同じ外側の margin（`[a2ui]/catalogs/basic/v1/basic_catalog_implementation_guide.md` 339–351 行）。`Row` は "Ensure it fills the available width."（同 81 行）。
- v1.0 も同じ 18 部品・14 関数。`allowedParents`／`allowedChildren`（`"Surface"` を含む）で合成の制約を宣言でき、違反は `UNALLOWED_PARENT`／`UNALLOWED_CHILD`。カタログの `instructions` で書き手向けの指示を同梱（`nm/@a2ui/web_core/src/v1_0/schemas/catalog_definition.json:46,173,181`）。
- 公式の他カタログは `catalogs/mcp/v1`（`McpApp`）と `catalogs/vegachart/v1`（`VegaChart`）で、配置を拡張した公式カタログは無い（`[a2ui]/catalogs/`）。ロードマップには "declaratively-described primitives"・"runtime templating engine" が未提供の項目として載る（`[a2ui]/docs/site/src/content/docs/roadmap.mdx`）。

**tsukumo の現状**: 自前カタログ（根の `Report`・`Section`・内容部品）に基本の `Row`／`Column`／`Card`／`Tabs`／`ChoicePicker`（のち `Divider`・自前の `Quote`）を加え、入れ子は最大 3（`docs/architecture/adr/0039-report-via-a2ui-catalog.md`）。`src/shared/report/a2ui-report-catalog.ts` に `weight` の語は無い（grep）。

### 2.5 操作

- 2 系統: "Actions can either trigger an event sent to the agent or execute a local renderer-side function."（`[a2ui]/specification/v1_0/docs/a2ui_protocol.md` の Defining actions）

|        | Event（`action.event`）                             | Function（`action.functionCall`）                  |
| ------ | --------------------------------------------------- | -------------------------------------------------- |
| 役割   | "Prompts the agent to process intent and update UI" | "Triggers specific logic on the renderer or agent" |
| ターン | "Starts a new agent conversation turn"              | "Runs without starting an agent turn"              |
| 結果   | エージェントの応答                                  | "A typed return value, or a local side effect"     |

出典: `[a2ui]/docs/site/src/content/docs/concepts/actions-and-functions.mdx`（"Use an event when the agent needs to decide what happens next…"）

- v0.9: `Action` は `{event:{name, context}}` か `{functionCall}`（`nm/@a2ui/web_core/src/v0_9/schemas/common_types.json`）。v0.9.1 の注記: "`action.event` does not support `userMessage`, and `action.functionCall` uses `"call"` … and executes only locally on the renderer"（actions-and-functions.mdx）。
- v1.0 の `event`: "requires a `name` and supports an optional `userMessage` (`DynamicString`, resolved by the renderer into a human-readable string in the outbound `action` message) and an optional `context`"。送出側の `action.userMessage` は "A human-readable message describing the action performed by the user, resolved from `action.event.userMessage`."、概念文書では "… suitable for adding to LLM conversation history."（`[a2ui]/docs/site/src/content/docs/concepts/messages.mdx`、`nm/@a2ui/web_core/src/v1_0/schemas/renderer_to_agent.json:21–24`）
- `requiresUserActivation: true` の関数は "MUST only execute when triggered by an active user gesture"。前例は `openUrl`（`nm/@a2ui/web_core/src/v1_0/schemas/catalogs/basic/catalog.json:1002–1035`）。経緯は `[a2ui]/specification/proposals/user_initiated_functions.md`（Status: Draft、2026-08-05）。
- `allowedCallers`: `rendererOnly`（既定）／`agentOnly`／`rendererOrAgent`（`catalog_definition.json:134`）。
- `sendDataModel`: "the renderer will send the full data model of this surface in the metadata of every message sent to the agent"（`createSurface`。v0.9 は `server_to_client.json:36`）。

**手元 0.14.0 の API**

- `SurfaceModel.onAction: EventSource<ActionPayload>`、`ActionPayload{name, surfaceId, sourceComponentId, timestamp, context, catalogId?, userMessage?}`（`nm/@a2ui/web_core/src/state/surface-model.d.ts:6–26,91`）。"Local function actions (`functionCall`) are executed locally and are not emitted as agent actions."（同 `:172–173`）
- `new MessageProcessor(catalogs, actionHandler?, options?)`（`nm/@a2ui/web_core/src/processing/message-processor.d.ts:91`）。
- `createFunctionImplementation({name, returnType, schema, allowedCallers?, requiresUserActivation?}, execute)`（`nm/@a2ui/web_core/src/catalog/types.d.ts:86–93`）。0.12.0 で `functionCall` は局所実行に統一、0.13.0 で `openUrl` に `requiresUserActivation` を強制（`nm/@a2ui/web_core/CHANGELOG.md`）。
- 関数定義の例（`trim`・`getScreenResolution`）と `allowedCallers` の意味は `[a2ui]/specification/v1_0/docs/a2ui_custom_functions.md`。

**tsukumo の現状**: カタログは `new Catalog(apis.id, "v0.9", implementations, [])` で、A2UI のカタログ関数は未登録（`src/browser/features/report/a2ui-surface.tsx:109`。`expr`・`format` は `src/shared/report/report-expression-*.ts` 側の自前評価と見える。詳細は未読）。ADR 0039 は関数呼び出しを除外し、ADR 0048 の `expr`・`format` のみ許可。「次の一手」は書き手が書かず `Options`・`Claims`・`sessionRemaining`・`task.outcome` から導出し、押下で `port.appendDraft(draft)`（送信しない）（`src/browser/features/report/leaf/next-step-row.tsx:68,97`、`domain/next-step-plan.ts:59–129`、`reply-port.ts`）。

### 2.6 拡張点（`@a2ui/react` 0.14.0）

| 拡張点                 | 可否と方法                                                                                                                                                                                                                                                                                                                                                                                               | 出典                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 独自部品               | `createComponentImplementation(api, RenderComponent)`。props は `{props, buildChild, context}`。`createBinderlessComponentImplementation` もある                                                                                                                                                                                                                                                         | `nm/@a2ui/react/index.d.ts:67,71`、`nm/@a2ui/react/README.md`                                                                                                                                    |
| 独自カタログ           | `new Catalog(id, 'v0.9', [components], [functions])`。0.14.0 から `Catalog.fromJson`／`toJson`・カタログ間の `$ref`                                                                                                                                                                                                                                                                                      | `nm/@a2ui/react/README.md`、`nm/@a2ui/web_core/CHANGELOG.md`（0.14.0）                                                                                                                           |
| 独自関数               | `createFunctionImplementation(...)` をカタログの関数の列へ登録                                                                                                                                                                                                                                                                                                                                           | `nm/@a2ui/web_core/src/catalog/types.d.ts:86–93`                                                                                                                                                 |
| テーマ                 | v0.9 は `createSurface.theme`（3 項目）と CSS カスタムプロパティ `--a2ui-*`、`@a2ui/react/styles`。0.13.0 から基本カタログの React 実装は廃止され W3C Custom Elements（`@a2ui/web_core/v0_9/basic_catalog`）になり、全てのカタログ部品がカスタム要素（`<a2ui-react-<name>>`、`display: contents`）の内側に描画される（基本カタログはサーバー描画不可）。基本カタログの要素の class は `a2ui-` 接頭辞付き | `[a2ui]/docs/site/src/content/docs/guides/client-integration.mdx`、`nm/@a2ui/react/chunk-QAAGXJWH.js:98–143`、`nm/@a2ui/react/CHANGELOG.md:14–16`（0.13.0）、`nm/@a2ui/web_core/CHANGELOG.md:33` |
| placeholder の差し替え | **不可**（固定の `[Loading id...]`）。0.15.0 は無描画、`fallbacks` は仕様のみ                                                                                                                                                                                                                                                                                                                            | 2.3 を参照                                                                                                                                                                                       |
| ストリーミング中の更新 | `MessageProcessor.processMessages([...])` を逐次呼ぶ（非同期版 `processMessagesAsync`）。`NodeResolver` が placeholder ノードをその場で昇格                                                                                                                                                                                                                                                              | `nm/@a2ui/web_core/src/processing/message-processor.d.ts:199,207`、`resolution/node-resolver.d.ts:5–13`                                                                                          |
| Markdown               | `MarkdownContext`・`useMarkdownRenderer`                                                                                                                                                                                                                                                                                                                                                                 | `nm/@a2ui/react/index.d.ts`                                                                                                                                                                      |
