# 委譲先が `phase_result` を呼べなかった原因の切り分け（2026-11-05）

ワークフロースクリプト（`task-flow`）の委譲先が、段の終わりに呼ぶ `mcp__tsukumo__phase_result` を呼べなかった件の調査。

## 結論

原因は候補 3「今回のセッションが tsukumo の会話画面を経由せず、MCP サーバ自体が繋がっていなかった」に確定する。
`phase_result` を持つ MCP サーバ `tsukumo` は、tsukumo の会話画面が Agent SDK の `query()` に渡すプロセス内のサーバで、素の `claude` の CLI には存在しない。委譲先に渡し損ねたのではなく、渡す元がなかった。
素の CLI の委譲先2種（`no-delegate`・`general-purpose`）とメインでは `ToolSearch` で実際に出なかった。tsukumo の会話画面経由では、委譲先2種のどちらにも `mcp__tsukumo__phase_result` が見えることを 2026-11-05 にメインが実測した（事実 4）。
素の CLI で `/loop /next-task` を回すと、委譲先は `phase_result` を呼べず、自由文の返却で進む。

## 事実

試した操作と出力。

1. `phase_result` の定義と公開の場所を読んだ。
   - 名前は `src/server/core/tsukumo-tool-name.ts` の `PHASE_RESULT_TOOL_NAME`（`phase_result`）。サーバ名は `TSUKUMO_MCP_SERVER_NAME`（`tsukumo`）で、モデルからは `mcp__tsukumo__phase_result` に見える。コメントは「載るのは仕事のときだけ」。
   - ツール本体は `src/server/session-driver/adapter/sdk/sdk-work-tool.ts`。サーバは `sdk-tool.ts` の `createSdkMcpServer`（プロセス内のサーバ）で作り、`sdk-driver.ts` の `mcpServers` に載せて `query()` へ渡す。
   - リポジトリ内で `mcpServers` を持つのは `sdk-driver.ts`（会話）、`sdk-diary.ts`（日記）、`sdk-structured-query.ts`（空）、`src/server/usage/adapter/review/sdk-usage-review-option.ts`（88・112 行目。tsukumo サーバを載せるが、道具は `speak` と usage-review のものだけで `phase_result` は無い）の4ファイル。`.mcp.json` は無い。`phase_result` を外部の MCP サーバとして公開する経路は見つからない。
2. このセッション（この調査の実装役）の環境を見た。
   - `CLAUDE_CODE_ENTRYPOINT=cli`。`ORCA_*`・`CLAUDE_CODE_*` の環境変数はあるが、tsukumo の会話画面に由来する変数は無い。
   - ツール一覧に `mcp__tsukumo__*` は無い。`ToolSearch` で `select:mcp__tsukumo__phase_result` を引くと `No matching deferred tools found`。
   - ここは `tsukumo-workflow:no-delegate` の委譲先として起こされたセッションで、報告された症状と同じ。
3. 3か所のうち実測できたもの。いずれも `ToolSearch` で `select:mcp__tsukumo__phase_result` を引いた結果。
   - `no-delegate` の委譲先（この調査の実装役）: `No matching deferred tools found`。差し戻しの直しでも同じ結果を再度確認した。
   - `general-purpose` の委譲先（受け入れ役。`CLAUDE_CODE_ENTRYPOINT=cli`）: `No matching deferred tools found`。受け入れ役の報告による。
   - メイン（2026-11-05 にメインが自分で打った）: `ToolSearch select:mcp__tsukumo__phase_result` は `No matching deferred tools found`。このセッションのツール一覧にも `mcp__tsukumo__speak`・`work_plan` は無い。委譲先の2種と同じで、素の CLI ではメインにも出ない。
     委譲先の2種は素の CLI で、どちらも出なかった。種別による差は見えない。
4. tsukumo の会話画面経由で `phase_result` が見えるかを、2026-11-05 にメインが実測した。会話画面から `/next-task` の流れで `tsukumo-workflow:no-delegate` と `general-purpose` の委譲先をそれぞれ読むだけの用事で起こし、`ToolSearch` で `select:mcp__tsukumo__phase_result` を引かせると、どちらの委譲先でも見つかった。`+tsukumo` で引くと `phase_result`・`report`・`report_part_card`・`speak`・`work_plan`・`question_brief` の6件が出た。委譲先の `printenv CLAUDE_CODE_ENTRYPOINT` は両方とも `sdk-ts`（素の CLI の調査では `cli`）。

## 推測

- 事実 1 から、`mcp__tsukumo__*` が見えるのは tsukumo の会話画面が起こした `query()` の中に限られる。素の `claude` CLI で `/loop /next-task` を回すと、メインにも委譲先にも出ない。報告にある「メインでも `work_plan`・`speak` が無かった」はこれと合う。
- 会話画面経由で委譲先に渡ることは、事実 4 で 2026-11-05 に実測済み（推測のままではない）。エージェント定義 `no-delegate` は `disallowedTools: Agent` だけで MCP を絞っていないことも、事実 4 と合う。

## 足りない実験

- 済み。tsukumo の会話画面から `/next-task` を回し、`no-delegate` と `general-purpose` の委譲先に `ToolSearch` で `mcp__tsukumo__phase_result` を引かせた結果は事実 4 にある（2026-11-05 に実測済み）。会話画面経由で出たので候補 3 で確定し、この実験はやり直さない。
- 素の CLI で回したメインの `ToolSearch` で同じ名前を引く（候補 3 の確認。メインは事実 3 で実測済みで出なかった）。これも済み。

## 直し方の案

直しは実装を伴うので別のタスクにする。候補 3 が確定した場合の案。

- tsukumo-plugins の `task-flow.js` と `no-delegate` の側で、`phase_result` が使えない環境（素の CLI）では呼ばずに、自由文の返却だけで進めてよいと明記する。または環境を先に判定して、会話画面の外では `/next-task` の自動進行をしない旨を案内する。直す先は tsukumo-plugins（難易度 sonnet）。
- 利用者の起動の仕方: `/loop /next-task` は tsukumo の会話画面で回す。案内先は `docs/architecture/workflow-contract/port-and-return.md`。
