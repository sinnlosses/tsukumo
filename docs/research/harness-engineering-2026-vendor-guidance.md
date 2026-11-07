# Anthropic と OpenAI の一次情報は、コーディングエージェントのハーネスについて何を勧めているか（2026-11-08）

状態: 調査メモ。tsukumo への適用は判断していない（診断の材料）。

**問い**: "harness engineering"（ハーネスエンジニアリング）とは何で、Anthropic と OpenAI の一次情報は 2026年11月8日時点で、コーディングエージェントのハーネス（オーケストレーション・コンテキスト・検証・記憶・hook・サブエージェント）について何を勧めているか。
**調べた日**: 2026-11-08。
**調べ方**: anthropic.com/engineering と news、claude.dev/claude.com の公式ブログ、Claude Code と Agent SDK のドキュメント（code.claude.com）、platform.claude.com、OpenAI の openai.com/index、Codex の公式ドキュメント、公式 GitHub（anthropics/claude-code の CHANGELOG と releases、anthropics/cwc-long-running-agents、openai/symphony）を WebFetch で読み、2026年7月〜11月の更新は WebSearch（extended）で探した。バージョンの日付は `gh api repos/anthropics/claude-code/releases` の `published_at` から取った。
ドキュメントの移転が3つあった。Codex のドキュメントは developers.openai.com/codex から learn.chatgpt.com へ、「Building agents with the Claude Agent SDK」は claude.com/blog へ、「Claude Code: Best practices」は code.claude.com/docs/en/best-practices へ移っていた。openai.com は直接の取得が 403 だったので、2記事（harness engineering・Symphony）はテキスト化プロキシ経由で同じ URL の本文を読んだ。残る2記事（App Server・Agents API）は 8章に書いたとおり読めていない。
隣の調査として、他社・実務者は `harness-engineering-2026-practice.md`（同日）、既製ハーネスへの乗り換えは `agent-harness-adoption-2026-11-01.md`、流れの形を決めた前の調査は `harness-strategy.md`（2026-10-17）がある。本文書は2社の一次情報だけを扱う。

## 結論の要約

- 語の出どころは OpenAI（2026-02-11）で、「エンジニアの仕事はコードを書くことから、環境を設計し、意図を指定し、エージェントが信頼できる仕事をできるフィードバックループを作ることに移る」が定義に相当する。Anthropic は "harness" を「モデルの外側すべて」の意味で使い、2025-11 の initializer/coding agent、2026-03 の planner/generator/evaluator、2026-04 の brain/hands/session の分離、2026-06 の「タスクごとに Claude 自身がハーネスを書く」dynamic workflows へと論を進めた。
- 両社が揃って勧めるのは5点。(1) リポジトリ内の文書を正典にし、起動時に必ず読み込まれる AGENTS.md / CLAUDE.md は地図として短く保つ（OpenAI は約100行、Anthropic は200行未満）、(2) 毎回守らせたい規則は文章ではなく機械（lint・CI・hook・deny ルール）で強制する、(3) 書いた者以外が検証する（独立した evaluator、別コンテキストのレビュー、敵対的な検証）、(4) 記憶はファイルと git に置く（feature list の JSON・progress file・PLANS.md・MEMORY.md）、(5) 下請けの作業は新しいコンテキストに切り出し、要約だけを戻す。
- Anthropic の 2026 年の記事が足した論点は、ハーネスの部品はモデルの世代ごとに陳腐化すること（context reset・sprint 分割は Opus 4.5/4.6 で不要になった）、評価は「ハーネス＋モデル」を測ること、auto mode の分類器は見逃し 17% で「決定的な制御の代わりにならない」こと、記憶は注入層を小さくして「何のためか」だけ伝えること、長い仕事は agentic laziness・self-preferential bias・goal drift に負けるので計画をコード（workflow script）に移すこと。
- Claude Code には 2026-11 時点で、hook イベント 33 種、サブエージェント（`memory`・`isolation: worktree`・`maxTurns`・`SendMessage` で再開・fork、深さ 3・同時 20）、agent teams（実験的、CLI のみ）、dynamic workflows（`agent()`/`parallel()`/`pipeline()`/`phase()`、schema、再開、`.claude/workflows/`、同時 16・上限 1,000 体）、`/goal`、`/loop`・Monitor がそろい、auto mode が対話セッションの既定（v2.1.284、2026-09-28）、`-p`/SDK の既定は Manual（v2.1.302、2026-10-16）、AGENTS.md も読む（v2.1.277、2026-09-18）。
- OpenAI は harness engineering（2026-02）→ Symphony（2026-04、課題管理板を制御盤にし、人は 3〜5 セッションしか見られないので「状態遷移ではなく目標を渡す」）→ App Server（JSON-RPC でハーネスを外から使う）→ Agents API（2026-09、Codex ハーネスのマネージド提供）と進めた。Codex のドキュメントは「短く正確な AGENTS.md」「plan mode」「読み取り中心の作業をサブエージェントへ」「`/review`」「承認の自動審査（auto-review）」「hooks GA（2026-05）」「Goal mode（2026-05）」を勧める。
- 言い方が違うのは計画の置き場と語り方で、Anthropic は計画をスクリプト（Workflow）に、OpenAI は計画をチケットと `docs/`・PLANS.md に置く。Anthropic は数で語り（$9 対 $200、FNR 17%）、OpenAI はスループットで語る（150万行・1,500 PR・1人1日 3.5 PR・PR 500% 増）。

## 1. ハーネスエンジニアリングの定義（出典ごと）

- OpenAI「Harness engineering」（2026-02-11）: 定義文は置かず、問いとして書く。"what changes when a software engineering team's primary job is no longer to write code, but to design environments, specify intent, and build feedback loops that allow Codex agents to do reliable work"。要約の一文は "Humans steer. Agents execute."、結びは "the discipline shows up more in the scaffolding rather than the code"。
- OpenAI「Codex as a platform」（日付なし）: ハーネスは「モデルがコンテキストを集め、推論し、ツールを使い、境界の内で動き、承認を求め、作業を引き継ぐ実行基盤」。"The open-source layer is the harness and integration surface; model access and managed services remain separate."
- Anthropic「Effective harnesses for long-running agents」（2025-11-26）: ハーネス＝モデルを囲む system prompt・ツール・環境の設計。initializer と coding agent は「初期プロンプトが違うだけで、system prompt・ツール・ハーネスは同一」（脚注）。
- Anthropic「Harness design for long-running apps」（2026-03-24）: ハーネスの部品はモデルの限界を前提にしており、新モデルごとに見直して「不要になった部品を削り、新しい部品を加える」。有効な組み合わせの空間は「縮まず、移動する」。
- Anthropic「Scaling Managed Agents」（2026-04-08）: brain（Claude＋ハーネス）・hands（sandbox・ツール）・session（イベントログ）を分け、"nothing in the harness needs to survive a crash"。Managed Agents は "a meta-harness"、Claude Code は "an excellent harness that we use widely across tasks"。
- Anthropic「Demystifying evals」（2026-01-09）: "When we evaluate 'an agent,' we're evaluating the harness and the model working together."
- Anthropic 公式ブログ「A harness for every task」（2026-06-02）: "Claude can now write its own harness on the fly, custom-built for the task at hand."
- Claude Code docs「Best practices」（2026-11 時点）: 指示を「非決定的（モデルが読む: prompt・CLAUDE.md・skill）」と「決定的（ハーネスが必ず実行する: hook・deny ルール・managed setting）」に分け、"Claude Code (the harness) has to execute this" と、Claude Code 自体をハーネスと呼ぶ。

## 2. Anthropic の勧め

### 2.1 2024-12〜2025-11 の記事

- Building effective agents（2024-12-19、https://www.anthropic.com/engineering/building-effective-agents）: workflow は "systems where LLMs and tools are orchestrated through predefined code paths"、agent は "LLMs dynamically direct their own processes and tool usage"。5つの型（prompt chaining・routing・parallelization・orchestrator-workers・evaluator-optimizer）。原則は simplicity・transparency・ACI。複雑さは性能向上が実証されたときだけ足す。コーディングは自動テストで検証しやすいが、全体要件との整合は人のレビューが要る。
- Claude Code: Best practices（2025-04-18 初出、現在は https://code.claude.com/docs/en/best-practices に移り全面改訂）: 節は「見えないものを伝える」「走らせる検査を渡す」「例外のない規則を強制する」「既定を変える」「自分なしで走らせる」。要点は "If something has to happen every time, make it a hook, a deny rule, or a managed setting. CLAUDE.md is for guidelines"、"If you keep adding emphasis to a CLAUDE.md line and Claude still misses it, that's a sign the line belongs in a hook"。`Stop` hook の exit 2 で検査が通るまで終われない（8回連続で止められると打ち切り）。`/code-review` は「会話を見ていない新しいサブエージェント」が差分を見る。強制の集合は小さく保つ（40 個あれば大半は好みの話）。
- How we built our multi-agent research system（2025-06-13、https://www.anthropic.com/engineering/multi-agent-research-system）: orchestrator-worker。Opus 4 リード＋Sonnet 4 サブエージェントが単体 Opus 4 を 90.2% 上回り、性能差の約 80% をトークン量が説明、消費はチャットの約 15 倍。委譲には目的・出力形式・ツール・担当範囲を明示し、努力量をクエリの複雑さに合わせる。評価は end-state と LLM-as-judge、長時間はチェックポイントと rainbow deployment。
- Writing effective tools for agents（2025-09-11、https://www.anthropic.com/engineering/writing-tools-for-agents）: "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."。prototype → 評価 → エージェントと一緒に改善。少数の高影響ツール、namespacing、意味のある文脈を返す、エラーは次の一手を示す。
- Effective context engineering for AI agents（2025-09-29、https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents）: context rot と attention budget。system prompt は "right altitude"。just-in-time retrieval（参照子を持ち必要時に読む）。長い仕事の3手法は compaction・structured note-taking（NOTES.md）・sub-agent architectures（数万トークンの探索を 1,000〜2,000 トークンに要約して返す）。
- Building agents with the Claude Agent SDK（2025-09-29、https://claude.com/blog/building-agents-with-the-claude-agent-sdk）: ループは gather context → take action → verify work。"the folder and file structure of an agent becomes a form of context engineering"。検証は rules-based（lint）→ visual（スクリーンショット）→ LLM-as-judge の順で、judge は性能が要るときだけ。失敗例を読み、顧客利用を映した evals を作る。
- Equipping agents for the real world with Agent Skills（2025-10-16、https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills）: 3段の progressive disclosure（name/description → SKILL.md 本文 → 補助ファイル）。決定的な処理はスクリプトに。評価で不足を見つけてから作る。
- Code execution with MCP（2025-11-04、https://www.anthropic.com/engineering/code-execution-with-mcp）: ツール定義と中間結果がコンテキストを圧迫する。MCP をコード API として提示し、絞り込みと制御フローを実行環境で行う（例: 150,000 → 2,000 トークン、98.7% 削減）。
- Introducing advanced tool use（2025-11-24、https://www.anthropic.com/engineering/advanced-tool-use）: Tool Search Tool（77K → 8.7K トークン）、Programmatic Tool Calling（中間結果をコンテキストに入れない）、Tool Use Examples。

### 2.2 2025-11〜2026-03 の長時間エージェントのハーネス

- Effective harnesses for long-running agents（2025-11-26、https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents）: 失敗は「一度に全部作って途中で尽きる」「途中で完了と誤認する」。対策は initializer（feature list を JSON で、全件 `passes: false` から。"It is unacceptable to remove or edit tests"、`init.sh`、git 初期化、progress file）と coding agent（毎セッション `pwd`・git log・progress file を読み、1機能だけ、ブラウザで end-to-end に自己検証、"the kind of code that would be appropriate for merging to a main branch" の状態で終える）。
- Harness design for long-running application development（2026-03-24、https://www.anthropic.com/engineering/harness-design-long-running-apps）: v1 は planner/generator/evaluator の3役＋スプリント契約＋ファイルでの受け渡し＋context reset。自己評価は甘いので評価者を分ける（それでも甘いが、懐疑的に調整するのは容易）。評価者は Playwright で実際に操作し、基準に閾値、1つ落ちれば不合格。数字は単独 20 分 $9（中核機能が動かず）対フルハーネス 6 時間 $200。v2（Opus 4.6）では context reset とスプリントを外し、自動 compaction の1セッションに、評価者は最後に1回（DAW: 3 時間 50 分、$124.70）。「評価者はタスクがモデル単独の能力の外にあるときだけ価値がある」。
- anthropics/cwc-long-running-agents（GitHub、Code with Claude 2026 の課題。メンテナンスされない例の部品）: Default-FAIL contract（`test-results.json`、`verify-gate.sh` が証跡の Read を強制）、Write/Edit を持たない fresh-context evaluator サブエージェント、`PROGRESS.md`＋`commit-on-stop.sh`、`kill-switch.sh`・`steer.sh`。組み込みの `/goal` は同じ考えを別モデルの完了判定で行うものと位置づける。

### 2.3 2026年の運用知見

- Demystifying evals for AI agents（2026-01-09、https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents）: grader は code-based・model-based・human。capability eval と regression eval。pass@k と pass^k。"Grade what the agent produced"（手順でなく結果）、"You won't know if your graders are working well unless you read the transcripts"、20〜50 件の簡単なタスクから、0% は壊れたタスクの兆候。
- Quantifying infrastructure noise in agentic coding evals（2026-02-05、https://www.anthropic.com/engineering/infrastructure-noise）: 資源設定だけで Terminal-Bench 2.0 が 6 ポイント動く。資源はプロンプトや温度と同じ実験変数として記録する。"A few-point lead might signal a real capability gap—or it might just be a bigger VM."
- Building a C compiler with a team of parallel Claudes（2026-02-05、https://www.anthropic.com/engineering/building-c-compiler）: 16 体を Docker で並列、`current_tasks/` のロックファイルを git の競合で排他、オーケストレーターも通信も無し。約 2,000 セッション・2 週間・約 $20,000・約 10 万行の Rust。テスト出力は数行＋ログファイル、`ERROR` を grep できる形、`--fast` でサンプル実行。回帰は CI で、全員が同じバグで詰まったら GCC をオラクルに。"For autonomous systems, it is easy to see tests pass and assume the job is done, when this is rarely the case."
- How we built Claude Code auto mode（2026-03-25、https://www.anthropic.com/engineering/claude-code-auto-mode）: 手動プロンプトの 93% は承認されていた。transcript classifier（reasoning-blind、2段）で「ユーザーが明示していないことはすべて未認可」。結果は誤ブロック 0.4%、実際の過剰行動の見逃し 17%（"the honest number"）。拒否後は代替手段を探し、連続 3 回か累計 20 回で停止。"It is not a drop-in replacement for careful human review on high-stakes infrastructure."
- Scaling Managed Agents: Decoupling the brain from the hands（2026-04-08、https://www.anthropic.com/engineering/managed-agents）: ハーネスをコンテナの外に出し、コンテナは `execute(name, input) → string` のツール（"The container became cattle."）。session はイベントログで、`wake(sessionId)`・`getSession(id)` で再開、`getEvents()` でコンテキストを組み直す（compaction の不可逆な判断を避ける）。認証情報はサンドボックスに入れない。TTFT p50 −60%、p95 −90% 超。
- An update on recent Claude Code quality reports（2026-04-23、https://www.anthropic.com/engineering/april-23-postmortem）: 品質低下の原因は3つのハーネス側の変更（effort の既定を medium へ、思考ブロックを毎ターン削るキャッシュ最適化のバグ、簡潔さの指示で評価 −3%）。再発防止はシステムプロンプト変更ごとのモデル別評価・ablation・soak 期間・段階展開。
- How we contain Claude across products（2026-05-25、https://www.anthropic.com/engineering/how-we-contain-claude）: リスク＝起きやすさ×被害の大きさ。環境層の決定的な境界が最後の砦（"The deterministic boundary is what gets hit when everything probabilistic misses."）。Claude Code のサンドボックスで承認プロンプトが 84% 減。"if credentials never enter the sandbox, they can't be exfiltrated"。auto mode は「サンドボックスの内側の一層」。
- A harness for every task: dynamic workflows in Claude Code（公式ブログ、2026-06-02、https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/）: 1つのコンテキストで計画と実行をすると agentic laziness（50 件中 35 件で完了宣言）・self-preferential bias・goal drift（compaction で制約が消える）。独立したコンテキストと絞った目的のサブエージェントを、Claude が書く JavaScript で編成する。6 つの型は classify-and-act・fan-out-and-synthesize・adversarial verification・generate-and-filter・tournament・loop until done。信頼できない入力は権限なしの reader が読み、要約だけを actor へ渡す quarantine。"best suited for complex, high value tasks"（例: 14 体 482k トークン 6 分 12 秒、22 体 1.1M トークン）。
- Loop engineering: getting started with loops（公式ブログ、2026-06-30、https://claude.com/blog/getting-started-with-loops）: ループ＝"agents repeating cycles of work until a stop condition is met"。turn-based・goal-based（`/goal`、決定的な基準が効く）・time-based（`/loop`・`/schedule`）・proactive。"Loops that write code need loops that check it."。別コンテキストの第二エージェントにレビューさせ、直した問題は仕組み（skill）に反映する。
- Redesigning source control at Anthropic（2026-10-13、https://www.anthropic.com/engineering/redesigning-source-control）: "The bottleneck, now, is all of the developer infrastructure built for human scale: source control, builds, and CI."。1日 3 万件超のマージ（2026-09）。全体ロックのマージキューは再現せず、マージ後・デプロイ前の自動テストへ重心を移す。"Very often, we found that the role of the engineers was to tell Claude 'no.'"
- The components of agent memory（2026-11-06、https://www.anthropic.com/engineering/components-of-agent-memory）: 記憶は4層（injected context → memory representations（wiki）→ memory notes → transcripts）。"We've found that it helps to tell Claude what memory is for, but not how to use it."。残すのは画面から読めないもの（戦略・計画・検証済みの規則）。Sonnet 3.7 は 413 ファイルを無差別に書いた。オフラインの dreaming で transcript と照合して直す（wiki で 13% → 48%）。"the top layer of the memory hierarchy has to stay relatively small"（Claude Code の auto memory は MEMORY.md の先頭 200 行/25KB）。
- ニュース: Opus 4.6（2026-02-05、https://www.anthropic.com/news/claude-opus-4-6）"We've introduced agent teams in Claude Code as a research preview."。Opus 4.8（2026-05-28、https://www.anthropic.com/news/claude-opus-4-8）dynamic workflows を紹介、"It then verifies its outputs before reporting back to the user."

## 3. Claude Code / Agent SDK のオーケストレーションの仕組み

いずれも 2026-11-08 に閲覧。バージョンの日付は GitHub の releases から。

- 5つの並列の形（https://code.claude.com/docs/en/agents）: subagents・agent view（`claude agents`、研究プレビュー）・agent teams（実験的）・projects（claude.ai/code、公開ベータ）・dynamic workflows。worktrees・cross-session messaging（v2.1.224、2026-08-07）・`/batch`（v2.1.63、2026-02-28。5〜30 体の worktree 隔離サブエージェント）が支える。
- Dynamic workflows（https://code.claude.com/docs/en/workflows。導入 v2.1.154、2026-05-28。キーワードは v2.1.160（2026-06-02）に `ultracode` へ改名）: Claude が書く JavaScript を、会話の外の runtime が実行する。`agent(prompt, {schema, model, tools, isolation, label, stallMs})`・`parallel()`・`pipeline()`・`phase()`・`log()`・`args`。失敗した `agent()` は `null`。`schema` の検証は 5 回まで（`MAX_STRUCTURED_OUTPUT_RETRIES`）。再開は結果を再生し、プロンプトが変わった以降と失敗以降を再実行。`Date.now()`・`Math.random()` は throw。保存先は `.claude/workflows/`・`~/.claude/workflows/`・plugin の `workflows/` で、`meta` ブロックは先頭。制約は実行中の入力不可、スクリプトから fs/shell 不可、`import()` 不可、同時 16 体（`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` 1〜256、v2.1.269）、1呼び出し 4,096 件、1実行 1,000 体。size guideline は small/medium/large（<5/<10/<50、既定 medium。v2.1.219、2026-07-24）、25 体か 1.5M トークンで Large workflow 警告。`-p`/SDK ではプロンプトを出さず、`Workflow` の allow ルール・`PreToolUse` hook の allow・`canUseTool` で通す。`ultracode` キーワードは人が打った入力（`origin.kind === "human"`）だけに効く。比較表の軸は「誰が計画を持つか」で、subagents/skills/agent teams は Claude がターンごとに、workflow はスクリプトが持つ。`/workflow-authoring` が同梱スキル。
- Subagents（https://code.claude.com/docs/en/sub-agents）: frontmatter は `name`・`description`・`tools`・`disallowedTools`・`model`・`permissionMode`・`maxTurns`（部分結果で返し再開可、v2.1.246）・`autoCompactWindow`（v2.1.296）・`skills`（32 件まで全文注入）・`mcpServers`・`hooks`・`memory`（user/project/local、v2.1.33、2026-02-06）・`background`・`omitClaudeMd`（v2.1.271）・`effort`・`isolation: worktree`（v2.1.49、2026-02-19）・`initialPrompt`。起動時に載るのは system prompt・委譲文・CLAUDE.md・git status・指定 skills・兄弟エージェントの一覧。戻るのは最終報告だけ（v2.1.210 から命令風の文字列を無害化）。`SendMessage({to})` で再開（Agent の `resume` 引数は v2.1.77 で廃止）。既定はバックグラウンド、fork（会話を丸ごと継承）は v2.1.302（2026-10-16）から既定で可。深さ 3（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`）、同時 20（`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、v2.1.217）。description の合計は 15,000 トークンで警告。
- Agent teams（https://code.claude.com/docs/en/agent-teams。研究プレビュー v2.1.32、2026-02-05）: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。lead・teammates・shared task list（依存とブロック、ファイルロックで claim）・mailbox（`~/.claude/teams/`）。品質関門は `TeammateIdle`・`TaskCreated`・`TaskCompleted` hook（exit 2 で差し戻し、v2.1.33）。`-p`/SDK では teammate を起こさない。1セッション1チーム、入れ子不可、in-process teammate は `/resume` で戻らない。推奨 3〜5 体、1体に 5〜6 タスク、同じファイルは触らせない。
- Hooks（https://code.claude.com/docs/en/hooks）: イベント 33 種。種類は `command`・`http`・`mcp_tool`・`prompt`・`agent`。exit 2 でブロック、`onFailure: "block"`（v2.1.295）、`async`/`asyncRewake`、`once`（skill のみ）。2026 年に足されたものは `TeammateIdle`/`TaskCompleted`（v2.1.33、2026-02-06）、`ConfigChange`（v2.1.49）、`WorktreeCreate`/`WorktreeRemove`（v2.1.50、2026-02-20）、`InstructionsLoaded`（v2.1.69、2026-03-05）、`Elicitation`/`ElicitationResult`・`PostCompact`（v2.1.76、2026-03-14）、`StopFailure`（v2.1.78、2026-03-17）、`PermissionDenied`（v2.1.89、2026-04-01）、`MessageDisplay`（v2.1.152、2026-05-27）、`PreModelSwitch`/`PostModelSwitch`（v2.1.251、2026-08-28）。`SubagentStart` は v2.0.43（2025 年、日付は未確認）。`PostToolBatch`・`UserPromptExpansion`・`CwdChanged`・`FileChanged`・`DirectoryAdded`・`Setup` が追加されたバージョンは確認していない。
- Skills（https://code.claude.com/docs/en/skills）: `SKILL.md` の frontmatter に `disable-model-invocation`・`user-invocable`・`context: fork`＋`agent`・`paths`・`hooks`・`model`・`effort`。description は合計 1,536 文字で切り詰め、本文は 500 行未満を推奨、compaction 後は呼んだ skill の先頭 5,000 トークンを再添付。同梱は `/batch`・`/code-review`・`/verify`・`/loop`・`/simplify`・`/workflow-authoring`・`/skill-doctor`・`/deep-research`。
- Memory（https://code.claude.com/docs/en/memory）: CLAUDE.md は「200 行未満を目標。長いほど遵守率が落ちる」。CLAUDE.md が無ければ AGENTS.md を読む（v2.1.277、2026-09-18）。`.claude/rules/` に `paths:` で範囲を絞る。auto memory は Claude が書く 4 種（user・feedback・project・reference）、`~/.claude/projects/<project>/memory/`（worktree 間で共有、v2.1.63）、先頭 200 行/25KB を注入。`/doctor prompt-audit` で古い・矛盾する指示を探す。
- Structured outputs（https://code.claude.com/docs/en/agent-sdk/structured-outputs）: `outputFormat: {type: "json_schema", schema}`（draft-07）。`StructuredOutput` ツールを足し、不一致なら再試行、尽きれば `error_max_structured_output_retries`。無効な schema は起動時エラー（v2.1.205）。workflow の `agent()` と subagent の `schema` も同じ仕組み。
- `/goal`（https://code.claude.com/docs/en/goal。v2.1.139、2026-05-11）: 完了条件を置くと、毎ターンの終わりに small fast model が「未達/達成/不可能」を判定する session-scoped の prompt-based `Stop` hook。条件の長さには上限がある（値は文書）。`-p` でも動く。バックグラウンド作業が残れば判定を延ばし、30 分で check-in。
- `/loop`・Monitor・予定実行（https://code.claude.com/docs/en/scheduled-tasks、https://code.claude.com/docs/en/tools-reference）: `/loop`（v2.1.71、2026-03-07）は間隔指定か自己ペース（`ScheduleWakeup`、60〜3,600 秒）、`loop.md`、7 日で失効、`CronCreate/List/Delete`、1セッション 50 件。Monitor（v2.1.98、2026-04-09）はスクリプトの出力を行ごとに受ける監視（既定 5 分、最長 30 分、`-p` では 10 分）。`TaskCreate/Get/Update/List` は Opus 4.7・Sonnet 4.6・Haiku 4.5 以前の既定で、新しいモデルでは opt-in（v2.1.268）。
- Permission modes と auto mode（https://code.claude.com/docs/en/permission-modes）: default(Manual)・acceptEdits・plan・auto・dontAsk・bypassPermissions。auto は分類器（既定 Sonnet 5、`CLAUDE_CODE_AUTO_MODE_MODEL` v2.1.302）が審査し、連続 3 回か累計 20 回で停止。対話セッションの既定は auto（v2.1.284、2026-09-28）、`-p`/SDK の既定は Manual（v2.1.302）。サブエージェントは「起動前の委譲文・各行動・最後の hand-back」の 3 点で審査され、`permissionMode` は無視。`--permission-prompts none`（v2.1.259）、`permissions.denyInsteadOfPrompting`（v2.1.319、2026-11-06）。
- Sandbox（https://code.claude.com/docs/en/sandboxing）: 既定オフ。macOS Seatbelt、Linux/WSL2 bubblewrap。ネットワークはプロキシ経由で `allowedDomains`。`excludedCommands` は完全に無制限になるので注意。strict mode で unsandboxed の再試行を禁止。
- Agent SDK（https://code.claude.com/docs/en/agent-sdk/overview。platform.claude.com は code.claude.com へ転送）: Claude Code と同じ agent loop を Python/TypeScript から使う。`agent-loop`: `maxTurns`・`maxBudgetUsd`（サブエージェントの支出も含む、v2.1.217）、自動 compaction は `compact_boundary` を流し、CLAUDE.md に要約の指示を書ける、`PreCompact` hook。`hooks`: TS のみのイベントが多い（`SessionStart`・`TeammateIdle`・`TaskCompleted` 等）、`onFailure: "block"`（TS v0.3.317 / Py v0.2.177）、`classifierContext`（v0.3.236）。`subagents`: `AgentDefinition`（上の frontmatter と同じ欄）、再開は `resume: sessionId`＋`agentId`、Workflow ツールは TS v0.3.149 から。`sessions`: `continue`・`resume`・`forkSession`・`resumeSessionAt`、`sessionStore` で外部保存、`listSessions()`。`claude-code-features`: `settingSources` の既定は user/project/local、agent teams は SDK から使えない、auto memory は `settingSources` に関わらず読まれる。`typescript`: `WorkflowInput {script | name | scriptPath, args, resumeFromRunId}`、出力は `async_launched`、`SDKMessageOrigin` は human/channel/peer/task-notification/coordinator/auto-continuation/unclassified。
- Managed Agents（https://platform.claude.com/docs/en/managed-agents/overview。ベータ、ヘッダー `managed-agents-2026-04-01`）: Agent・Environment・Session・Events の 4 概念、ホスト型のハーネス、self-hosted sandbox、scheduled deployments、dreaming は研究プレビュー。CHANGELOG v2.1.309（2026-10-22）は `/claude-api` スキルが Managed Agents のサブエージェントチームを `multiagent_20261001`（dynamic workflows が既定）で組むと記す。

## 4. OpenAI の勧め

- Harness engineering: leveraging Codex in an agent-first world（2026-02-11、https://openai.com/index/harness-engineering/。題は「fast-moving codebase」ではなく「agent-first world」）: 5 か月・約 100 万行・約 1,500 PR・3 人から 7 人・1人1日 3.5 PR・6 時間超の単独実行。要点は7つ。(1) "give Codex a map, not a 1,000-page instruction manual"。約 100 行の AGENTS.md は目次、`docs/` が system of record、設計文書・アーキテクチャ・品質の採点表・実行計画（PLANS.md）をバージョン管理。lint と CI で鮮度と相互リンクを検査し、"doc-gardening" エージェントが古い文書を直す PR を開く。(2) "From the agent's point of view, anything it can't access in-context while running effectively doesn't exist"。Slack の合意も repo に入れる。(3) "enforcing invariants, not micromanaging implementations"。層の依存方向・構造化ログ・命名・ファイルサイズを自作 lint で強制し、"we write the error messages to inject remediation instructions into agent context"。"When documentation falls short, we promote the rule into code"。(4) 可観測性として、worktree ごとに起動できるアプリ、Chrome DevTools Protocol、LogQL/PromQL を Codex に渡す。(5) 自己レビューと agent レビューが満足するまで回す（Ralph Wiggum loop）、人のレビューは必須でない。(6) ガベージコレクション。金曜日（20%）の手作業の掃除は破綻し、"golden principles" を repo に置いて背景タスクが逸脱を直す PR を開く（多くは 1 分で確認・自動マージ）。(7) ブロックするマージ関門は最小、"corrections are cheap, and waiting is expensive"。
- Unlocking the Codex harness: how we built the App Server（2026-02、https://openai.com/index/unlocking-the-codex-harness/。本文は読めず、検索結果の抜粋のみ）: App Server は Codex ハーネスを公開する JSON-RPC の protocol 兼 long-lived process。thread（耐久的な会話）・turn（作業単位）・item（入出力の原子）。公式 docs（https://learn.chatgpt.com/docs/app-server.md）では JSON-RPC 2.0、stdio/WebSocket、`thread/start`→`turn/start`→`item/*`→`turn/completed`、承認はサーバーからクライアントへの要求。CI やジョブの自動化には Codex SDK を勧める。
- An open-source spec for Codex orchestration: Symphony（2026-04-27、https://openai.com/index/open-source-codex-orchestration-symphony/、https://github.com/openai/symphony）: 人は 3〜5 セッションまでしか見られず、ボトルネックは人の注意。"Every open task gets an agent, agents run continuously, and humans review the results."。Linear を状態機械・制御盤にし、issue ごとに隔離ワークスペース、落ちたら再起動、ブロックされていないタスクだけ着手（DAG）、エージェント自身が後続の issue を切る。一部チームで PR が 3 週間で 500% 増。学びは "treating agents as rigid nodes in a state machine doesn't work well"、"giving agents objectives instead of strict transitions"。Symphony 自体は `SPEC.md`（Policy/Config/Coordination/Execution/Integration/Observability の層、repo 所有の `WORKFLOW.md` に YAML front matter＋プロンプト、`max_concurrent_agents` 既定 10、`after_create`/`before_run`/`after_run`/`before_remove` hook、指数バックオフ、DB なしの再起動復旧）。成功した実行は `Human Review` で終わってよい。
- Codex as a platform: build on the open agent harness（developers.openai.com/blog、日付なし）: 使い分けは `codex exec`（スクリプト・CI・構造化出力）、Codex SDK（アプリから起動・再開・ストリーム）、App Server（会話の維持・承認・ツール公開）。ハーネスの設計が結果を左右する（ARC-AGI-3 の例）。
- Introducing the Agents API（2026-09-10、https://openai.com/index/introducing-the-agents-api/。本文は読めず、検索結果の抜粋のみ）: Codex ハーネスをマネージド提供し、`max_concurrent_subagents` でサブエージェントに並列化。
- Codex docs: Best practices（https://learn.chatgpt.com/guides/best-practices）: プロンプトは Goal・Context・Constraints・Done when。難しい仕事は plan mode（`/plan`、Shift+Tab）か PLANS.md。AGENTS.md は "an open-format README for agents"、"A short, accurate AGENTS.md is more useful than a long file full of vague rules"、同じミスが 2 回出たら振り返らせて更新、タスク固有の内容は別 markdown へ。検証はテスト・lint・型検査・`/review`（base branch／未コミット／コミット／独自の基準）、`code_review.md` を AGENTS.md から参照、"At OpenAI, Codex reviews 100% of PRs."。境界の明確な探索・テスト・トリアージはサブエージェントへ。"skills define the method and scheduled tasks define the schedule"、手動で安定してから予定実行に。よくある失敗は、恒久的な規則をプロンプトに詰める、ビルド・テストの方法を渡さない、計画を省く、1 プロジェクトを 1 チャットで回す。
- Codex docs: AGENTS.md（https://learn.chatgpt.com/docs/agent-configuration/agents-md.md）: `~/.codex` のグローバル → プロジェクトルートから cwd へ、各ディレクトリで `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames` の 1 件、近いものが後ろに結合されて優先、合計 `project_doc_max_bytes`（既定 32 KiB）。規格は agents.md（Linux Foundation 配下の Agentic AI Foundation）。
- Codex docs: Subagents（https://learn.chatgpt.com/docs/agent-configuration/subagents.md）: 組み込みは `default`・`worker`・`explorer`。カスタムは `~/.codex/agents/`・`.codex/agents/` の TOML（`name`・`description`・`developer_instructions`、`model`・`model_reasoning_effort`、`features.*` の無効化）。`sandbox_mode`・`approval_policy`・`mcp_servers` は親から継承し上書き不可。`agents.max_concurrent_threads_per_session`。AGENTS.md や skill が求めれば委譲。読み取り中心の作業向きで、書き込みの並列は競合に注意。入れ子・深さの記載なし。
- Codex docs: その他: `/goal`（目標の設定・停止・再開、Goal mode は 2026-05-18〜22 に実験段階を終了）、`/compact`・`/fork`・`/subagents`・`/permissions`・`/init`（https://learn.chatgpt.com/docs/developer-commands.md）。auto-review（https://learn.chatgpt.com/docs/sandboxing/auto-review.md）は `approvals_reviewer = "auto_review"` で承認要求を別エージェントが審査、連続 3 回か直近 50 回中 10 回の拒否でターン中断、`/approve` で 1 回だけ再試行。hooks は 2026-05-11〜15 に GA（https://learn.chatgpt.com/docs/whats-new.md）。Memories（https://learn.chatgpt.com/docs/customization/memories.md）は既定オフで補助層、「必須のチーム方針は AGENTS.md に」。Scheduled tasks（https://learn.chatgpt.com/docs/automations.md）はローカル／worktree／cloud、2026-08 からイベント起動。Cloud（https://learn.chatgpt.com/docs/cloud.md）はタスクごとのワークスペースと公開済み環境の再利用。
- Cookbook: Using PLANS.md for multi-hour problem solving（https://developers.openai.com/cookbook/articles/codex_exec_plans。アーカイブ済み）: AGENTS.md から ExecPlan を指す。Progress・Decision Log・Validation を持つ生きた文書で、"it should always be possible to restart from only the ExecPlan"。単一プロンプトで 7 時間超。

## 5. 両社に共通する原則

- 起動時に読み込まれる指示は短い地図にし、正典はリポジトリ内の文書に置いて、必要なときに読ませる（OpenAI: 約 100 行の AGENTS.md と `docs/`。Anthropic: CLAUDE.md 200 行未満、`.claude/rules/`、skills の progressive disclosure）。
- 毎回守らせたい規則は文章でなく機械で強制する（OpenAI: 自作 lint・CI・構造テスト、"promote the rule into code"。Anthropic: hook・deny ルール・sandbox、"CLAUDE.md is for guidelines"）。
- 検証は書いた者と別の目で、実物を動かして行う（OpenAI: 自己レビュー→agent レビューのループ、CDP で UI を操作、動画の証跡。Anthropic: fresh-context の evaluator、Playwright、`/code-review` は会話を見ない、adversarial verification）。
- 記憶と進捗はファイルと git に残し、いつでも再開できる形にする（OpenAI: PLANS.md の Progress・Decision Log。Anthropic: feature list JSON・progress file・`PROGRESS.md`・`commit-on-stop`、MEMORY.md は小さく）。
- 作業はコンテキストを分けて委譲し、要約だけを戻す。読み取り中心の作業に向く（Codex subagents の説明、Claude の Explore/quarantine）。
- 人の注意が最大の制約で、承認は分類器に委ねる方向（Claude Code auto mode、Codex auto-review。どちらも連続拒否で止める）。
- 完了判定を別の判定者に置く（Claude `/goal` は small fast model の Stop hook、Codex Goal mode）。

## 6. 両社で言い方が違う点

- 計画の置き場: Anthropic は計画をスクリプト（Workflow、"a harness for every task"）か lead の task list に置き、途中結果を Claude のコンテキストに入れない。OpenAI は計画をチケット（Linear）と repo の文書（PLANS.md・`docs/`）に置き、エージェントには「状態遷移でなく目標」を渡す。
- ハーネスの寿命: Anthropic は部品がモデル世代で陳腐化すると繰り返し言い、v1→v2 で context reset とスプリントを外した。OpenAI の 2 記事は repo 側の構造（層・lint・GC）を蓄積資産として語る。
- 語り方: Anthropic は実測の数字と失敗率（$9 対 $200、FNR 17%、6 ポイントのノイズ）、OpenAI はスループット（1,500 PR、500% 増）と組織の変化。
- サブエージェントの権限: Codex は親の sandbox・approval を継承し上書き不可。Claude Code は `tools`・`permissionMode`（auto/bypass 時は無視）・`isolation` を定義で絞れる。
- 文書の鮮度: OpenAI は lint と doc-gardening エージェントで機械的に保つ。Anthropic は `/doctor prompt-audit` と dreaming（記憶の側）で、文書の鮮度の自動検査は見つからなかった。

## 7. 含意の候補

以下は推測で、診断は別の作業に任せる。

- tsukumo の `task-flow`（実装→受け入れ→振り返り）は、Anthropic の planner/generator/evaluator と OpenAI の「チケットが制御盤」の両方に形が近い。差が出そうなのは、受け入れ役が「会話を見ていない fresh context か」「実物を動かすか」、進捗が git とファイルに残って再開できるか、規則の強制が hook/deny か文章か、の 3 点だと推測する。
- 両社が 2026 年に足した `/goal`・Stop hook・Workflow・`maxTurns`・`maxBudgetUsd` は、流れの「終わり方」と「上限」を機械に持たせる道具で、オーケストレーターの文章の指示を減らせる可能性がある。
- Anthropic の「ハーネスはモデル世代で陳腐化する」は、流れの部品ごとに「どのモデルの弱点を補っているか」を書いておく価値を示唆する。

## 8. 確かめられなかったこと

- openai.com の 4 記事は直接の取得が 403。「Harness engineering」「Symphony」はテキスト化プロキシ経由で本文を読んだが、「Unlocking the Codex harness」「Introducing the Agents API」は 2 回目の取得が auto mode の分類器に止められたため未読。両記事の要点は検索結果の抜粋に依る。
- 「Harness engineering」の公開日 2026-02-11 は本文に日付が無く、検索結果（InfoQ 2026-02 など）の一致で推定した。著者名も本文からは取れていない。
- anthropic.com/engineering の一覧は「28 posts」のうち 24 件しか表示されず、残り 4 件は未確認（2026-06〜10 の記事が隠れている可能性は低いが否定できない。検索でも見つからなかった）。
- Claude Code の hook のうち `PostToolBatch`・`UserPromptExpansion`・`CwdChanged`・`FileChanged`・`DirectoryAdded`・`Setup` が追加されたバージョンと日付、`SubagentStart`（v2.0.43）の日付は確認していない。ドキュメントの changelog ページは 2.1.309〜2.1.319 の範囲しか読めず、それより前のバージョンは GitHub の CHANGELOG.md と releases の日付で補った。
- Agent SDK の TypeScript リファレンスは 33 万字のうち 30 万字まで読んだ。`SendMessage` の入力型は未確認。
- Codex docs に plan mode 単独のページは無く、「読み取り専用か」「承認の流れ」は確認できなかった。Codex サブエージェントの入れ子・深さの上限、`max_concurrent_threads_per_session` の既定値も記載が無い。
- Codex code review の「P0/P1 のみ報告」は第三者の説明にあるだけで、公式ページには無い。
- Claude Code の `claude-code-sandboxing`（2025-10-20）・`AI-resistant-technical-evaluations`（2026-01-21）・`eval-awareness-browsecomp`（2026-03-06）は題と日付だけ確認し、本文は読んでいない。
- Opus 4.7（2026-04-16）が auto mode を Max に広げたという記述は検索結果の抜粋で、本文は読んでいない。

## 出典一覧

Anthropic（engineering・blog・news）

- https://www.anthropic.com/engineering/building-effective-agents（2024-12-19）
- https://code.claude.com/docs/en/best-practices（2025-04-18 初出の engineering 記事から転送、改訂版）
- https://www.anthropic.com/engineering/multi-agent-research-system（2025-06-13）
- https://www.anthropic.com/engineering/writing-tools-for-agents（2025-09-11）
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents（2025-09-29）
- https://claude.com/blog/building-agents-with-the-claude-agent-sdk（2025-09-29。engineering から転送）
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills（2025-10-16）
- https://www.anthropic.com/engineering/code-execution-with-mcp（2025-11-04）
- https://www.anthropic.com/engineering/advanced-tool-use（2025-11-24）
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents（2025-11-26）
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents（2026-01-09）
- https://www.anthropic.com/engineering/infrastructure-noise（2026-02-05）
- https://www.anthropic.com/engineering/building-c-compiler（2026-02-05）
- https://www.anthropic.com/news/claude-opus-4-6（2026-02-05）
- https://www.anthropic.com/engineering/harness-design-long-running-apps（2026-03-24）
- https://www.anthropic.com/engineering/claude-code-auto-mode（2026-03-25）
- https://www.anthropic.com/engineering/managed-agents（2026-04-08）
- https://www.anthropic.com/engineering/april-23-postmortem（2026-04-23）
- https://www.anthropic.com/engineering/how-we-contain-claude（2026-05-25）
- https://www.anthropic.com/news/claude-opus-4-8（2026-05-28）
- https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/（2026-06-02）
- https://claude.com/blog/getting-started-with-loops（2026-06-30）
- https://www.anthropic.com/engineering/redesigning-source-control（2026-10-13）
- https://www.anthropic.com/engineering/components-of-agent-memory（2026-11-06）
- https://github.com/anthropics/cwc-long-running-agents

Claude Code / Agent SDK / Managed Agents のドキュメント（2026-11-08 閲覧）

- https://code.claude.com/docs/en/agents、/workflows、/sub-agents、/agent-teams、/hooks、/skills、/memory、/goal、/scheduled-tasks、/tools-reference、/permission-modes、/sandboxing、/code-review-local、/changelog
- https://code.claude.com/docs/en/agent-sdk/overview、/agent-loop、/hooks、/subagents、/sessions、/structured-outputs、/claude-code-features、/typescript
- https://platform.claude.com/docs/en/managed-agents/overview
- https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md と `gh api repos/anthropics/claude-code/releases`（バージョンの日付）

OpenAI（openai.com・developers.openai.com・learn.chatgpt.com・GitHub）

- https://openai.com/index/harness-engineering/（2026-02-11）
- https://openai.com/index/unlocking-the-codex-harness/（2026-02。未読）
- https://openai.com/index/open-source-codex-orchestration-symphony/（2026-04-27）、https://github.com/openai/symphony
- https://openai.com/index/introducing-the-agents-api/（2026-09-10。未読）
- https://developers.openai.com/blog/codex-as-a-platform（日付なし）
- https://developers.openai.com/cookbook/articles/codex_exec_plans（アーカイブ済み）
- https://learn.chatgpt.com/guides/best-practices、/docs/agent-configuration/agents-md.md、/docs/agent-configuration/subagents.md、/docs/code-review.md、/docs/cloud.md、/docs/automations.md、/docs/customization/memories.md、/docs/developer-commands.md、/docs/app-server.md、/docs/sandboxing/auto-review.md、/docs/whats-new.md
- https://agents.md/
