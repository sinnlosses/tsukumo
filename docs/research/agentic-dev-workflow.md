# AI コーディングエージェント時代の開発フローと、このリポジトリの運用の見直し（2026-10-03）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。AI コーディングエージェントを使う個人〜小規模開発の主流のフローを、主要ベンダーの
公式ドキュメント・公式リポジトリに遡って調べ、このリポジトリの現行の運用と比べた記録。
会話の実物・transcript は読んでいない。

## 調べた疑問

1. いまの主流の開発フローは、AI コーディングエージェント（Claude Code・Codex・Cursor・Copilot
   coding agent）を使う個人〜小規模開発でどうなっているか。観点はタスク管理・ブランチ戦略・
   レビュー・クラウド/バックグラウンドエージェント・並列エージェントと worktree・spec 駆動開発・検証
2. それと比べて、このリポジトリの現行ワークフローに良くない点・見直す価値のある点はどこか。
   対象ユーザーは作者本人のみ、という前提で評価する

## 要約

- ベンダーの公式の推奨はおおむね同じ形に収束している。**よく書かれた課題（完了条件つき）を
  エージェントに渡す → 隔離された環境（worktree かクラウドの VM）で枝を切って作業させる →
  エージェント自身にテストを回させる → 人が差分を読む（PR）→ マージ**。PR とレビューを
  受け入れの場に置くのは、クラウドのエージェント（Claude Code のクラウドセッションと routines・
  Copilot・Codex・Cursor）が揃って採る形
- 一方で、**CI もコードレビューの仕組みも、人の目に代わる「独立した2つ目の確認」として推されている**。
  Anthropic は「作業したエージェントに採点させない」ことを明示的に勧める
- 現行の運用は、単独開発で PR を省き、`main` へ直接入れる前に手元で全検証を通す形で、
  trunkbaseddevelopment.com が「小さなチームが trunk へ直接 push するときの必須の前提」と
  呼ぶものをスクリプトで機械的に守っている。ここは主流と比べても理にかなっている
- 見直す価値が高いのは、(1) 受け入れに**新しい文脈のレビュー**が組み込まれていない、
  (2) **手元の外に検証も控えも無い**（CI が無く、`origin/main` は頼まれたときしか進まない）、
  (3) 運用の正典（`CLAUDE.md`・`WORKFLOW.md`・`next-task` の `SKILL.md`）が公式の推奨より
  かなり長い、の3つ

## 主流のフロー（観点ごと）

### 1. 全体の型: 探る → 計画 → 実装 → 検証 → コミット

- Anthropic の Claude Code 公式ベストプラクティスは、作業を Explore・Plan・Implement・Commit の
  4段に分け、計画は「やり方に確信がないとき・複数のファイルを変えるとき・慣れないコードを触るとき」
  に有用で、「差分を1文で言えるなら計画は飛ばす」とする。
  出典: <https://code.claude.com/docs/en/best-practices>（"Explore first, then plan, then code"）
- 同じ文書は、大きめの機能では Claude にインタビューさせて spec を書き、**新しいセッションで**
  実行することを勧める。良い spec は「関わるファイルとインターフェースを名指し、範囲外を述べ、
  機能が動くことを示す端から端までの検証手順で終わる」。
  出典: 同上（"Let Claude interview you"）
- 制約の中心は文脈の窓で、「研究はサブエージェントに出し、関係ない作業の間は `/clear`」を
  繰り返し勧める。出典: 同上（"Use subagents for investigation"・"Manage context aggressively"）

### 2. 検証: エージェントに「通るか落ちるか」を返す仕組みを渡す

- 「Claude が走らせられる確認（テスト・ビルド・見比べるスクリーンショット）を渡す。それが、
  見張るセッションと離れられるセッションの違い」。確認の強さは4段で、1つのプロンプトの中・
  `/goal` の条件・**Stop hook による決定的な関門**・**別の文脈のサブエージェントによる2つ目の意見**。
  「成功を言い張らせず証拠（テストの出力・打ったコマンドと結果・スクリーンショット）を見せさせる」。
  出典: <https://code.claude.com/docs/en/best-practices>（"Give Claude a way to verify its work"）
- Copilot coding agent も「自分の開発環境でビルド・テスト・検証できると、すぐマージできる良い PR を
  作りやすい」とし、環境の事前準備（`copilot-setup-steps.yml`）を勧める。
  出典: <https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results>
- Cursor は環境の用意を「クラウドエージェントの効果を上げるいちばん重要な段」と書く。
  出典: <https://cursor.com/docs/cloud-agent>

### 3. タスク管理: よく書かれた課題を、エージェントが読める場所に置く

- Copilot の公式の推奨: 理想の課題は「解く問題の明確な記述・完了条件（例: 単体テストが要るか）・
  変えるべきファイルの指示」を含む。向くのはバグ修正・UI の改善・テストの追加・文書・技術的負債で、
  向かないのは広くて曖昧な課題・本番の重大障害・セキュリティに関わるもの。
  出典: <https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results>
- 主要なクラウドエージェントは **GitHub の Issue / PR を入口**にする: Copilot は Issue を割り当てると
  枝と PR を作る（同上）、Claude Code の GitHub Action は `@claude` の言及で Issue を PR に変える
  （<https://code.claude.com/docs/en/github-actions>）、Cursor は Slack・GitHub の PR コメント・
  Linear から起こせる（<https://cursor.com/docs/cloud-agent>）
- エージェント向けのローカルの課題管理として Beads が「コーディングエージェントのための永続的で
  構造化された記憶」「散らかった Markdown の計画を依存つきのグラフで置き換える」と自らを説明し、
  `bd ready`（妨げの無いタスクの一覧）と `bd update --claim`（原子的な着手）を持つ。
  出典: <https://github.com/steveyegge/beads>
- **「ローカルのトラッカーを正にして GitHub を写しにする」形が主流かどうかは確かめられなかった**
  （ベンダーの公式文書は GitHub の Issue を正とする例ばかりで、ローカル正を推す公式の記述は
  Beads 自身のもの以外に見つからない）

### 4. ブランチ戦略: 短命の枝、エージェントは専用の枝へ

- DORA の trunk-based development の定義は「各開発者が仕事を小さく分け、少なくとも1日1回 trunk へ
  マージする」、枝の寿命は「数時間以内」、アクティブな枝は「3本以下」。CI は「trunk-based development と、
  コミットごとに走る速い自動テストの組み合わせ」。
  出典: <https://dora.dev/capabilities/trunk-based-development/>
- DORA の AI Capabilities Model（7項目）は **「強いバージョン管理の習慣」**（頻繁なコミットと
  ロールバックの活用が AI の効果を増幅する）と **「小さな単位で働く」** を AI 時代にこそ効く
  能力として挙げる。
  出典: <https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model>
- trunk へ直接 push する形について trunkbaseddevelopment.com は、「おそらく互いの作業を知っている
  小さなチーム」が選ぶもので、**push の前に CI と同じ全ビルドを手元で通し、通ったときだけ trunk へ
  入れることが「欠かせない統合の作業」**（文面上きれいな自動マージが意味的に壊れた trunk を
  生むのを防ぐ唯一のもの）とする。
  出典: <https://trunkbaseddevelopment.com/committing-straight-to-the-trunk/>
- クラウドのエージェントは揃って**専用の枝へ push し、既定の枝へは直接入れない**:
  Copilot は `copilot/` の枝にしか push できず、依頼した本人は PR を承認できず、Actions の
  ワークフローは書き込み権限のある人が承認するまで走らない
  （<https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations>）。
  Claude Code の routines は `claude/` の枝へ push する（<https://code.claude.com/docs/en/routines>）。
  Cursor は別の枝で作業して push する（<https://cursor.com/docs/cloud-agent>）
- GitHub flow（公式）は 枝 → コミット → PR → レビュー → マージ → 枝の削除 で、PR を省く
  単独開発の場合には触れていない。出典: <https://docs.github.com/en/get-started/using-github/github-flow>
- **「単独開発者は PR を省くのが主流」と言える一次情報は見つからなかった**

### 5. レビュー: 人の PR レビュー＋ AI の2つ目の目

- Anthropic は「長く無人で動かすほど、完了とみなす前の独立した確認が大事」とし、**新しい文脈の
  サブエージェントに差分と基準だけを見せてレビューさせる**ことを勧める（同梱の `/code-review`、
  または計画に照らす自前のプロンプト）。同時に、「穴を探せと言われたレビュアーは健全な作業にも
  何か報告する。全部追うと過剰設計になるので、正しさと要件に関わる穴だけを指摘させる」と注意する。
  出典: <https://code.claude.com/docs/en/best-practices>（"Add an adversarial review step"）
- Writer/Reviewer の型（書いたセッションと別のセッションでレビュー）: 「新しい文脈は、書いたばかりの
  コードに偏らないのでレビューを良くする」。出典: 同上（"Run multiple Claude sessions"）
- マネージドの PR レビュー: Claude Code Review（Team・Enterprise 向けの research preview、1回平均
  15〜25ドル、マージを止めない neutral の check run、`REVIEW.md` で調整）
  （<https://code.claude.com/docs/en/code-review>）、Codex の `@codex review`（P0・P1 だけを指摘、
  `AGENTS.md` で調整）（<https://developers.openai.com/codex/integrations/github>）。
  どちらも **PR が前提**。PR を使わないなら、ローカルの `/code-review` が同じ役を担う（同上の Claude Code Review の文書「Review a diff locally」）

### 6. クラウド/バックグラウンドのエージェント

- Claude Code のクラウドセッション: Anthropic の VM で動き、ラップトップを閉じても続く。`claude --cloud`
  は**手元のチェックアウトではなく GitHub の remote の今の枝を clone する**ので、ローカルのコミットは
  先に push する。結果は PR かテレポートで受け取る。PR の CI 失敗とレビューコメントに自動で
  応える Auto-fix もある。出典: <https://code.claude.com/docs/en/claude-code-on-the-web>
- routines（research preview）: 保存したプロンプト・リポジトリ・コネクタを、スケジュール（最短1時間）・
  API・GitHub のイベントで起こす。例は夜間の backlog 整理・PR レビュー・文書のずれの検出。
  実行は承認なしで進み、結果は `claude/` の枝・PR・セッションで返る。
  出典: <https://code.claude.com/docs/en/routines>
- claude-code-action（GitHub Actions）: `@claude` の言及か `prompt` 指定の自動実行。CI の上で動き、
  Actions の時間と API トークン（またはサブスクリプションの OAuth トークン）を使う。
  出典: <https://code.claude.com/docs/en/github-actions>
- スケジュールの置き場の使い分け（Anthropic）: クラウドの routines は「PC を閉じていても動く」、
  Desktop の予定タスクは「ローカルのファイル・ツール・未コミットの変更が要る」とき、`/loop` は
  「開いたセッションの中の手早いポーリング」。出典: <https://code.claude.com/docs/en/common-workflows>（"Run Claude on a schedule"）
- Codex cloud は各タスクを独立したクラウドの作業場で走らせ、差分を見てフォローアップを頼み、
  コミットか PR にする（<https://learn.chatgpt.com/docs/cloud>）。Cursor の Cloud Agents は
  隔離された VM で枝を切り、テストし、動画・スクリーンショット・ログを付けた PR を出す
  （<https://cursor.com/docs/cloud-agent>）

### 7. 並列エージェントと worktree

- Claude Code は worktree を並列の基本に置く: `claude --worktree <名前>` で `.claude/worktrees/` に
  枝ごとの作業ツリーを作り、サブエージェントも `isolation: worktree` で隔離できる。作業ツリーに
  入ったセッションが本体のチェックアウトを触る編集・git 操作は塞がれる。`.worktreeinclude` で
  gitignore された `.env` などを写す。
  出典: <https://code.claude.com/docs/en/worktrees>
- 並列の手段の一覧（worktree・セッション間のメッセージ・Desktop・クラウド・agent view・agent teams）と、
  大きな移行を5〜30のサブエージェントに割る `/batch`。出典: <https://code.claude.com/docs/en/best-practices>（"Run multiple Claude sessions"・"Fan out across files"）

### 8. spec 駆動開発

- GitHub Spec Kit: 「どう作るかの前に、何を・なぜを定める」。`constitution` → `specify` → `plan` →
  `tasks` → `implement` → `converge`（収束するまで実装と照合を繰り返す）。
  出典: <https://github.com/github/spec-kit>
- Kiro: requirements（またはバグの分析）→ design → tasks の3段で `requirements.md`・`design.md`・
  `tasks.md` を作る。よく分かった機能には承認の関門なしで3つを作る Quick Spec がある。
  出典: <https://kiro.dev/docs/specs/>
- Anthropic の推奨も「インタビュー → SPEC.md → 新しいセッションで実行」で、同じ方向
  （上の1.）

### 9. エージェントへの常設の指示

- `CLAUDE.md` は「短く、人が読める形に」。各行について「消したら Claude が間違えるか」を問い、
  そうでなければ消す。「長すぎる CLAUDE.md は、大事な規則が埋もれて半分無視される」。
  たまにしか要らない手順はスキル（必要なときだけ読まれる）へ。「例外なく毎回起きてほしいこと」は hook へ。
  出典: <https://code.claude.com/docs/en/best-practices>（"Write an effective CLAUDE.md"・"Set up hooks"）
- `AGENTS.md` は Codex・Copilot・Cursor・Gemini CLI など20以上の道具が読む共通形式で、
  Linux Foundation 傘下の Agentic AI Foundation が管理する。出典: <https://agents.md/>

## 現行のワークフロー（2026-10-03・このリポジトリの main の時点）

読んだもの: `CLAUDE.md`「Git運用」「タスク運用」、`docs/workflow.md`「作業ツリーを並行させるとき」
「タスクに紐付かない作業を main へ送る」、`~/.claude/skills/task-workflow/WORKFLOW.md`「difficulty と
モデルの切り替え」「1サイクル」「送り出し」「Beads 方式」、`~/.claude/skills/next-task/SKILL.md` の冒頭。

- タスクの正は Beads（本体の作業ツリーの根の `.beads`。git の外）で、GitHub の Issue と Project 1 は
  その写し（失敗してもタスクの操作は止めない）。指示は `develop/direction.md` に書き、`/plan-tasks` が
  タスクにする
- `/next-task` が1件を選び、着手の印を立て、`difficulty` と同じモデルのサブエージェントに委譲する
  （「一致していても委譲する——理由はモデルではなく文脈の隔離」）。`## やること` を作業より先に書いたかを
  機械が確かめる。受け入れはメインが差分を読み、検証コマンドの結果で決める
- 枝は作業ツリー（orca）ごとに1本で自分では切らない。PR は使わず、`tw ship` / `scripts/ship.ts` が
  `git rebase main` → `pnpm run check` → `merge --ff-only` で `main` へ入れる。merge commit は作らない
- 検証は `pnpm run check`（typecheck・lint・format:check・単体テスト・E2E。文書だけなら軽い段だけ）
- `.github/` は無く、CI は無い。push は頼まれたときだけで、調べた時点で `origin/main` は手元の `main` より7コミット遅れていた
- 量の目安: 2026-09-26 からの1週間で `main` に547コミット（うちタスクの件名を持つもの180）。
  `CLAUDE.md` 約16KB、`docs/workflow.md` 約21KB、`WORKFLOW.md` 約78KB、`next-task/SKILL.md` 約49KB

## 現行との比較

| 観点         | 主流（公式の推奨）                                             | 現行                                                                    | 評価                                                                                                        |
| ------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| タスクの入口 | GitHub の Issue を正にし、そこからエージェントを起こす         | Beads が正、Issue は写し                                                | 単独・ローカルのエージェントなら妥当。クラウドのエージェントの入口は Issue なので、使うなら写しの鮮度が要る |
| 課題の書き方 | 問題・完了条件・触るファイルを書く                             | `## 完了条件`・`## やること`（作業前に書いたかを機械が確かめる）        | 主流より厳密                                                                                                |
| ブランチ     | 短命の枝＋ PR、エージェントは専用の枝                          | 作業ツリーごとの枝から検証済みのものを `main` へ ff                     | trunk への直接 push の作法どおり。単独なら理にかなう                                                        |
| 統合前の検証 | エージェントが自分でテストを回す＋ CI                          | `ship` の中で rebase 後に全検証、通らなければ入れない                   | 主流と同等以上。ただし手元でしか走らない                                                                    |
| レビュー     | 人の PR レビュー＋新しい文脈の AI レビュー                     | メインが差分を読む。`/code-review` は手で呼べるがサイクルに無い         | 独立した2つ目の確認が欠けている                                                                             |
| 隔離・並列   | worktree（`--worktree`・`isolation: worktree`）かクラウドの VM | orca の作業ツリー＋ Beads の原子的な着手                                | 同じ考え方。ポートとホームの共有が固有の弱点（`docs/workflow.md` に既出）                                   |
| 無人の実行   | routines・Actions・クラウドセッション（PC が閉じていても動く） | `/loop /next-task`（開いたセッションの中）                              | 手元に縛られる。tsukumo の目視・orca に依存する作業には手元が正しい                                         |
| spec         | Spec Kit・Kiro の 要件 → 設計 → タスク                         | `docs/requirements.md`＋ ADR ＋ `/plan-tasks`                           | すでに spec 駆動の形                                                                                        |
| 常設の指示   | 短く。たまにしか要らないものはスキル、毎回のものは hook        | `CLAUDE.md` 約16KB、運用の正典が合わせて約16万字                        | 公式の「短く」から離れている                                                                                |
| 控え         | 頻繁なコミットと push、ロールバック                            | 頻繁なコミット。push は頼まれたときだけ。Beads のバックアップは別にある | 作業の控えが1台に寄っている                                                                                 |

## 見直す価値のある点（優先度順）

### 高 1. 受け入れに「新しい文脈のレビュー」を入れる

- 現行の受け入れは、委譲したメインが差分を読み、検証コマンドで決める。委譲先とは別の文脈ではあるが、
  メインはタスクを選び・指示を書いた側で、Anthropic が勧める「差分と基準だけを見る」レビュアーではない。
  `code-review` スキル（Standards と Spec の2軸）はあるのに、`/next-task` の1サイクルに入っていない
- 案: `difficulty: opus` のタスクと、コードに触れたタスクだけ、`tw done` の前に `/code-review` 相当の
  レビューを新しいサブエージェントで走らせる。指摘は「正しさと完了条件に関わるものだけ」に絞る
  （公式の過剰設計の注意どおり）
- 根拠: <https://code.claude.com/docs/en/best-practices>（"Add an adversarial review step"・Writer/Reviewer）、
  <https://code.claude.com/docs/en/code-review>（"Review a diff locally"）

### 高 2. 手元の外にも検証と控えを1つ置く

- CI が無く、`origin/main` は頼まれたときしか進まない。検証は手元の `pnpm run check` だけで、
  「頻繁なコミット」はあるが「手元の外の控え」は弱い。trunk への直接 push の作法は「CI と同じビルドを
  手元で」が前提で、CI そのものが要らないとは言っていない
- 案（小さい順）: (a) `ship` が通ったら `origin/main` へ push する（外部への送信なので人の承認が要る。
  `CLAUDE.md` の IMPORTANT）、(b) 最小の GitHub Actions で `pnpm run check` の軽い段（typecheck・lint・
  単体）だけを `main` への push で走らせる。E2E と目視は手元に残す
- 根拠: <https://dora.dev/capabilities/trunk-based-development/>（CI の定義）、
  <https://trunkbaseddevelopment.com/committing-straight-to-the-trunk/>、
  <https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model>（強いバージョン管理の習慣）

### 中 3. 運用の正典を短くする

- 公式の推奨は「`CLAUDE.md` は短く、毎回読むのは毎回要るものだけ」。このリポジトリの `CLAUDE.md` は
  約16KBで、`/next-task` が読む `SKILL.md`（約49KB）と `WORKFLOW.md`（約78KB）は1サイクルのたびに
  入る。各行に「消したら間違えるか」を当て、機械が守っているもの（hook・lint・`tw` の終了コード）は
  文面から降ろす余地がある
- 根拠: <https://code.claude.com/docs/en/best-practices>（"Write an effective CLAUDE.md"・"The over-specified CLAUDE.md"）
- 注: このリポジトリにはすでに `token-usage-diet`・`maintenance-docs` スキルがあるので、測ってから削れる

### 中 4. 委譲先の「完了」を Stop hook か `/goal` で機械的に締める

- 今は委譲先に `tw verify` を打たせ、メインが `tw verify-check` で確かめる。Anthropic は検証の強さの
  段として、`/goal` の条件と Stop hook（通るまでターンを終わらせない）を挙げる。委譲先が検証を
  打たずに止まる事故があるなら、文面の指示より hook が確実
- 根拠: <https://code.claude.com/docs/en/best-practices>（"Give Claude a way to verify its work"）
- 注: 委譲先が検証を飛ばした実例がどれだけあるかは確かめていない。無ければ見送ってよい

### 低 5. 無人で回したい作業だけ routines を試す

- 夜間の文書のずれの検出・依存の監査のように、手元の tsukumo・orca・目視に依存しない作業は、
  routines（PC が閉じていても動く）に出せる。ただし routines は GitHub から clone し `claude/` の枝・PR で
  返すので、現行の「PR なし」「push は頼まれたときだけ」と衝突する。試すなら読むだけの点検
  （結果を Issue に書くなど）から
- 根拠: <https://code.claude.com/docs/en/routines>、<https://code.claude.com/docs/en/common-workflows>（"Run Claude on a schedule"）

### 低 6. Claude Code 組み込みの worktree との関係を書いておく

- Claude Code は `--worktree` と `isolation: worktree` で作業ツリーを自前で作り、本体を触る操作を塞ぐ。
  orca の作業ツリーと二重になると、本体の判定や `.claude/worktrees/` の置き場が食い違いうる。
  「サブエージェントに `isolation: worktree` を使わない（orca が分ける）」のように、使い分けを
  `docs/workflow.md`「作業ツリーを並行させるとき」に1行書いておく価値がある
- 根拠: <https://code.claude.com/docs/en/worktrees>

## 現行のままでよい点

- **PR を使わず `main` へ直接入れること。** 対象ユーザーが作者本人のみで、他人のレビューを待つ
  必要が無い。trunkbaseddevelopment.com が直接 push の必須条件とする「push の前に全ビルドを手元で通し、
  通ったときだけ入れる」を `ship.ts`（rebase → check → ff、先を越されたらやり直し）が機械的に守っている。
  DORA の「短命の枝・1日1回以上の統合」にも合う（1週間で547コミット）
- **merge commit を作らず ff だけで送ること。** 送ったあとの `main` の木が直前に検証した木と同じになる
  （`WORKFLOW.md`「送り出し」）
- **タスクに完了条件と「作業より先に書いた計画」を持たせること。** Copilot の推奨（問題・完了条件・
  触るファイル）より厳密で、Spec Kit・Kiro・Anthropic の「計画と実装を分ける」に合う
- **委譲で文脈を隔離すること。** Anthropic の「文脈の窓がいちばん大事な資源」「研究はサブエージェントへ」と
  同じ考え方で、実測（委譲269件）まで持っている
- **Beads を錠に使うこと。** 並列の作業ツリーで原子的に着手を取るのは Beads の想定どおりの使い方
  （<https://github.com/steveyegge/beads>）で、GitHub は写しにとどめているので GitHub に届かなくても
  手が止まらない
- **要件・ADR・指示メモ → タスクの流れ。** すでに spec 駆動開発の形になっている
- **規則を hook に寄せていること**（`scripts/deny-*.ts`）。公式の「例外なく毎回起きてほしいことは hook」に合う

## 確かめられなかったこと

- 「単独開発者は PR を省くのが主流」と言える一次情報（公式の GitHub flow は PR を前提にし、
  単独の場合に触れていない）
- 「ローカルのトラッカーを正にし、GitHub Issue を写しにする」形の普及度（公式の例は Issue を正にする）
- DORA の AI Capabilities Model の各項目の数値的な効果の大きさ（本文の PDF までは読んでいない）
- Codex cloud の枝の名前の決まりと、既定の枝へ直接 push できるか（公式の概要ページに記述が無かった）
- Kiro の EARS 記法の詳細（取得したページには書かれていなかった）
- このリポジトリで、委譲先が検証を飛ばして止まった事例の件数（4. の要否に関わる。調べていない）
