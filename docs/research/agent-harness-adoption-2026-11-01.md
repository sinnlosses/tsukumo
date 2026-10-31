# 自前のタスク運用を既製のエージェントハーネスに乗り換えるか（2026-11-01）

状態: 調査メモ。乗り換えるかは決めていない。

**この文書は調査メモであって正典ではない。** 自前のタスク運用（`tsukumo-workflow`: Beads・`tw`・`/next-task` と
`task-workflow` の委譲 → 受け入れ → 振り返り → 送り出し）を、外の有力なハーネスの仕組みに乗り換えられるかを調べた。
調べ方: 3体のサブエージェントが、Anthropic の純正の仕組み・Claude Code の上に乗る流れの層・汎用の枠組みと耐久実行と規格の3群を、
一次情報（公式文書・GitHub の README とリリース・CHANGELOG・`gh api` の星と版）で確かめ、その報告を突き合わせた。
星と版はすべて 2026-11-01 に取った値。会話の実物・transcript は読んでいない。流れの形を決めた前の調査は `docs/research/harness-strategy.md`（2026-10-17）。

## 要約

- **9つの機能（置き場・着手の排他・段ごとの委譲とモデル選択・独立した受け入れ・振り返り・送り出しと関門・worktree・観測・再開）を1つで覆う既製品は無い。**
  どの候補でも、GitHub と同期するタスクの置き場・着手の排他・振り返りのドラフト・main への fast-forward の関門は自前で残る
- **推すのは Claude Code 本体の dynamic workflows（`Workflow` ツール）をオーケストレーターに据え、Beads と `tw` の置き場・排他・送り出しは残す形。**
  - 置き換わるのは `task-workflow` と並びの段のスキル4件（Markdown 約1,300行・Python 190行）。`tw` の Python 約1.18万行の大半は残る
  - 実行エンジンが Claude Code のままで、Agent SDK のセッションからも呼べ、サブスクリプションの枠から引かれる。ロックインが最も小さい
  - 受け入れの差し戻しの輪を、スキルの文章ではなくコードで決定的に書ける（`while (!verdict.accepted)`）。段ごとの `model`・`agentType`・`schema` も agent ごとに指定できる
- **採らないもの**: 汎用の枠組み（LangGraph・OpenAI Agents SDK・Google ADK など）は Claude Code の輪を自前の輪で置き換え、hooks・skills・plugins とサブスクリプションを手放すことになる。
  Temporal の Claude 用プラグインは Python 限定の先行版で、会話を履歴に写す。Archon・Gas City・盤型のアプリは自分で Claude Code を起こすので tsukumo の口が届かず、tsukumo と同じ層を取り合う。ホスト型はコードと会話が外へ出る
- **乗る前に確かめることが4つある**（6章）。とくに、ワークフローの agent に hook が掛かるかと、tsukumo の `phase_result` を呼べるか。どちらかが駄目なら、帯の進め方か関門の置き場を組み替える必要がある

## 1. 乗り換え先が覆うべき機能

自前の機能と、それを持っている場所。tsukumo の core が見るのは 10 の契約だけ（`docs/architecture/workflow-contract.md`）。

| #   | 機能                       | 自前で持っている場所                                                                                      |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | タスクの置き場と同期       | Beads（`bd` 1.3.x、dolt 裏）と `tw` の GitHub Issue・Project 同期                                         |
| 2   | 着手の排他                 | `tw claim` の着手の印。作業ツリーは orca が用意する（`docs/architecture/adr/0003-orca-owns-worktree.md`） |
| 3   | 計画                       | 計画の段を Beads に書く（`tw plan-phases`）                                                               |
| 4   | 段ごとの委譲とモデルの選択 | `implement-step`。difficulty からモデルを選び、委譲先が `phase_result` で返す                             |
| 5   | 独立した受け入れ           | `accept-step` と受け入れ役（Opus 固定・読み取り専用）                                                     |
| 6   | 振り返りの学習             | `retrospect-step` と `retrospect`（改善候補をドラフトの課題として積む）                                   |
| 7   | 送り出しと関門             | `ship-step`（`tw finish`）、hook（`tw commit-guard`・`tw handback-guard`・`tw ask-guard`）                |
| 8   | 計測                       | `tw lap-hook`・`tw metrics`                                                                               |
| 9   | 中断からの再開             | 止まった段の位置を Beads に残す                                                                           |
| 10  | tsukumo との契約           | `work_plan`・`phase_result`・`report` の口、Beads の欄、設定コマンド                                      |

規模（`vendor/tsukumo-plugins`、テストを除く）: Python 15,637 行、Markdown 4,037 行、スキル 13 件。Python の内訳は `task-model`（`tw` の本体）11,787 行・`retrospect` 1,678 行・`comment-audit` 206 行・`task-workflow` 190 行・`plan-tasks` 111 行。

## 2. 候補の全体

### 2.1 Anthropic の純正の仕組み

| 仕組み                                                                                                | 状態（2026-11-01）                                                                                 | 判定                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| dynamic workflows（`Workflow` ツール・`.claude/workflows/`・plugin の `workflows/`）                  | 2.1.154（2026-05-28）で導入。全有料プランで使え、Pro は既定でオフ。TS の Agent SDK は 0.3.149 以降 | **オーケストレーターとして採る**（3章）    |
| Agent teams（チームメイト）                                                                           | 実験的で既定は無効。**Agent SDK と `-p` では teammate を起こさない**                               | 採らない                                   |
| サブエージェント定義・hooks・plugins・skills                                                          | 部品として成熟。plugin のサブエージェントでは `hooks`・`mcpServers`・`permissionMode` が無視される | 今も使っている部品のまま                   |
| Managed Agents・web のクラウドセッション・クラウドの予定タスク・Projects・ultrareview・GitHub Actions | ベータか研究プレビュー。どれもコードと会話が Anthropic か GitHub の基盤へ出る                      | 採らない（会話を外に送らない規約に反する） |

dynamic workflows の要点（[workflows](https://code.claude.com/docs/en/workflows.md)、[Agent SDK の Workflow](https://code.claude.com/docs/en/agent-sdk/typescript.md#workflow)、同梱スキル `/workflow-authoring` 2.1.316、`sdk.d.ts` 0.3.312）:

- 決定的な JavaScript の台本がバックグラウンドでサブエージェントを束ねる。関数は `agent()`・`parallel()`・`pipeline()`・`phase()`・`log()`・`args`
- `agent()` に `model`・`effort`・`agentType`（カスタムのサブエージェント定義）・`schema`（検証済みの JSON を返させ、失敗は最大5回やり直す）・`isolation: 'worktree'` を渡せる
- 保存したものは `/<name>`、plugin の `workflows/` に置いたものは `/<plugin>:<name>` で呼べる
- 台本はファイルにもシェルにも触れない（コマンドを打つのは agent）。`Date.now()`・`Math.random()`・引数なしの `new Date()` は例外になる（再開を壊さないため）
- 実行中に利用者の入力は受けない。同時に動くのは既定 16 体、1回の実行で合計 1,000 体まで
- 再開は同じセッションの中だけ（`resumeFromRunId`）。失敗した agent より後の agent は、済んでいてもやり直しになる
- **SDK では使用量の上限で一時停止せず、該当の agent が失敗する**（一時停止して待つのは対話セッションだけ）
- サブエージェントからは呼べず、起動はメインのスレッドだけ。SDK のホストから直接始める API は無く、モデルに `Workflow` を呼ばせる。止めるのは `stopTask(taskId)`
- SDK で起動させるには `allowedTools` か `Workflow(<name>)` の許可ルールか `canUseTool` か PreToolUse hook で許可する
- 外から見える進捗はラン単位（`task_started` の `task_type: 'local_workflow'`・`task_updated`・`task_notification` の `duration_ms`・`total_tokens`）。**段・agent 単位の進捗の型は公開されていない**
- サブスクリプション: Claude プランでサインインしているかぎり、Agent SDK と `claude -p` の利用はプランの上限から引かれる（[サポート記事](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) の 2026-10-07 の更新）

### 2.2 Claude Code の上に乗る流れの層

| 候補                                                                            | 成熟度（星 / 最新版 / 活発さ）                                                                                                                   | 近さ                                                                                                         | 判定                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Archon                                                                          | 23.8k / v0.13.2（2026-10-29）/ 10月100件以上。1.0 前                                                                                             | YAML の流れ・ノードごとのモデル・承認とマージの関門・worktree・Web 画面・実行ごとの費用。9機能を最も広く持つ | 採らない（下の理由）。関門と費用の見せ方は参考にする          |
| BMad Loop                                                                       | 173 / v0.13.2（2026-10-10）/ 早期ベータ                                                                                                          | 選ぶ → 実装 → 別文脈のレビュー → 検証 → コミットの決定的な輪。形は自前に最も近い                             | 採らない（BMAD の盤が前提・Beads 非対応・1.0 まで破壊的変更） |
| Gas Town → Gas City                                                             | Gas Town 18.6k / v1.2.1（2026-06-06）、7月以降は依存更新。Gas City 1.5k / v1.5.1（2026-10-24）                                                   | Beads が前提。調整役・作業役・Bors 式のマージ待ち行列・見張り                                                | 採らない（大規模な多数エージェント向けで、乗り換えが重い）    |
| Beads の formula・molecule・gate                                                | Beads 28.3k / v1.3.2（2026-10-24）                                                                                                               | 手順をデータで持つ。段と依存・人の段・待ち（human・timer・gh:run・gh:pr）。実行器は持たない                  | 後で検討（3.3）                                               |
| compound-engineering（Every）                                                   | 25.8k / v3.34.0（2026-10-31）/ 10月100件以上                                                                                                     | 学びを `docs/solutions` に積んで次の計画が読む `ce-compound`。振り返りを中心に置く唯一の既製品               | 振り返りの参考にする                                          |
| GitHub Spec Kit                                                                 | 144k / v1.2.5（2026-10-28）                                                                                                                      | 仕様駆動。YAML の流れに gate・fan-out・`while`・再開                                                         | 採らない（排他・worktree・振り返りが無い）                    |
| obra/superpowers                                                                | 309.9k / v7.0.1（2026-10-21）                                                                                                                    | 計画 → タスクごとのサブエージェント → 2段のレビュー → 仕上げ                                                 | 採らない（置き場・排他・モデル選択・観測が無い）              |
| OpenSpec・BMAD Method・Agent OS                                                 | 73.5k・54.8k・5.6k                                                                                                                               | 仕様と手順の型。Agent OS は v3 で段取りを Claude Code 本体に任せて縮小した                                   | 採らない                                                      |
| Conductor・Sculptor・Nimbalyst・Emdash・Claude Squad                            | Conductor 0.92.0（2026-10-23）ほか                                                                                                               | worktree で並列に Claude Code を動かす盤（別の端末環境）                                                     | 採らない（tsukumo と同じ層を取り合う）                        |
| Ruflo（旧 Claude Flow）                                                         | 80.4k / v3.66.1（2026-10-31）                                                                                                                    | 群れ・学ぶ記憶。MCP ツール 314 個、hook が挙動を広く変える                                                   | 採らない                                                      |
| 廃れたもの                                                                      | Vibe Kanban（運営が 2026-04-10 に閉鎖）・Crystal（2026-02 に Nimbalyst へ）・Task Master（2026-04 以降コミット無し）・CCPM（2026-03 以降止まる） | なし                                                                                                         | 採らない                                                      |
| ホスト型（Copilot の Claude エージェント・Codex cloud・Cursor・Devin・Factory） | なし                                                                                                                                             | どれも各社のクラウドと課金で動き、利用者の Claude サブスクで Claude Code を回す形ではない                    | 採らない                                                      |

### 2.3 汎用の枠組み・耐久実行・つなぐ規格

| 候補                                                                                 | Claude Code / Agent SDK を中で動かせるか                                                                                         | 判定                                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| LangGraph・deepagents・OpenAI Agents SDK・Google ADK・Pydantic AI・CrewAI・VoltAgent | 公式の口が無い。自前のエージェントの輪で Messages API を呼ぶ（API キーの従量課金）                                               | 採らない（Claude Code の hooks・skills・plugins を手放す）                           |
| Microsoft Agent Framework                                                            | `agent-framework-claude` がある。Python 限定・先行版。AutoGen は廃止と README に明記                                             | 採らない（TS で使えない）                                                            |
| Mastra                                                                               | `@mastra/claude` の `ClaudeSDKAgent`。TS で Claude Agent SDK を包む公式の口はここだけ                                            | 採らない（得るのは段の並びと観測だけで、hooks を扱う説明が無い）                     |
| Temporal                                                                             | `temporalio-claude-agent-sdk` 0.0.2（2026-10-30）。Python 限定、docs のページは 404                                              | 採らない（プロンプトと Claude Code の出力が履歴の payload に残り、会話の複製になる） |
| Inngest（AgentKit）・Restate・DBOS・Trigger.dev                                      | 口が無いか、クラウドで API キーを使う前提。AgentKit は 2025-11 からリリースが無い                                                | 採らない                                                                             |
| Vercel durable-harness                                                               | Claude Code を耐久化するが、Vercel Sandbox の中でだけ動き AI Gateway 経由                                                        | 採らない（会話が外へ出る・サブスク不可・beta）                                       |
| ACP（Agent Client Protocol）と `claude-agent-acp`                                    | Claude Agent SDK を ACP のエージェントとして出すアダプタ（v0.99.1、2026-10-29）                                                  | ワークフローとは別の問い（5章）                                                      |
| AG-UI・A2A・MCP tasks                                                                | AG-UI の Claude Agent SDK 用 TS アダプタは 0.0.8。A2A はネットワーク越しの相互運用。MCP tasks は 2026-07-28 版で公式拡張へ移った | 採らない（単独・ローカルでは得が小さい）                                             |

### 2.4 主な候補が9機能のどれを覆うか

◯ は機能として持つ、△ は部品があり自分で組む、× は無い。

| 機能                     | dynamic workflows                     | Archon                        | BMad Loop          | Gas City     | Mastra           | Temporal              |
| ------------------------ | ------------------------------------- | ----------------------------- | ------------------ | ------------ | ---------------- | --------------------- |
| 置き場                   | ×                                     | △ Issue と自前の DB           | △ BMAD の盤だけ    | ◯ Beads      | ×                | ×                     |
| 着手の排他               | ×                                     | ◯ 待ち行列                    | ◯ 唯一の書き手     | ◯            | ×                | ◯ Workflow ID         |
| 段ごとの委譲・モデル選択 | ◯ `model`・`agentType`                | ◯ ノードごと                  | ◯ 段ごと           | ◯ formula v2 | ◯                | ◯                     |
| 独立した受け入れ         | ◯ 台本で差し戻しの輪                  | ◯ 観点ごとのレビュー          | ◯ 別文脈のレビュー | △ 設定次第   | △                | ◯ 別の Activity       |
| 振り返りの学習           | ×                                     | △ 範囲外を issue に           | △ 後回しの台帳     | ×            | ×                | ×                     |
| 送り出し・関門           | △ 台本はシェルに触れない              | ◯ PR 経由のマージ関門         | ◯ 検証 → コミット  | △            | ◯ suspend        | ◯ Signal・Update      |
| worktree                 | △ agent 単位の一時 worktree           | ◯ 既定                        | ◯ 任意             | △            | ×                | △                     |
| 観測                     | △ ラン単位（段は TUI とファイル）     | ◯ Web 画面・費用              | ◯ TUI              | △            | ◯ Studio         | ◯ Web UI              |
| 再開                     | △ 同じセッション内だけ                | ◯                             | ◯                  | ◯            | ◯                | ◯（ターンはやり直し） |
| tsukumo の口が届くか     | ◯ tsukumo の SDK セッションの中で動く | × 自分で Claude Code を起こす | × 同               | × 同         | △ 包み直しが要る | × 同                  |

## 3. 推す形

### 3.1 何を置き換え、何を残すか

| 部分                                                  | 乗り換えたあと                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 置き場・同期・着手の排他（`tw claim`）・`/plan-tasks` | 残す                                                                                                    |
| `/next-task`                                          | 残す。着手の印を立てたあと、保存済みワークフローを呼ぶ                                                  |
| `task-workflow` と並びの段の4件                       | **保存済みワークフロー1本に置き換える**（plugin の `workflows/` に置き、`tsukumo-workflow` で配る）     |
| 実装の段の委譲                                        | 台本が段ごとに `agent({ model, schema })` を呼ぶ。モデルは difficulty から台本が決める                  |
| 受け入れ                                              | 受け入れ役の定義はそのまま `agentType` に渡し、判定は `schema` で受け、差し戻しの回数の上限を台本に書く |
| 振り返り                                              | 台本の最後の agent にする。ドラフトを積むのは agent が打つ `tw new --draft`                             |
| 送り出し                                              | 残す。台本はシェルに触れないので、ワークフローの完了の知らせを受けたメインが `tw finish` を打つ         |
| 関門の hook・計測の `lap-hook`                        | 残す（ワークフローの agent に掛かるかは未確認。6章）                                                    |
| tsukumo の帯                                          | 契約は変えない。台本の agent が `phase_result` を呼べれば今と同じに進む（未確認。6章）                  |

台本の形の見当（API の名前は同梱スキルと 2.1 の文書から引いた。動かしてはいない）:

```js
export const meta = {
  name: "task-flow",
  description: "着手したタスク1件を、実装・受け入れ・振り返りの段で進める",
  phases: [{ title: "実装" }, { title: "受け入れ" }, { title: "振り返り" }],
}
const { taskId, phases, model } = args
for (const [index, phase] of phases.entries()) {
  await agent(`タスク ${taskId} の段 ${index + 1}「${phase}」を済ませる`, {
    phase: "実装",
    model,
    schema: PHASE_RESULT,
  })
}
for (let round = 0; round < 3; round += 1) {
  const verdict = await agent(`タスク ${taskId} の差分を受け入れの基準で判定する`, {
    phase: "受け入れ",
    agentType: "tsukumo-workflow:acceptor",
    schema: VERDICT,
  })
  if (verdict.accepted) break
  await agent(`指摘を直す: ${verdict.findings.join(" / ")}`, { phase: "実装", model })
}
await agent(`タスク ${taskId} を振り返り、改善候補をドラフトとして積む`, { phase: "振り返り" })
```

### 3.2 推す理由

- **実行エンジンが変わらない。** tsukumo は Claude Code を Agent SDK で動かすことに賭けている（`docs/architecture/adr/0008-sdk-instead-of-tui.md`）。dynamic workflows はその SDK のセッションの道具の1つで、hooks・skills・plugins・サブスクリプションの枠をそのまま使う
- **手順の文章が、決まった制御に置き換わる。** いまのオーケストレーターは段の進め方と差し戻しの回し方を Markdown で指示し、守られないところを hook（`tw handback-guard` など）で止めている。台本ならループと分岐はコードで、モデルの読み違いが入らない
- **公式が推す型と一致する。** Anthropic の長時間ハーネスの記事は計画役・生成役・評価役の分離と、懐疑的に調整した単独の評価役を勧めている（[harness-design-long-running-apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)、2026-03-24）。dynamic workflows の記事は敵対的な検証・扇状に分けて統合する型を挙げている（[a-harness-for-every-task](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)、2026-06-02）
- **tsukumo のスキル非依存の決まりと合う。** 台本は `tsukumo-plugins` の plugin の中に置け、tsukumo の core は今までどおり契約だけを見る

### 3.3 後で検討すること: 手順を Beads のデータに寄せる

Beads の formula（段・依存・人の段・待ち）を molecule として流し込むと、段の状態と待ちを Beads の上に持てる（[gastownhall/beads の docs/workflows](https://github.com/gastownhall/beads)）。`tw plan-phases` と止まった段の位置の持ち方の一部を Beads 本体に寄せられる見込みがある。
ただし Beads の移管後の人の主担当は実質1名（2026-09 以降のコミット 100 件のうち 55 件が1人、44 件が bot）で、依存を深めるほど保守の継続性に賭けることになる。ワークフローの乗り換えとは分けて判断する。

## 4. 採らない候補の理由（補足）

- **Archon**: 9機能を最も広く既製で持つが、Archon が自分で Claude Code のプロセスを起こすので、tsukumo の SDK プロセスを通らず `speak`・`report`・`work_plan` が届かない。GitHub の Issue と PR が前提の流れで、main へ ff する今の送り出しとは形が違う。匿名のテレメトリが既定で有効（`ARCHON_TELEMETRY_DISABLED=1` で止まる）。1.0 前で版の進みが速い
- **盤型のアプリ（Conductor・Sculptor・Nimbalyst・Emdash など）**: 自前の UI で Claude Code を起こす別の端末環境で、tsukumo が作っているものと同じ層。Conductor は既定でチャットの最初のメッセージを第三者の AI に送って題を作る
- **汎用の枠組み**: 乗ると Claude Code の代わりに枠組みの輪でモデルを呼ぶ。サブスクリプションではなく API キーの従量課金になり、hooks・skills・plugins を失う
- **耐久実行の基盤**: 段の入出力を自分の記録に書き残すので、Claude Code の発言を通すと会話が複製される（`docs/coding-standards/conversation-content.md`）。乗るならタスク ID とセッション ID だけを通す設計になる

## 5. 別の問い: ACP

ACP は「エージェントを動かして画面に出す側」と「エージェント」のあいだの規格で、tsukumo はクライアントの位置に当たる。`claude-agent-acp` は Claude Agent SDK を包み、サブエージェントの子セッション・plan・権限要求・dynamic workflows を ACP に写している（[README](https://github.com/agentclientprotocol/claude-agent-acp)）。
乗れば Codex CLI・Gemini CLI・Copilot CLI なども同じ画面に載るが、SDK の hook のコールバックや細かいオプションは ACP の拡張（`_meta`）かアダプタ任せになり、v2 はまだ草案（v2.0.0-alpha.11）。
ADR 0008 が払った「Claude Code 専用になる」代償を取り戻す道だが、ワークフローの乗り換えとは独立に判断できる。

## 6. 乗る前に確かめること

推す形は、次の4つが通ることを前提にしている。どれも文書に明記が無く、実機で確かめる。

1. **ワークフローの agent の道具呼び出しに、PreToolUse・SubagentStart・SubagentStop の hook が掛かるか。** 掛からなければ `tw commit-guard` と `tw lap-hook` が効かず、関門と計測を台本の外（送り出しの前の検査）へ移す必要がある
2. **ワークフローの agent から、tsukumo の SDK の中の MCP（`phase_result`・`speak`）を呼べるか。** 呼べなければ帯はワークフローの完了の知らせでしか進まない。段・agent 単位の進捗のイベントは公開されていない（`agentProgressSummaries` の `task_progress` が `local_workflow` で出るかも未確認）
3. **orca の作業ツリーの中で、保存済みワークフローを読めるか。** `projectConfigRoot`（2.1.275 以降）が workflows を本体のチェックアウトから読む。`isolation: 'worktree'` の分岐元も未確認
4. **1件あたりのトークンと所要が今と比べてどうか。** タスクの再試集（`docs/research/harness-strategy.md`「3.3 ハーネスのタスクの再試評価」）は、`tw claim` からの委譲・受け入れ・振り返りの流れそのものを再試せず `claude -p` を1回起こすだけ（`docs/architecture/testing/harness-replay.md`「再試しないもの」）なので、流れの前後は比べられない。再試集の一時の作業ツリーに台本版を載せるか、近い実タスクを両方の流れで送り出すかを決めてから、台本版と今の流れを同じ種類のタスクで流して比べる（この項の初版は「再試集で同じタスクを両方で流す」と書いていたが誤りで、2026-11-01 に直した）

あわせて、利用者のプランで Workflow が有効か（Pro は既定でオフ）と、SDK では使用量の上限で agent が失敗する点への備え（Beads に残した段の位置から再開できること）を確かめる。

## 7. 確かめていないこと

- 第三者の実行器（Archon・BMad Loop・Gas Town など）が、利用者の `claude` CLI のログインで Claude Code を起こしてよいかについての Anthropic の公式な可否。Agent SDK の概要は「事前の承認なしに第三者の開発者が自分の製品で claude.ai のログインや利用枠を提供することは認めない」とだけ書く（[agent-sdk/overview](https://code.claude.com/docs/en/agent-sdk/overview)）
- Mastra・AG-UI・Temporal・`claude-agent-acp` が `ANTHROPIC_API_KEY` なしでサブスクリプションのログインのまま動くか（設計からの推測）
- dynamic workflows が GA だという明示の記述（研究プレビューの表記が無いだけ）
- `isolation` の `remote` という値（公式ブログと型にはあるが、文書の本文には無い）
- Beads の移管の正式な告知と、匿名の利用計測の既定値
- Gas Town のモデル選択と、独立したレビュー役の有無

## 8. 出典

すべて 2026-11-01 に閲覧。

- Anthropic: [workflows](https://code.claude.com/docs/en/workflows.md)・[Agent SDK（TypeScript）の Workflow](https://code.claude.com/docs/en/agent-sdk/typescript.md#workflow)・[subagents の dynamic workflows](https://code.claude.com/docs/en/agent-sdk/subagents.md#scale-up-with-dynamic-workflows)・[agent-teams](https://code.claude.com/docs/en/agent-teams.md)・[sub-agents](https://code.claude.com/docs/en/sub-agents.md)・[hooks](https://code.claude.com/docs/en/hooks.md)・[plugins の components](https://code.claude.com/docs/en/plugins/components.md)・[changelog](https://code.claude.com/docs/en/changelog.md)（2.1.154・2.1.198・2.1.296・2.1.305）・[サブスクリプションと Agent SDK](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)・[legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance.md)・[Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)・[effective-harnesses-for-long-running-agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)・[harness-design-long-running-apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)・[a-harness-for-every-task](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)
- 流れの層: [Archon](https://github.com/coleam00/Archon)・[bmad-loop](https://github.com/bmad-code-org/bmad-loop)・[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)・[beads](https://github.com/gastownhall/beads)・[gastown](https://github.com/gastownhall/gastown)・[gascity](https://github.com/gastownhall/gascity)・[compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)・[spec-kit](https://github.com/github/spec-kit)・[superpowers](https://github.com/obra/superpowers)・[OpenSpec](https://github.com/Fission-AI/OpenSpec)・[agent-os v3.0.0](https://github.com/buildermethods/agent-os/releases/tag/v3.0.0)・[vibe-kanban の閉鎖](https://www.vibekanban.com/blog/shutdown)・[Conductor](https://www.conductor.build/llms.txt)・[sculptor](https://github.com/imbue-ai/sculptor)・[crystal](https://github.com/stravu/crystal)・[claude-task-master](https://github.com/eyaltoledano/claude-task-master)・[ccpm](https://github.com/automazeio/ccpm)・[ruflo](https://github.com/ruvnet/ruflo)・[Copilot の第三者エージェント](https://docs.github.com/en/copilot/concepts/agents/about-third-party-agents)
- 汎用・耐久実行・規格: [Mastra の SDK agents](https://mastra.ai/docs/agents/sdk-agents)・[Temporal の Claude Agent SDK 統合](https://github.com/temporalio/ai-integrations/tree/main/python/claude_agent_sdk)・[Microsoft Agent Framework の Claude 統合](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/agent-services/anthropic-claude)・[Vercel の Claude Code ハーネス](https://vercel.com/docs/agent-harnesses/claude-code)・[Trigger.dev の Claude Code ガイド](https://trigger.dev/docs/guides/ai-agents/claude-code-trigger)・[Pydantic AI と Claude Agent SDK の比較](https://github.com/pydantic/pydantic-ai/blob/main/docs/comparisons/vs-claude-agent-sdk.md)・[LangGraph の durable execution](https://docs.langchain.com/oss/javascript/langgraph/durable-execution)・[OpenAI Agents SDK の tracing](https://github.com/openai/openai-agents-js/blob/main/docs/src/content/docs/guides/tracing.mdx)・[claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)・[ACP のクライアント一覧](https://agentclientprotocol.com/overview/clients)・[AG-UI の Claude Agent SDK 統合](https://github.com/ag-ui-protocol/ag-ui/tree/main/integrations/claude-agent-sdk)・[A2A v1.0.0](https://github.com/a2aproject/A2A/releases/tag/v1.0.0)・[MCP 2026-07-28 の changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
