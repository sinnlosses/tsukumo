# コーディングエージェントのハーネスを作る実務者・他社は、何をどう組み、何を学んだと公表しているか（2026-11-08）

状態: 調査メモ。tsukumo への適用の判断はしていない（診断の材料）。

問い: 2026年11月8日時点で、コーディングエージェントのハーネス（harness）を作っている実務者・他社は、何をどう組み、何を学んだと公表しているか。
調べた日: 2026-11-08。
調べ方: 当事者の公式ブログ・ドキュメント・README・講演の記録を WebFetch で読み、2026年7月〜11月の新しい記事は WebSearch（extended）で探した。
解説記事・まとめ記事（Marmelab の索引など）は、指している一次情報に遡ってから引いた。読めなかったページは 4 章に書き、内容を推測で埋めていない。
Anthropic・OpenAI の記事は既存の `docs/research/harness-strategy.md`（2026-10-17）・`agent-harness-adoption-2026-11-01.md` が扱っているので、本文書は他社・実務者を主にし、重なる部分は短く触れるだけにした。

## 結論の要約

- **「ハーネス＝モデル以外のすべて」という定義は揃った**（LangChain 2026-03-10・Böckeler 2026-04-02・Factory 2026-10-29・Osmani 2026-04-19）。モデルを固定したままハーネスだけで性能が動くことを、LangChain（Terminal-Bench 2.0 で 52.8%→66.5%）・Factory・Cognition・調査論文（同じモデルで最大 20.8 ポイント差）が別々に示している
- **書き手は1本、知恵は複数**。Cognition は 2025-06「Don't Build Multi-Agents」を 2026-04-22 に改め、書き込みは単一スレッドにし、他のエージェントは判定・相談・計画で知恵を出す、という形に落ち着いた。Cursor が数百体で組んだ階層でも、worker 同士は通信させず、統合役と判定役を外したあとに収束した
- **判定役は作り手と分け、新しい文脈で判定させる**（Anthropic 2026-03-24・Cognition 2026-04-22・LangChain 2026-09-08）。ただし LLM の判定役は誤る（2026-07 の実験では強い判定役でも実の改善の 38% を却下）ので、テスト・リンタ・実行結果という外部の根拠を上位に置く
- **文章の指示より機械の強制**。Stripe は受動的なヒントは読まれずエラーは読まれると結論し（2026-05-14）、Cursor は制約が指示より効くと書き、Böckeler は guides（前向き）と sensors（後向き）に分けて、sensors のメッセージを LLM 向けに書く
- **ループには外部の背圧と上限を置く**。Ralph の原型（2025-07-14）は、1ループに1件、毎回新しい文脈、テストと型検査が悪い出力を拒むという形。Stripe は CI を 2 周で人へ戻し、LangChain は同じファイルの編集回数で堂々巡りを検知し、Karpathy は 5 分の固定予算で keep/discard を回す
- **ハーネスの規則は失敗から起こし、期限を付けて消す**。Hashimoto は AGENTS.md の各行が1つの失敗に遡ると書き、Anthropic・LangChain・Osmani は、各部品はモデルができないことの仮定を符号化しており仮定は古びる、と揃って書く。LangChain・Factory・Google・VS Code は trace を読んで変更を仮説つきで提案し、実験で測り、人が承認する改良ループを持つ
- **人の介入点は「計画の承認」「主要なコードの査読」「上限に当たったとき」に寄せる**（HumanLayer ACE-FCA・Cursor long-running・Ball・Stripe）。Böckeler は「ハーネスの目的は人を外すことではなく人の注意を要る所へ向けること」

## 1. 事例

### 1.1 LangChain の Deep Agents と harness engineering

- Deep Agents（Harrison Chase、2025-07-30、<https://www.langchain.com/blog/deep-agents>）: Claude Code を手本に、通常のツール呼び出しループへ4つを足したものを deep agent と呼ぶ。詳細なシステムプロンプト・計画ツール（Claude Code の todo は機械的には no-op で、注意を保つ context engineering の道具）・サブエージェント（文脈の管理と役割の分担）・ファイルシステム（長く走る間の記憶と、サブエージェントとの共有の作業場）
- 多エージェントの是非（Chase、2025-06-16、<https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems>）: Cognition と Anthropic の記事は見かけほど対立していない。「読む」仕事は並列にしやすく、「書く」仕事の衝突は読みの衝突よりはるかに悪い。コーディングは共有の文脈と依存が多く、2025 年時点では多エージェントに向かない
- harness engineering の実例（Vivek Trivedy、2026-02-17、<https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering>）: モデルを gpt-5.2-codex に固定し、Terminal-Bench 2.0（89 問）で 52.8% → 66.5%（Top 30 外 → Top 5）。変えたのは4 段（Planning & Discovery・Build・Verify・Fix）のシステムプロンプト、終了前に仕様との照合を挟む `PreCompletionChecklistMiddleware`、起動時に作業ディレクトリと道具の所在を写す `LocalContextMiddleware`、「採点はプログラムのテストで行う」と告げる指示、時間予算の警告、同じファイルの編集が N 回を超えたら「やり方を見直せ」と出す `LoopDetectionMiddleware`、推論努力の xhigh-high-xhigh の「サンドイッチ」（xhigh 一律は 53.9%、high は 63.6%）。方法は LangSmith の trace を「Trace Analyzer」スキルが読み、並列のエラー分析エージェントが失敗の型を出し、人が任意で承認する。学び: 「モデルは最初にもっともらしい解へ偏る」「道具と推論は一緒にデバッグする」「課題に過適合した変更は他で退行する」「今日の弱点に合わせて設計し、賢いモデルで溶けることを織り込む」
- 定義（Trivedy、2026-03-10、<https://www.langchain.com/blog/the-anatomy-of-an-agent-harness>）: 「Agent = Model + Harness」「If you're not the model, you're the harness」。部品はシステムプロンプト・ツール/スキル/MCP・同梱の基盤（ファイルシステム・サンドボックス・ブラウザ）・編成（サブエージェント・handoff・モデルの振り分け）・hooks と middleware（圧縮・継続・lint）。ファイルシステムを「最も基礎的な部品」と呼ぶ
- runtime と harness の分離（Runkle・Trivedy、2026-04-20、<https://www.langchain.com/blog/runtime-behind-production-deep-agents>）: 「To build a good agent, you need a good harness. To deploy that agent, you need a good runtime」。durable execution は super-step ごとに `thread_id` で checkpoint を書き、落ちた所から再開する。`interrupt()` で状態を保存して人を待ち、`Command(resume=...)` で再開（承認・却下だけでなく編集した草稿も返せる）。「本番で何をするかは走らせるまで分からない」ので trace と online eval が改良の軸
- サブエージェントの文脈（Bengre・Curme、2026-09-08、<https://www.langchain.com/blog/organizing-context-in-a-multi-agent-harness>）: isolated（既定。課題の文だけ渡す）と fork（監督役の履歴を引き継ぐ）の2択。**検証役と調査役は isolated**（「監督役の診断に引きずられずに成果そのものを判定する」）、作業の続き手と記憶役は fork。測った数は無い
- NVIDIA との事例（2026-07-08、<https://blogs.nvidia.com/blog/nemotron-langchain-agents-open-stack/>）: Nemotron 3 Ultra の trace を読み、再学習ではなくプロンプト・ツール説明・middleware を変えた。「Every gain came from engineering the environment around the model, not the model itself」

### 1.2 Cognition の単一スレッドの書き手と新しい文脈の判定役

- Don't Build Multi-Agents（Walden Yan、2025-06-12、<https://cognition.com/blog/dont-build-multi-agents>）: 原則は「文脈を共有し、個々のメッセージではなく trace 全体を共有する」「行為は暗黙の決定を運び、矛盾する決定は悪い結果を運ぶ」。Flappy Bird の例では、文脈を共有しても2体の見た目の前提がずれる。勧めるのは単一スレッドの線形エージェントと、長い仕事のための履歴圧縮モデル（小さいモデルを fine-tune した）。「理論はおそらく完全ではなく変化を見込む」と留保
- Multi-Agents: What's Actually Working（Yan、2026-04-22、<https://cognition.com/blog/multi-agents-working>）: 「multi-agent systems work best today when writes stay single-threaded」。効いた型は3つ。(1) 文脈を共有しない査読役。「コーディング役と査読役が事前に文脈を共有しないとき最もよく働く」。査読役は仕様を知らず実装から逆に推論し、差分だけを見るので文脈の腐敗も避ける。偏りの共有はエゴではなく訓練から来る。(2) 強い別モデルに相談する Smart Friend。SWE-1.5 は主役としては足りず、両方が強いときだけ効く。(3) map-reduce-and-manage。管理役が分け、子が実行し、管理役が統合して報告する（内部の MCP で進捗を取る）。並列の書き手の swarm・勝手に交渉する非構造の swarm は「ほとんど気を散らすもの」。残る課題は通信（いつ上へ上げるか、子の発見をどう表に出すか、受け手を溢れさせずに文脈を渡すか）
- SWE-1.5（2025-10-29、<https://cognition.com/blog/swe-1-5>）: 「Our vision is to co-optimize models and harness」。RL は Windsurf の Cascade ハーネス上で行い、Devin の VM 基盤が rollout を支えた。同じモデルが他のハーネスで低く出た理由の一部は「ツール呼び出しの失敗の多さ」で、「ハーネスそのものの能力の反映ではない」。lint とコマンド実行の書き直しで1歩あたり最大 2 秒を削った。「ベンチマークの性能は実際の使用感を表さないことが多い」

### 1.3 Cursor の動的な文脈の発見と数百体の階層

- dynamic context discovery（Jediah Katz、2026-01-06、<https://cursor.com/en-US/blog/dynamic-context-discovery>）: 常に入れる static context と、必要なときに取りに行く dynamic context を分ける。スキルは名前と説明だけ static に置き、本文は grep と意味検索で取る。長いシェル・MCP の出力は切り詰めず**ファイルに書いて `tail` で読ませる**。MCP のツール説明もサーバーごとのフォルダに置き、名前だけ渡す。MCP を呼んだ実行で総トークン −46.9%（A/B、分散は大）。「文脈の削減はエージェント側の責任で、各 MCP サーバーに期待するのは現実的でない」「files have been a simple and powerful primitive」
- Scaling long-running autonomous coding（Wilson Lin、2026-01-14、<https://cursor.com/blog/scaling-agents>）: 対等なエージェントが共有ファイルのロックで調整する平らな設計は、ロックの保持しすぎ・解放忘れで「20 体が 2〜3 体の実効スループット」になり、階層が無いと危険回避で小さな安全な変更ばかりになった。最終形は planner（探索して課題を作る。sub-planner を生む）と worker（1件を終えて push。worker 同士は調整しない）。各周期の終わりに**判定役が続けるかを決め、次の周期は新しい文脈で始める**。品質管理と衝突解消の統合役は「解決より多くのボトルネックを生んだ」ので外した。「構造が少なすぎると衝突・重複・漂流、多すぎると脆い」「ハーネスとモデルは重要だが、プロンプトはもっと重要」。モデルは役ごとに違うものを使う（GPT-5.2 は長い自律に向き、Opus 4.5 は「早く止まり近道をとる傾向」）
- Towards self-driving codebases（Lin、2026-02-05、<https://cursor.com/blog/self-driving-codebases>）: 1週間で約 1,000 commit/時、ツール呼び出し 1,000 万回でブラウザを作った。root planner（コードを書かず、誰が拾うかも知らない）→ 再帰的な subplanner → worker（自分のリポジトリの複製で働き、他を知らない）。worker は「やったこと・懸念・逸脱・発見」を1通の handoff で返す。worker はロックを持たず、重なる編集は許容して「短期間で自然に収束する」。コミットごとの厳密な正しさは直列化と踏み合いを生むので捨て、定期に snapshot して直す「green branch」にした。判定役は実行役が十分信頼できたので外した。学び: 「ロックは正しく作るのが難しく、プロンプトを足しても直らなかった」「Constraints are more effective than instructions」「エージェントは良くも悪くも指示を最後まで従う」。人は SSH の端末から起こし、週の間は介入せず、指示文の穴（設計・依存・優先順位）を後から直した
- long-running agents（2026-02-12、<https://cursor.com/blog/long-running-agents>）: すぐ着手せず「計画を提案して承認を待つ」。「計画と、互いの仕事を確かめる複数のエージェント」で長い仕事を保つ。PR は大きくなり、マージ率は他のエージェントと同程度。「plan mode」「background agents」の個別の一次記事は今回は追っていない

### 1.4 Amp の部品の追加と廃止

- How to Build an Agent（Thorsten Ball、2025-04-15、<https://ampcode.com/how-to-build-an-agent>）: 「It's an LLM, a loop, and enough tokens」。400 行未満で動くコード編集エージェントを示し、ツールは名前・説明・入力スキーマ・関数の4点、サーバーは状態を持たず毎回全会話を送る
- サブエージェント（ドキュメント、2026-11-08 閲覧、<https://ampcode.com/docs/models-and-subagents>）: 組み込みは Task と Read Thread。「Each subagent has its own context window」、全会話ではなく主エージェントが渡した指示と文脈で始まり、主エージェントは「途中を監視せず最終の要約を受ける」。サブエージェント同士は通信できない。oracle は `@amp/oracle` プラグインのツールで「コードを査読し難しい判断に助言し、ファイルを編集しない」、librarian は `@amp/librarian` で外のリポジトリを `/tmp` に clone して説明する
- 部品の廃止（<https://ampcode.com/news>）: Librarian（2025-10-20）・Handoff「No More Compaction」（2025-10-23）・Thread Map（2025-12-11）を足したあと、2026 年は Handoff の自動化（01-13）、Fork・TODO の廃止（01-12・01-13）、エディタ拡張の終了「The Coding Agent Is Dead」（02-19）、CLI の全面再構築（05-06）と `@sourcegraph/amp` から `@ampcode/cli` への改名（05-14）、Orbs（スレッドごとの使い捨ての遠隔マシン、06-30〜）、エージェント同士がスレッドを生成・伝言・ファイル交換する「From Agent to Agent」（07-17）、既定モデルを一晩で入れ替えて苦情が無かった「Who Cares About the Model?」（07-29）、「段階ごとに見守るな」の「Less Noise」（09-25）と続く
- Ball の講演（2026-10-13、<https://ampcode.com/time-capsules/6>）: 「We removed a lot of context management features over the last six months in Amp」（handoff と thread map を含む）。理由は「計画が手作業の文脈管理に代わり、圧縮の問題はそれに比べれば微小」。勧め: 「how ではなく what を書く」「エージェントを待たない」「主要なコードだけ精読する（CSS の誤りと壊れた migration は同じでない）」「Give me irrefutable proof that this works now」。AGENTS.md の変更が狙った挙動を生むかは、Orbs を複数起こして確かめる。「ハーネスの概念は重要性を失っている」という引用は二次情報（mer.vin、2026-08）にしか無く、本人の文では確かめられなかった

### 1.5 Factory の Droid 1.0「Frontier Harness」

- （Factory Research、2026-10-29、<https://factory.com/news/frontier-harness>）: 「An agent harness is everything around the model」。プロンプト・ツール・ツール結果の返し方・それを回すループ。中核は Script mode（モデルが JavaScript を書き、サンドボックスで多数のツール呼び出しを1要求で行い、印字した出力だけが文脈に戻る）。ツール定義は 11 → 2 を先に送り残りは要求時に、基本プロンプトは 20,887 → 13,055 入力トークン（−37%）でモデルごとに調整、圧縮の要約は 8,000 → 16,000 トークン。Terminal-Bench 4（2026-10-23〜28、各3試行、両方が3回とも通した課題だけ数える）で Opus 5.5 のとき Droid 65.2%・1通過あたり $4.73、他ハーネス 57.6〜62.1% で最大 24% 安い。Script mode は Opus 5.5 で −15% のコスト
- 改良の仕組み: 内部の「Agent Factory」が全モデルを同じ課題で評価し、trace を読み、**仮説を明記した変更を提案し、対照実験として試し、出す前に技術者が査読する**。学び: 「1モデルに合わせて調整すると、進歩とその癖への適応が見分けられない」「毎ターン全要求を再送するので、置き場の悪い指示や古いツール出力は以後の全ターンで損する」「行番号を付けると Opus は −22%、GLM は +8%、Kimi は +32% で、opt-in にした」

### 1.6 同じプロンプトを回す Ralph Wiggum loop

- 原典（Geoffrey Huntley、2025-07-14、<https://ghuntley.com/ralph/>）: `while :; do cat PROMPT.md | claude-code ; done`。「the technique is deterministically bad in an undeterministic world」。「1ループに1つのことだけ」、各ループは新しい文脈なので計画と仕様から「毎回同じようにスタックを割り当てる」。失敗のたびに「ギターのように」プロンプトの「標識」を調整し、テスト・型検査・静的解析の背圧が悪い出力を拒む。弱点は ripgrep で未実装と誤認して二重実装すること、最小・仮実装への偏り、「朝起きたらコンパイルが通らない」こと。停止条件は無く、人が止めるか TODO が尽きるか脱線する。「既存のコードベースには絶対に使わない」（greenfield 向け）
- Everything is a Ralph Loop（2026-01-17、<https://ghuntley.com/loop/>）: 「Ralph is monolithic」。単一リポジトリ・単一プロセス・1ループ1課題。非決定的なエージェント同士の通信は「red hot mess」。検証のループが欠陥を見つけ、前向きのループが直す。「ループを見ていろ」。学ぶのは人
- 18か月の回顧（講演 2026-05、掲載 2026-09-27、<https://ghuntley.com/eighteen-month-recap/>）: 「LLMs and AI are literally just a while loop, and Ralph is a while loop on a while loop」。技術より組織の話が多く、ループの技術的な失敗や防護は語っていない
- HumanLayer の記録（Dex Horthy、2026-01-06、<https://www.humanlayer.dev/blog/brief-history-of-ralph>）: Anthropic は 2025-12 に公式の ralph wiggum plugin を出した。Horthy の評は「`--dangerously-skip-permissions` が無いと不明瞭に失敗し、Stop hook が不透明」。学び: 「仕様が悪ければ結果は凡庸」「探索の段階には向かない」「毎朝1件の小さなリファクタが、0件にも 50 件にも勝る」。plugin の README 本文は読めなかった（4 章）

### 1.7 martinfowler.com の guides と sensors

- Harness engineering for coding agent users（Birgitta Böckeler、2026-04-02、<https://martinfowler.com/articles/harness-engineering.html>）: ハーネスを「モデル以外のすべて」と広く取り、利用者が coding agent の外側に作る層に絞る。**guides（feedforward。行為の前に導く）と sensors（feedback。行為の後に観測して自己修正させる）**、それぞれ computational（決定的・速い: テスト・リンタ・型）と inferential（意味的・高い: AI 査読・LLM as judge）。部品は AGENTS.md・Skills・hooks（ArchUnit を pre-commit で）・カスタムリンタ・構造テスト・mutation testing・fitness function・codemod・MCP。「Engineering a user harness for a coding agent is a specific form of context engineering」。「良いハーネスは人を外すためではなく人の注意を最も要る所へ向けるため」。挙動の正しさの検査は未解決で、AI が書いたテストへの依存は「まだ十分でない」。鳴らない sensor は高品質か検出の弱さか読めない
- Maintainability sensors（Böckeler、2026-05-27、<https://martinfowler.com/articles/sensors-for-coding-agents.html>）: ESLint（長さ・複雑度）・dependency-cruiser（層）・結合度の CLI・mutation testing（Stryker）・LLM の modularity 査読を試した。効いたのは**直し方を含めたリンタのメッセージ**（閾値の引き上げ要求が減った）、dependency-cruiser（「構造を markdown で説明する代わり」になる）、mutation testing（statement coverage 100% で 13 の生き残り）。効かなかったのは生の結合度データ（意味の解釈なしでは雑音）。規則同士の緊張（関数を短くすると props が伸びる）、**エージェントが検査を飛ばす**（「何度も何度も」なぜ走らせないか聞いた）、AGENTS.md の指示は当てにならず hooks・pre-commit・Pi の拡張を試した。出力は `sensors check` の sidecar CLI で共通 JSON と傾向・目標値に畳んだ。「常に緑なら疑う」。「人を完全に外す魔法ではない」
- The Orchestrator's Tax（Rahul Garg、2026-07-16、<https://martinfowler.com/articles/orchestrator-tax.html>）: 「the real value of a subagent is what it keeps out of that context, not how fast it runs」。税は委譲先ではなく監督役が持ち越すもの（状態確認で生の transcript を主スレッドに引き込む等）に掛かる。規則: 同時は 2〜4 体、ファイルの所有が重なるなら統合の合図、「同じ心の模型を要する課題は一緒に置く」（cognitive locality）、サブエージェントは親のスキルを継がないのでファイル名で渡す。Claude Sonnet 5 の1ワークフローで較正した値

### 1.8 HumanLayer・Hashimoto・Willison・Karpathy

- 12-factor agents（Dex Horthy、2025、<https://github.com/humanlayer/12-factor-agents>）: Factor 8「Own your control flow」はループを枠組みではなく自分のコードに持たせ、「ツールを選んだ瞬間と呼ぶ瞬間の間」で止めて人の承認を挟み、webhook で再開する。Factor 10「Small, Focused Agents」は「3〜10 歩、最大 20 歩」で文脈を小さく保ち、「Agents are just one building block in a larger, mostly deterministic system」と書く。Factor 7「Contact humans with tool calls」、Factor 12「stateless reducer」
- ACE-FCA（HumanLayer、2025-08 ごろ、<https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md>）: research → plan → implement。文脈の使用率は 40〜60% に保ち、満ちたら進捗ファイルへ意図的に圧縮する。**人の査読は計画に寄せる**（「2,000 行の Go は毎日読めないが 200 行の計画は読める」。計画の1行の誤りは数百行のコードの誤りになる）。「Subagents are about context control」
- Skill Issue（HumanLayer、2026-03-12、<https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents>）: 失敗の多くはモデルではなく設定の問題。サブエージェントは「context firewall」で、`filepath:line` の引用つきの要約を返す。Stop hook で整形と型検査を走らせ、**成功は黙り、エラーだけ返す**（exit 2 で再開）。テストの全出力は文脈を溢れさせたので誤りだけ表に出す。「実際に失敗してから設定を足す」、CLAUDE.md は 60 行未満、使わない MCP は切る
- Mitchell Hashimoto（2026-02-05、<https://mitchellh.com/writing/my-ai-adoption-journey>）: 6 段の採用の 5 段目が「Engineer the Harness」。「I've grown to calling this 'harness engineering'」「anytime you find an agent makes a mistake, you take the time to engineer a solution」。Ghostty の AGENTS.md は「各行が1つの悪い挙動に基づき、ほぼ全部を解消した」。直し方は AGENTS.md の暗黙の導きと、スクリーンショットのスクリプトや絞ったテストランナーのような道具＋その存在を知らせる1行。「検証の手段を与えると、たいてい自分で直し退行を防ぐ」。先行の記事（2025-10-11、<https://mitchellh.com/writing/non-trivial-vibing>）は「読み取り専用の計画役（oracle）と対話で計画を作り、仕様ファイルに保存する」「詰まったら slop zone。AI は解でなく負債」「理解していないコードは出荷しない」
- Simon Willison（2026-09-27、<https://simonwillison.net/2026/Sep/27/2026-in-llms-so-far/>）: 2026 年は coding agent で製品市場適合に達した。「harness」は「それぞれの coding agent harness と組んだとき」の1箇所だけで定義は無い。StrongDM の「人がコードを書かない・人が査読しない」を「エージェントの仕事をどう検証するか」の問いとして紹介。2026-09-24（<https://simonwillison.net/2026/Sep/24/harder/>）「coding agent は software engineering をさらに難しくする。最大の力を引き出すには並外れた規律と知識が要る」。「軽いハーネス（`pi -nc --offline` と短いシステムプロンプト）」は Willison 本人ではなく Georgi Gerganov の言（2026-06-16、<https://simonwillison.net/2026/Jun/16/georgi-gerganov/>）
- Karpathy autoresearch（2026-03、<https://github.com/karpathy/autoresearch>）: エージェントが触るのは `train.py` の1ファイルだけ。「修正 → 5 分訓練 → val_bpb が改善したか見る → keep/discard → 繰り返す」で1時間に約 12 回、一晩で約 100 回。人は `program.md`（「超軽量なスキル」）を編集してエージェントを「プログラム」する。固定予算は比較を可能にし、他の計算環境との比較は失う

### 1.9 Stripe の Minions と「You can't whisper」

- Minions（Alistair Gray、2026-02-09・02-19、<https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents>、<https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2>）: 週 1,300 超の PR が「minion が作り、人が査読し、人の書いたコードを含まない」。Block の goose の fork を核に、**決定的なノードとエージェントのノードを混ぜた blueprint** で「Stripe が必須とする手順を必ず通す」。流れ: Slack 等で起動 → Toolshed（400 超の MCP ツール）で文脈 → devbox（10 秒で起動、本番と網から隔離）で編集 → push ごとに 5 秒未満のローカル lint → CI（300 万超から選んだテスト。autofix は自動適用、無いものはエージェントへ1回だけ戻す）→ **2 周目の CI の後は人へ戻す** → PR テンプレートに沿った PR を人が査読。「LLM を囲った箱に入れる」ことが信頼性に複利で効く、「人に良いものはエージェントにも良い」、「隔離があるから全権限で確認なしに走らせられる」、「小さく選んだ道具箱」、「フィードバックを左へ」
- You can't whisper at an AI agent（Beswick・Epsteen、2026-05-14、<https://stripe.dev/blog/ai-steering-experiments>）: 約 12 の実験。「Passive hints failed while active prompts and distribution plays worked」。依存ディレクトリの標識・API 応答の warning は読まれず、**エラーは読まれる**（「errors block progress but warnings don't」）。分割したスキルは一枚物より評価で約 10% 良く、トークンも減る。「If your guidance wasn't in the loaded context, it didn't happen」

### 1.10 Anthropic・OpenAI・Google・VS Code・GitHub

- Anthropic（Prithvi Rajasekaran、2026-03-24、<https://www.anthropic.com/engineering/harness-design-long-running-apps>）: planner・generator・evaluator（Playwright で実際に操作し、硬い閾値で採点）。「作る役と判定する役を分けることが強い梃子」「独立した評価役を懐疑的に調整するほうが、生成役を自己批判的にするよりはるかに扱いやすい」。sprint contract（書く前に「done」を評価役と合意。Sprint 3 だけで 27 基準）。文脈のリセットと handoff ファイルは Sonnet 4.5 の「context anxiety」のためで、Opus 4.5 では外した。ハーネス込みは単独の 20 倍超のコスト（$9/20 分 vs $200/6 時間）。「各部品はモデルができないことの仮定で、仮定は古びる」。同じく Lance Martin（2026-04-02、<https://claude.com/blog/harnessing-claudes-intelligence>）は「ハーネスを削る」型を挙げ、コード実行でツール結果を自分で濾すと BrowseComp 45.3% → 61.6%、「Sonnet 4.5 向けのリセットは Opus 4.5 で dead weight」
- OpenAI「Harness engineering」（Ryan Lopopolo、2026-02-11、<https://openai.com/index/harness-engineering/>）: 本文は 403 で今回読めず、既存の `harness-strategy.md` と Marmelab の索引に依る（約 100 万行・人の手書き 0 行・約 1,500 PR、AGENTS.md を目次に、直し方を含むリンタ、構造の制約を機械で強制、doc-gardening）
- Google（Mullen・Gunderman、2026-09-09、<https://developers.googleblog.com/the-anatomy-of-harness-engineering-how-to-evaluate-iterate-and-guard-ai-coding-agents/>）: 先に dogfooding、評価は「前進の確保と退行の防止」の第2段。behavioral eval（「特定のツール呼び出しやファイル変更など中間の歩に assert する」統合テスト）を、非決定性のため単発で PR を止めず束で回し、ローカルは 5 秒未満。複雑な課題は LLM-as-judge の緩い判定
- VS Code（Kasper・Rogge・Munger、2026-05-15、<https://code.visualstudio.com/blogs/2026/05/15/agent-harnesses-github-copilot-vscode>）: 「The model is the engine. The harness is the car」。毎ラウンドプロンプトを組み直し、ツール呼び出しの上限と Stop hook で輪を制御、モデルごとにツールを変える（Claude は `replace_string_in_file`、GPT は `apply_patch`）。公開ベンチマークは「もはや品質の指標として十分でない」ので VSC-Bench を容器で回し、`~requires-eval-assessment` ラベルの PR は eval を走らせて結果を PR に貼る。xhigh は high よりトークンを使って解決数がわずかに減った
- GitHub（Gwen Davis、2026-02-24、<https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/>）: 「失敗の大半は構造の欠落で、モデルの能力ではない」。境界ごとに型付きスキーマ、許す行為を小さな集合（request-more-info / assign / close / no-action）に限り、違反は契約違反として retry・repair・escalate。「treat agents like code, not chat interfaces」
- Marmelab の索引（2026-09-24、<https://marmelab.com/blog/2026/09/24/the-state-of-ai-harness-engineering-2026.html>、57 件のまとめ。二次情報）: 横断の結論に「文章の指示は書かれるが強制されない」「制御ごとに期限条件を付け、背後の事故を記録する」「査読エージェント・長い handover の連鎖・事前の許可規則・高スループットでの重い pre-merge は弱いか負の結果」「新しい文脈のループの証拠は薄い」。著者は自身もハーネスを作っており、AI で集約したと明示

### 1.11 ベンチマーク側で見えるハーネスの違い

- Terminal-Bench 2.0（Merrill ほか 85 名、arXiv 2026-01-17、<https://arxiv.org/abs/2601.11868>）: 89 問、各問に独自の環境・人の解答・検証テスト。フロンティアのモデルとエージェントは 65% 未満。実行基盤 Harbor（<https://harborframework.com/>、「running any agent with any model on any task in any sandbox in parallel」。terminal-bench の作者による）。順位表（<https://www.tbench.ai/>）は 2026-11 時点で 4.0 が表で、2.0 の行は描画が client 側で読めなかった
- 同じモデル、別のハーネス（調査論文 Guo ほか、arXiv 2026-06-14、<https://arxiv.org/abs/2606.20683> §7.3–7.4。順位表の値を引いたもの）: Terminal-Bench 2.0 で「GPT-5 は Mini-SWE-Agent 33.9% から Codex CLI 49.6%」「GPT-5.3-Codex は Terminus 2 64.7% から SageAgent 78.4%」「Claude Opus 4.6 は Claude Code 58.0% から Meta-Harness 76.4%」「Gemini 3.1 Pro は Gemini CLI 59.4% から TongAgents 80.2%」。「これらの差は順位表の標準誤差より大きい」。公式の提出は `-k 5`（各問 5 試行）で、timeout・CPU・メモリの上限を上書きしてはならない。SWE-bench Verified でも GPT-4o で SWE-agent 23.2% ↔ Agentless 38.8%。ハーネスを observation・context・control・action・state・verification の6責務に分ける
- mini-SWE-agent（<https://github.com/SWE-agent/mini-swe-agent>）: 「エージェント本体は約 100 行」「bash 以外のツール無し」「履歴は完全に線形（trajectory＝プロンプト）」「`subprocess.run` を `docker exec` に替えるだけでサンドボックス」。「100 倍単純でほぼ同じだけ働くか」という問いの道具で、SWE-bench の bash-only 順位表は「`mini` で各 LM の性能を測る」。基準系として置くことで、モデルの差とハーネスの差を分けて見る
- METR Time Horizon 1.1（2026-01-29、<https://metr.org/blog/2026-01-29-time-horizon-1-1/>）: 170 → 228 問、8 時間超の問は 14 → 31、Vivaria から Inspect へ。「古いモデルはツール呼び出しの scaffold に大きな変更が要った」、GPT-4o と o3 は Vivaria で高く、scaffold とプロンプトの効果と見る。限界の覚え書き（2026-01-22、<https://metr.org/notes/2026-01-22-time-horizon-limitations/>）: 「Time horizon is not the length of time AIs can work independently」「全課題が自己完結で、人との多ターンの対話は無い」「2倍になっても自動化は2倍にならない」「50% 地平が X 時間でも X 時間未満の課題を任せられるわけではない（98% 超の信頼が要るものがある）」

### 1.12 検証と判定役を扱った 2026 年の研究

- Progress mirage（Park・Choi、arXiv 2026-07-27、v2 09-29、<https://arxiv.org/abs/2607.25152>）: 自己評価で門を閉めるループは「全部通す」に退化し、配備済みの最良状態を 19% 損ねた。54 周期で agent は毎回「改善した」と言い、56% は実測の差が 0 以下。**全成果物・差分・判定履歴を読む最強の判定役でも、実世界の退行を 44% 通し、実の改善を 38% 却下**。成功の信号が成果物の中にある課題では蜃気楼が消えた。「成功の信号が transcript の外にある開いた目的には、実世界に触れる帯域外の評価が構造的な要件」
- LLM-as-a-Judge Is Not an Oracle（Wahi、arXiv 2026-09-02、<https://arxiv.org/abs/2609.02246>）: 数か月の本番のプロンプト最適化で 11 の評価の失敗（判定役の偏り・ハーネスと指標の失敗・正解データの誤り・判定を欺く reward hacking。cache された答えを読んで 100% 合格、実力は約 68%）。「判定役を oracle から advisor へ降格」し、判定役が覆せない決定的な検証層を置く: 密閉のサンドボックス・能力を分けた役・判定役より上位の受け入れ検査・凍結した holdout・満点を不正の証拠と見る canary。採点基準の書き直しは頭打ちで、効いたのは出力の順序への構造的な制約だけ

## 2. 横断して見える型

| 型                                 | 内容                                                                                                         | 根拠の事例                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 単一の書き手＋文脈の圧縮           | 書き込みは1スレッド。読み・調査・判定は並列にしてよい。並列の書き手は衝突する                                | Cognition 2025-06・2026-04、LangChain 2025-06、Huntley「monolithic」、Cursor（worker 同士は無通信・統合役を外す）                                                                                                             |
| 計画 → 実装 → 検証の段             | 先に計画を人かエージェントが承認し、実装は小さく、終わりに仕様と照合する                                     | ACE-FCA、Cursor long-running（承認待ち）、LangChain の 4 段プロンプトと終了前の照合、Anthropic sprint contract、Hashimoto（計画を仕様ファイルへ）                                                                             |
| 判定役の分離と新しい文脈           | 作り手は自分に甘い。判定役は仕様や監督役の推論を持たず、差分と実行結果から判定する                           | Anthropic 2026-03-24、Cognition 2026-04-22、LangChain 2026-09-08（verifier は isolated）、Osmani 2026-04-19                                                                                                                   |
| 外部の根拠が判定役より上           | テスト・型・実行結果が最終判定で、LLM の判定は助言。満点は疑う                                               | arXiv 2607.25152・2609.02246、Böckeler（computational と inferential）、Ralph の背圧、Ball「irrefutable proof」、Böckeler「常に緑なら疑う」                                                                                   |
| 文章の指示より機械の強制           | AGENTS.md の指示は読まれないことがある。hook・リンタ・エラー・型付きスキーマで止める。エラー文に直し方を書く | Stripe 2026-05-14、Böckeler 2026-05-27（hooks を試す）、Cursor「constraints > instructions」、GitHub（型付きスキーマ）、Hashimoto（道具＋1行）、Marmelab 索引                                                                 |
| ファイルを記憶と媒体に             | 計画・進捗・handoff・長いツール出力はファイルに置き、必要なときに grep/tail で読む                           | Deep Agents、Cursor dynamic context discovery、Ralph の PROMPT/仕様、Anthropic handoff ファイル、ACE-FCA の進捗ファイル、Amp の Artifacts                                                                                     |
| ループと停止条件                   | 1周1件、新しい文脈、外部の検査、回数・時間・編集回数の上限、上限で人へ                                       | Ralph（上限なし→plugin の `--max-iterations`）、Stripe（CI 2 周）、LangChain（`LoopDetectionMiddleware`・時間予算）、Karpathy（5 分固定・keep/discard）、VS Code（ツール呼び出し上限・Stop hook）、Cursor（周期ごとの判定役） |
| 失敗から規則を起こし、期限を付ける | 規則は観測した失敗に1対1で起こす。仮定は古びるので、モデルが変わったら外す。最初は薄く                       | Hashimoto、Osmani、HumanLayer 2026-03-12、Anthropic（リセットの撤去）、LangChain（「溶ける」）、Marmelab（期限条件）                                                                                                          |
| 観測 → 仮説 → 実験 → 人の承認      | trace を読んで失敗の型を出し、変更を仮説つきで提案し、固定の課題集で前後を測り、人が出す前に見る             | LangChain Trace Analyzer、Factory Agent Factory、Google behavioral eval、VS Code の PR eval、Karpathy autoresearch                                                                                                            |
| 人の介入点を絞る                   | 計画の承認、主要なコードの精読、上限に当たったとき、ツールを選んだ瞬間と呼ぶ瞬間の間                         | ACE-FCA、Ball、Stripe、12-factor Factor 7・8、LangGraph `interrupt()`、Cursor long-running、Böckeler                                                                                                                          |
| ハーネスはモデルごとに違う         | 同じハーネスでもモデルで最適が変わる。役ごとにモデルを選ぶ。1モデルへの最適化は癖への適応と見分けがつかない  | Factory、VS Code、Cursor（役ごとのモデル）、LangChain（reasoning sandwich）、調査論文 §7.4、Cognition SWE-1.5                                                                                                                 |
| 道具と常設の文章を減らす           | ツール定義・プロンプト・MCP を削る。必要な分だけ取りに行かせる                                               | Factory（11→2、−37%）、Cursor（−46.9%）、Stripe「smaller box」、HumanLayer、Anthropic「strip down」、Amp（handoff・thread map の廃止）                                                                                        |

## 3. 意見が割れている点

- 多エージェントの是非: Cognition は 2026 年も「並列の書き手の swarm は採用が進まない」。Cursor は数百体の worker を並列に書かせて「重なる編集は収束する」と言うが、1週間のブラウザ構築という特殊な条件で、長期の保守性は示していない。Huntley は monolithic。LangChain は「読みは並列、書きは1本」で両者を接続する。Anthropic の C コンパイラ（既存文書）も並列
- サブエージェントへ文脈を渡すか: Cognition・LangChain は判定役には渡さない（偏りの共有を避ける）。LangChain は作業の続き手には fork で渡す。Garg は「同じ心の模型を要する課題は分けない」。Cognition の 2025 年の原則「trace 全体を共有」と 2026 年の「査読役は共有しない」は、役で使い分ける形で両立している
- LLM の判定役の価値: Anthropic・Cognition・Osmani は「分離した判定役は強い梃子」。arXiv 2607.25152 は「最強の判定役でも実の改善の 38% を却下」、Marmelab 索引は「査読エージェントは弱いか負の結果」。Böckeler は inferential sensor を「高いが意味を見る」と位置づける。どちらも「外部の根拠が無い課題では判定役だけに頼れない」では一致する
- 文脈管理は人がやるか: Amp は handoff・thread map を外し「計画が代わる」。HumanLayer ACE-FCA は 40〜60% を人が意図的に保つ。Ralph は毎周期捨てる。Anthropic は Sonnet 4.5 で要ったリセットを Opus 4.5 で外した。モデルの世代で答えが動いている
- ハーネスは厚いか薄いか: mini-swe-agent（100 行）・pi は薄い基準系として置かれ、Gerganov は「everything stripped」で使う。Factory・Deep Agents・Stripe は厚い。Anthropic は「削れるものを問う」。Cursor は「ハーネスよりプロンプト」。VS Code は「エンジンと車」で両方要るとする
- 新しい文脈のループの効果: Ralph・Cursor（周期ごとに新しく）は効くとし、Marmelab 索引は「証拠は薄い」、Anthropic は新しいモデルでは不要になったとする。測った比較は見つからなかった

## 4. 確かめられなかったこと

- Anthropic の ralph-wiggum plugin の README: `anthropics/claude-code/plugins/`・`claude-plugins-official` の両方で 404。Stop hook・`--max-iterations`・`--completion-promise` の記述は HumanLayer の記録と二次情報（awesomeclaude.ai 等）に依る
- OpenAI「Harness engineering」「Unrolling the Codex agent loop」: 403 で読めず、既存文書と Marmelab の索引の記述に依った
- Cognition「Devin Manages Devins」（2026-03 とされる）の記事本文: 見つからなかった。管理役の型は 2026-04-22 の記事の「Higher-Level Delegation」節で確かめた。「最初のターンの 60% を文脈の取得に使う」という二次情報の数は原文に無い
- Terminal-Bench 2.0 の順位表の行: client 側描画で読めず、同じモデル・別ハーネスの数は調査論文 §7.4 の引用に依る
- LangGraph の durable execution の専用ページ: 2 つの URL が persistence の概要か redirect になった。checkpoint と `interrupt()` の記述は LangChain の runtime の記事（2026-04-20）に依る
- Mitchell Hashimoto の 2026-05 の X の投稿（レンダラ最適化のループと「agent psychosis」）: X は読めず、検索の抜粋のみ
- Thorsten Ball の「ハーネスの概念は重要性を失っている」という引用: 二次情報（mer.vin）のみ。本人の 2026-10-13 の講演には無い
- Vercel の「ツールを 80% 削って良くなった」: Marmelab が引くが、Vercel Academy のページ（<https://vercel.com/academy/build-ai-agent-harness>）には無かった
- Amp の Oracle の既定モデル: ドキュメントは `MODEL` を利用者が設定するとだけ書く。GPT-5.4 が oracle になったのは news（2026-03-05）
- Cursor の plan mode・background agents の個別の一次記事、Shopify Roast、Microsoft Azure SRE Agent、Cheesecake Labs: 今回は読んでいない

## 5. 含意の候補（推測。診断は本文書の範囲外）

- tsukumo の `task-flow`（実装 → 受け入れ → 振り返り）は、2 章の「計画 → 実装 → 検証」「判定役の分離と新しい文脈」「観測 → 仮説 → 実験 → 人の承認」と形が合う。差があり得るのは「外部の根拠が判定役より上」（受け入れ役の判定と `pnpm run check` の優先順位）と「ループと停止条件」（差し戻しの上限と、上限に当たったときの人への戻し方）で、ここは実物を測ってから言うべきこと
- Hashimoto・Marmelab の「規則に期限を付ける」は、振り返りが積むドラフトの形に関わる可能性がある（既存の `harness-strategy.md` の介入台帳と同じ方向）

## 出典一覧

- LangChain: <https://www.langchain.com/blog/deep-agents>（2025-07-30）・<https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems>（2025-06-16）・<https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering>（2026-02-17）・<https://www.langchain.com/blog/the-anatomy-of-an-agent-harness>（2026-03-10）・<https://www.langchain.com/blog/runtime-behind-production-deep-agents>（2026-04-20）・<https://www.langchain.com/blog/organizing-context-in-a-multi-agent-harness>（2026-09-08）・<https://blogs.nvidia.com/blog/nemotron-langchain-agents-open-stack/>（2026-07-08）
- Cognition: <https://cognition.com/blog/dont-build-multi-agents>（2025-06-12）・<https://cognition.com/blog/multi-agents-working>（2026-04-22）・<https://cognition.com/blog/swe-1-5>（2025-10-29）
- Cursor: <https://cursor.com/en-US/blog/dynamic-context-discovery>（2026-01-06）・<https://cursor.com/blog/scaling-agents>（2026-01-14）・<https://cursor.com/blog/self-driving-codebases>（2026-02-05）・<https://cursor.com/blog/long-running-agents>（2026-02-12）
- Amp: <https://ampcode.com/how-to-build-an-agent>（2025-04-15）・<https://ampcode.com/news>（2025-10〜2026-11）・<https://ampcode.com/docs/models-and-subagents>（2026-11-08 閲覧）・<https://ampcode.com/time-capsules/6>（2026-10-13）
- Factory: <https://factory.com/news/frontier-harness>（2026-10-29）
- Ralph: <https://ghuntley.com/ralph/>（2025-07-14）・<https://ghuntley.com/loop/>（2026-01-17）・<https://ghuntley.com/eighteen-month-recap/>（2026-09-27）・<https://www.humanlayer.dev/blog/brief-history-of-ralph>（2026-01-06）
- martinfowler.com: <https://martinfowler.com/articles/harness-engineering.html>（2026-04-02）・<https://martinfowler.com/articles/sensors-for-coding-agents.html>（2026-05-27）・<https://martinfowler.com/articles/orchestrator-tax.html>（2026-07-16）・<https://www.martinfowler.com/tags/2026.html>
- HumanLayer: <https://github.com/humanlayer/12-factor-agents>（Factor 8・10 の本文を含む）・<https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md>（2025-08 ごろ）・<https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents>（2026-03-12）
- Hashimoto: <https://mitchellh.com/writing/non-trivial-vibing>（2025-10-11）・<https://mitchellh.com/writing/my-ai-adoption-journey>（2026-02-05）
- Willison: <https://simonwillison.net/2026/Jun/16/georgi-gerganov/>（2026-06-16）・<https://simonwillison.net/2026/Sep/24/harder/>（2026-09-24）・<https://simonwillison.net/2026/Sep/27/2026-in-llms-so-far/>（2026-09-27）
- Karpathy: <https://github.com/karpathy/autoresearch>（2026-03）
- Stripe: <https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents>（2026-02-09）・<https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2>（2026-02-19）・<https://stripe.dev/blog/ai-steering-experiments>（2026-05-14）
- Anthropic: <https://www.anthropic.com/engineering/harness-design-long-running-apps>（2026-03-24）・<https://claude.com/blog/harnessing-claudes-intelligence>（2026-04-02）
- OpenAI（読めず）: <https://openai.com/index/harness-engineering/>（2026-02-11）
- Google: <https://developers.googleblog.com/the-anatomy-of-harness-engineering-how-to-evaluate-iterate-and-guard-ai-coding-agents/>（2026-09-09）
- VS Code: <https://code.visualstudio.com/blogs/2026/05/15/agent-harnesses-github-copilot-vscode>（2026-05-15）
- GitHub: <https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/>（2026-02-24）
- Addy Osmani: <https://addyosmani.com/blog/agent-harness-engineering/>（2026-04-19）
- Marmelab（二次。索引として）: <https://marmelab.com/blog/2026/09/24/the-state-of-ai-harness-engineering-2026.html>（2026-09-24）
- ベンチマーク: <https://arxiv.org/abs/2601.11868>（Terminal-Bench 2.0、2026-01-17）・<https://harborframework.com/>・<https://www.tbench.ai/>・<https://arxiv.org/abs/2606.20683>（調査論文、2026-06-14）・<https://github.com/SWE-agent/mini-swe-agent>・<https://metr.org/blog/2026-01-29-time-horizon-1-1/>（2026-01-29）・<https://metr.org/notes/2026-01-22-time-horizon-limitations/>（2026-01-22）
- 検証の研究: <https://arxiv.org/abs/2607.25152>（2026-07-27）・<https://arxiv.org/abs/2609.02246>（2026-09-02）
