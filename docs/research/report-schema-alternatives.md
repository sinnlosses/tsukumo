# report の引数 schema という受け方を見直すか（2026-10-18）

**この文書は調べと提案で、正典ではない。** 採否が決まるまでコードは変わらない。

**結論**: report は1本のツールのまま JSON の引数で受け、schema の骨組みを軽くすることを推す。いま report の定義（約1.27万トークン）の約3分の2は、説明文ではなく JSON schema の骨組みで、取り込んだあとは圧縮されるまで毎リクエスト載る。ツールを割る案・Markdown で受ける案・プロンプトとの二重を畳む案は採らない。差し戻しの仕組みを変えるかは、記録に引数の字数を足してから決める。

## 1. 実測: report の定義はいつ窓に載っているか

### 1.1 測り方

- 使った記録は `~/.tsukumo/context-usage/`・`report-usage/`・`token-usage/` の数の欄だけ。会話の文面・ツールの引数は読んでいない。
- `context-usage` はセッション1つにつき1行で、書くのはそのセッションの最初のターンが終わったとき（`src/server/context-usage/core/context-usage.ts` の `createContextUsageRecorder`）。この表は「最初のターンの終わりに載っていたか」で、毎ターンの値ではない。
- 疑似セッション（fake driver）の行は除いた。`totalTokens` が 121,500 で `MCP tools` が 800 の行で、`fake-driver.ts` の固定値と一致する。2,287 行あった。
- 記録の `mcpTools` には、ツールごとに used か deferred かの欄が無い。そこで、`categories` の `MCP tools`（used）の値が `mcpTools` のどの組み合わせの和と一致するかで判別した。
  - report を除いた残りの組み合わせで、`MCP tools` から report の値を引いた数になれば used。
  - report を含めずに `MCP tools` の値になれば deferred。
  - どちらでも合う行・どちらでも合わない行は判別不能。
- `token-usage-diet` の `summarize_usage.py` は used と deferred を比で按分するだけで、ツールごとには判別しない。そのため使わなかった。

### 1.2 日別の表（work のセッション）

| 日付       | work | chat | report used | report deferred | 判別不能 | report 無し | used の割合 | report のトークン（最小–最大） |
| ---------- | ---: | ---: | ----------: | --------------: | -------: | ----------: | ----------: | ------------------------------ |
| 2026-09-23 |   52 |    4 |           1 |               3 |        0 |          48 |         25% | 202–202                        |
| 2026-09-24 |   32 |    1 |          11 |              19 |        0 |           2 |         36% | 218–218                        |
| 2026-09-25 |   33 |    3 |          11 |              22 |        0 |           0 |         33% | 218–280                        |
| 2026-09-26 |   36 |    1 |           3 |              26 |        5 |           2 |         10% | 274–509                        |
| 2026-09-27 |   93 |    0 |          15 |              61 |       17 |           0 |         19% | 509–3267                       |
| 2026-09-28 |   20 |    1 |           8 |              12 |        0 |           0 |         40% | 3239–4041                      |
| 2026-09-29 |   22 |    2 |           7 |              15 |        0 |           0 |         31% | 3946–4131                      |
| 2026-09-30 |   22 |    0 |          11 |              11 |        0 |           0 |         50% | 4131–4962                      |
| 2026-10-01 |   11 |    0 |           3 |               8 |        0 |           0 |         27% | 4985–6033                      |
| 2026-10-02 |   30 |    0 |          10 |              20 |        0 |           0 |         33% | 6033–6315                      |
| 2026-10-03 |   28 |    3 |           8 |              20 |        0 |           0 |         28% | 6219–6348                      |
| 2026-10-04 |   58 |    1 |           9 |              49 |        0 |           0 |         15% | 6348–6507                      |
| 2026-10-05 |   20 |    0 |           4 |              16 |        0 |           0 |         20% | 6507–7639                      |
| 2026-10-06 |   15 |    0 |           5 |              10 |        0 |           0 |         33% | 7639–7788                      |
| 2026-10-07 |   23 |    1 |           7 |              16 |        0 |           0 |         30% | 7787–7802                      |
| 2026-10-08 |   17 |    0 |           5 |              12 |        0 |           0 |         29% | 7878–7918                      |
| 2026-10-09 |   18 |    5 |           5 |              13 |        0 |           0 |         27% | 7918–7943                      |
| 2026-10-10 |   29 |    4 |          12 |              17 |        0 |           0 |         41% | 7918–8488                      |
| 2026-10-11 |   34 |    3 |          15 |              19 |        0 |           0 |         44% | 8488–9603                      |
| 2026-10-12 |   60 |    2 |          23 |              37 |        0 |           0 |         38% | 9603–12022                     |
| 2026-10-13 |   17 |    3 |          10 |               7 |        0 |           0 |         58% | 10834–16959                    |
| 2026-10-14 |   47 |    1 |          24 |              23 |        0 |           0 |         51% | 10372–10834                    |
| 2026-10-15 |   22 |    2 |          15 |               7 |        0 |           0 |         68% | 10472–10480                    |
| 2026-10-16 |    5 |    2 |           3 |               2 |        0 |           0 |         60% | 10524–10705                    |
| 2026-10-17 |   35 |    0 |          17 |              18 |        0 |           0 |         48% | 10687–12706                    |
| 2026-10-18 |   32 |    4 |          15 |              17 |        0 |           0 |         46% | 12336–13149                    |
| 計         |  811 |   43 |         257 |             480 |       22 |          52 |         35% |                                |

- 「report 無し」は、その時点の `mcpTools` に report がまだ無かった行（09-23 の多くは report を足す前）。
- 「used の割合」は used ÷（used＋deferred）。
- report のトークンは、同じ日でも版の違うプロセスが混ざるので幅がある。09-27 に 509 から 3,267 へ、10-12 に 9,603 から 12,022 へ跳ねている。10-13 の 16,959 は1日だけの値。

### 1.3 used と deferred を分けているもの

日ではなく、そのセッションで最初のターンの終わりまでに report を呼んだかで分かれる。`report-usage` の最初の時刻と `context-usage` の行の時刻を、同じセッションIDで突き合わせた。

| context-usage の判別 | 突き合わせより前に呼んでいた | 呼んだのは突き合わせのあと | セッションで呼んでいない |
| -------------------- | ---------------------------: | -------------------------: | -----------------------: |
| used                 |                          225 |                          4 |                       28 |
| deferred             |                            1 |                        371 |                      108 |
| 判別不能             |                           15 |                          1 |                        6 |

- `report-usage` の記録は 09-27 から始まる。used で「呼んでいない」28件の多くは、それより前のセッション。
- 載っていた組み合わせで多いのは次のとおり。
  - `report`＋`speak`: 104件
  - `report`＋`speak`＋`work_plan`: 72件
  - `speak`＋`work_plan`: 59件
  - `report` だけ: 36件
- 記録だけで言えること:
  - report はセッションの始めには載っていない（deferred）。最初に呼ぶ前に取り込まれると used に変わる。
  - 一度も呼ばないセッション（108件）は、report の定義の費用を払っていない。遅延はツール1本の単位で効いている。
- 記録では確かめられないこと:
  - 取り込んだあとの各ターンで定義が載り続けるか（1セッション1行）。
  - deferred になる条件（ツール検索をどの基準で有効にするか）。
  - この2つは 2.1 で外部の文書と照らす。
- `src/` は常に読み込ませる設定も遅延の設定も渡していない（`defer_loading`・`alwaysLoad`・`ENABLE_TOOL_SEARCH` は0件）。

### 1.4 品質と費用に効くほかの数

**差し戻し**（`report-usage` の `kind: "rejected"`。実セッションの行だけで、4,356行すべてが実セッションだった）

| 日付        |  受理 | 差し戻し | 差し戻し ÷ 受理 | 塊の数（中央値） | 多い理由（件数）                                                 |
| ----------- | ----: | -------: | --------------: | ---------------: | ---------------------------------------------------------------- |
| 09-27–10-07 | 1,302 |        0 |            0.00 |                2 | （差し戻しを記録する前）                                         |
| 2026-10-08  |   176 |       40 |            0.23 |                1 | long-first-sentence 17, long-conclusion 8, arrow-in-prose 6      |
| 2026-10-09  |    63 |       27 |            0.43 |                2 | long-first-sentence 13, long-paragraph 4, unfinished-phases 3    |
| 2026-10-10  |   150 |       60 |            0.40 |                2 | long-first-sentence 24, long-conclusion 10, untitled-section 6   |
| 2026-10-11  |   110 |       55 |            0.50 |                2 | long-first-sentence 28, long-paragraph 7, background-running 6   |
| 2026-10-12  |   225 |       92 |            0.41 |                2 | long-first-sentence 47, crowded-notes 9, arrow-in-prose 9        |
| 2026-10-13  |    84 |       29 |            0.35 |                2 | long-first-sentence 15, background-running 3, long-paragraph 2   |
| 2026-10-14  |   169 |       86 |            0.51 |                3 | long-first-sentence 45, crowded-notes 11, background-running 10  |
| 2026-10-15  |   175 |       30 |            0.17 |                3 | long-first-sentence 18, crowded-notes 5, figure-contradiction 4  |
| 2026-10-16  |   190 |       11 |            0.06 |                2 | long-first-sentence 7, no-screenshot 1, crowded-notes 1          |
| 2026-10-17  |   295 |       69 |            0.23 |                3 | long-first-sentence 32, long-conclusion 10, background-running 7 |
| 2026-10-18  |   870 |       48 |            0.06 |                2 | long-first-sentence 28, crowded-notes 7, figure-contradiction 6  |

- 理由で一番多いのはどの日も `long-first-sentence`。schema の形ではなく文面の書き方で落ちている。
- 差し戻しのたびに引数をもう一度出力する。差し戻し ÷ 受理が 0.5 の日は、report の出力がおよそ1.5倍になっている見当。引数の大きさは記録に無いので見当にとどまる。

**report を呼ぶ1回あたりの出力トークンは、記録から取れない。**

- `report-usage` に字数の欄が無い。
- `token-usage` の `breakdown.*.tools` は report・speak・work_plan を数えていない。
- ターンの出力（`models[].outputTokens` の和）は、子エージェントを使わない work のターンで日ごとの中央値 3,346–14,209。thinking とほかのツールの引数が混ざるので、report の分は切り出せない。
- `breakdown.main.tokens.outputTokens` は `models[].outputTokens` よりずっと小さい（10-18 の400行で中央値 63 と 5,174）。物差しに使えない。

**ToolSearch の往復**: 子エージェントを使わない work のターン1回あたり、メインの ToolSearch は 0.17–0.53 回（日による）。report を最初に呼ぶ前の取り込みもここに入る。

## 2. 外部の一次情報

### 2.1 遅延読み込みの条件と、取り込んだあと

- **既定では MCP ツールは全部遅延する。** `ENABLE_TOOL_SEARCH` を設定しないと、MCP ツールはすべて遅延し、必要になったときに読み込まれる [code.claude.com](https://code.claude.com/docs/en/agent-sdk/tool-search)。
  - 例外は、古いモデル・第一者でない `ANTHROPIC_BASE_URL`・Azure 上の Microsoft Foundry で、このときは始めから読み込む。
  - `auto` にすると、遅延できる定義の合計が窓の10%に届くまでは全部を始めから読み込み、届いたら全部を遅延する。`auto:N` は割合を変える。
  - tsukumo は `ENABLE_TOOL_SEARCH` も `alwaysLoad` も渡していない（`src/` を grep して0件）。だから既定の「全部遅延」に当たり、1.3 の実測（呼ぶ前は deferred）と合う。
- **取り込んだツールは、圧縮されるまで後のターンでも載り続ける。** Agent SDK の文書は次のように書いている [code.claude.com](https://code.claude.com/docs/en/agent-sdk/tool-search)。
  - 1回の検索で読み込むのは、既定で関連の高い5本まで。
  - 読み込んだツールは "stay available for subsequent turns until the SDK compacts the messages where the agent discovered them"。
  - 圧縮のあとは、次に要るときにもう一度検索する。
  - API の側では、`tool_reference` を会話の履歴の中で毎回展開するので、取り込んだツールは検索し直さずに後のターンで使える [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。
  - つまり report の定義は、最初に取り込んでからセッションが終わるか圧縮されるまで、毎リクエストの入力に入る。
- **取り込んでもキャッシュは壊れない。** 遅延したツールは system prompt の接頭部に入らず、見つかったときに会話の中へ `tool_reference` として足して展開する [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)。
  - そのため、取り込んだあとの report の定義は、キャッシュの読み出しとして毎リクエスト払う。
  - キャッシュの読み出しは基本の入力単価の 10%。Claude Opus 5.5 と Claude Sonnet 5.5 では 5% [platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)。
- **見積もり（作業ツリーの外での計算で、確かめた値ではない）**: 10-17〜10-18 の work のターン（実セッション 723件）で集計した。
  - メインのリクエスト数（steps）は中央値 4、p90 18。
  - report の 12,706 トークンが毎リクエスト載ると仮定すると、ターンのキャッシュ読み出しに占める割合は中央値で 4.6%。この値は上限で、子エージェントの読み出しも分母に入っている。
- **遅延は1本ずつ指定できる。** 次の3つの口がある。
  - ツールの `_meta` の `"anthropic/alwaysLoad"` で、ツール1本ごとに「始めから読み込む・遅延のまま」を指定できる [code.claude.com](https://code.claude.com/docs/en/mcp)。
  - サーバの設定の `alwaysLoad` は、そのサーバのツールを全部始めから読み込む [code.claude.com](https://code.claude.com/docs/en/mcp)。
  - 手元の SDK（`@anthropic-ai/claude-agent-sdk` 0.3.288）の型にも、in-process サーバの `alwaysLoad` と、ツールごとの `tool({ alwaysLoad })` がある（`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`）。
- **説明文の切り詰めの上限は、遅延するかどうかで違う** [code.claude.com](https://code.claude.com/docs/en/mcp)。
  - 始めから読み込むツールの説明文とサーバの instructions: 4,096 字
  - ツール検索で読み込むツールの説明文: 16,384 字
  - 検索で照らし合わせるのは、短いほうの上限までの部分。
  - report のツール説明は 234 字なので、どちらの上限にも当たらない。引数の schema の中の `description` にこの上限が掛かるかは、確かめていない。
- **遅延の費用は検索1回ごとの往復1回。** Agent SDK の文書は次のように書いている [code.claude.com](https://code.claude.com/docs/en/agent-sdk/tool-search)。
  - 検索のたびに往復が1回増える。
  - 定義が窓に余裕で収まる10本未満のツールなら、始めから全部読み込むほうが普通は速い。
  - API の文書は、よく使う3〜5本を遅延しないことを勧めている [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。
  - 1.4 の実測では、ToolSearch はターン1回あたり 0.17–0.53 回。

### 2.2 論点2: 塊の単位にツールを割る案

- **遅延の単位はツール1本で、それより細かくは割れない。** `defer_loading` と `alwaysLoad` はツール（または toolset）単位の指定で、1本の schema の一部だけを遅延する仕組みは、どの文書にも書かれていない [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。塊ごとに遅延させるには、report を複数本のツールに割るしかない。
- **割ると読み込みの往復が増える。** 1回の検索で読み込めるのは既定で5本まで（Claude が `limit` で変えられる）で、検索ごとに往復が1回増える [code.claude.com](https://code.claude.com/docs/en/agent-sdk/tool-search)。
- **Anthropic はツールを少なく束ねることを勧めている。** 文書と記事は次のように書いている。
  - 関連する操作は `action` の引数を持つ1本に束ね、ツールを少なくすると選び違いが減る [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)。
  - "More tools don't always lead to better outcomes"、"Too many tools or overlapping tools can also distract agents" [anthropic.com](https://www.anthropic.com/engineering/writing-tools-for-agents)。
  - 30〜50本を超えて一度に載せると、選ぶ正確さが落ちる [code.claude.com](https://code.claude.com/docs/en/agent-sdk/tool-search)。
- **確かめていないこと**: report を割ったときにレポートの質や往復の回数がどう変わるかを測った、公開の評価は見つからなかった。「1回の report で1つのレポートを出す」という tsukumo の契約と、割ったツールの呼び出しをどう組み立てるかは、外部の文書では決まらない。

### 2.3 論点1: JSON schema の引数で受けるか、Markdown など別の形で受けるか

- **公開の評価には、JSON で包むと悪くなるというものと、良くなるというものがある。どれもコードや推論の課題で、日本語の長い報告文を測ったものではない。**
  - aider の評価（2024-08）: Claude 3.5 Sonnet を含む4モデルで、コードを JSON のツール呼び出しで返させると、Markdown で返させるより全部のモデルで成績が落ちた。Sonnet は構文の誤りが少ないのに落ちていて、"the negative effects of JSON-wrapping go beyond just syntactic difficulties" と書いている [aider.chat](https://aider.chat/2024/08/14/code-in-json.html)。
  - "Let Me Speak Freely?"（Tam ほか）: 形式を縛ると推論の課題で成績が大きく落ち、縛りが強いほど落ちる [arxiv.org](https://arxiv.org/abs/2408.02442)。
  - .txt の反論: 同じ論文について、構造化の側だけ違うプロンプトを使っているなどの比べ方の不備を挙げた。正しく組んだ構造化生成は、GSM8K などで 1〜6 ポイント良くなったとしている [blog.dottxt.ai](https://blog.dottxt.ai/say-what-you-mean.html)。
  - Anthropic の記事: 応答の形（XML・JSON・Markdown）で評価の成績は変わり、どれにも効く形は無い。モデルは学習データに近い形でよく働く [anthropic.com](https://www.anthropic.com/engineering/writing-tools-for-agents)。この記事が言っているのはツールの応答（モデルが読む側）で、引数（モデルが書く側）ではない。
- **Anthropic が書いている、ツールの性能に一番効くもの**は、ツールの説明を詳しく書くことで、"by far the most important factor in tool performance" とある [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)。
  - 入れ子が深い・形式に敏感な引数には `input_examples` も勧めている。費用は、簡単な例で 20〜50、入れ子の例で 100〜200 トークン [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)。
  - 記事では、例を付けると複雑な引数の扱いの正確さが 72% から 90% に上がった [anthropic.com](https://www.anthropic.com/engineering/advanced-tool-use)。
  - MCP ツールとして渡す report に `input_examples` を載せる口があるかは、確かめていない。
- **差し戻しと呼び直し**: 引数が誤っているか足りないと、Claude は直しながら2〜3回呼び直してから利用者に謝る [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)。エラーの文面には、何が誤りで次に何を試すかを書くよう勧めている（同じページ）。
  - 呼び直すたびに引数を全部書き直すことになる、と外部の文書が明言しているかは確かめていない。tsukumo の report は部分的に直す口を持たないので、手元では全部書き直しになる。
- **長い引数を流す口**: fine-grained tool streaming は、文書やコードのような大きい引数を、サーバ側で溜めずに流す [platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)。
  - 検証しないので、壊れた JSON や `max_tokens` で途中で切れた引数が届くことがある（同じページ）。
  - Claude Code・Agent SDK が MCP ツールにこれを使っているかは確かめていない。
- **確かめていないこと**: Claude 4 以降（tsukumo が使う Opus 5.5・Sonnet 5.5）で、長い散文を JSON の文字列の引数で受けた場合と、Markdown の本文で受けた場合の質を比べた公開の評価は見つからなかった。上の評価はどれも古いモデルか、コード・推論の課題での結果。

### 2.4 tsukumo の側の数

`tools/list` の応答（work のセッション。作業ツリーの外の台本で測った）:

| ツール         | 説明文（字） | 引数の schema（JSON の字数） |
| -------------- | -----------: | ---------------------------: |
| report         |          234 |                       21,428 |
| question_brief |          215 |                        6,400 |
| work_plan      |          242 |                        1,671 |
| speak          |          168 |                          504 |

- report の schema の内訳（JSON の字数）:
  - 大きい欄: `sections` 7,722、`task` 1,053、`checks` 996、`figure` 975
  - 共有の塊の定義（`definitions`）: 10件で各 586〜1,207
  - schema の中の `description` の文字列: 110個で計 7,177 字。残りの約1.4万字は型・enum・入れ子の骨組み
- system prompt に毎ターン載る記法の文面（`REPORT_NOTATION_PROMPT`）は 4,542 字・111 行。

### 2.5 代替の候補を2つの物差しで並べる材料

| 候補                                                                    | トークン消費に効く材料                                                                                                                                           | レポートの質に効く材料                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A. 今の形のまま                                                         | 取り込んだあとは、毎リクエスト report 約12.7k をキャッシュ読み出しで払う（2.1）。呼ばないセッションは払わない（1.3）                                             | 説明文の詳しさが性能に一番効く（2.3）。一方で、JSON で包むと悪くなる評価もある（2.3）                    |
| B. report に `alwaysLoad` を付ける                                      | 1回目の ToolSearch の往復が消える（2.1）。そのかわり、呼ばないセッション（108件）も最初から払う                                                                  | 説明文が 4,096 字で切られる（今は 234 字なので当たらない）（2.1）                                        |
| C. 塊の種類ごとにツールを割る                                           | 使う塊の分だけ載る。そのかわり、検索1回ごとに往復が1回増え、1回で読み込めるのは5本まで（2.2）                                                                    | Anthropic は束ねることを勧めている（2.2）。割ったときの質の評価は無い                                    |
| D. 本文を Markdown で受け、構造はあとから取り出す                       | schema の骨組み（約1.4万字、推定約8.3k トークン。3.1）の多くが要らなくなる見当。JSON の書き下ろし（引用符・改行の escape）の分も減る見当で、こちらは測っていない | aider の評価は Markdown のほうが良い。反論もある（2.3）。取り出しを tsukumo 側で失敗したときの扱いが要る |
| E. プロンプトの文面と schema の説明の二重を畳む                         | 記法の文面 4,542 字と schema の説明 7,177 字の字面の重なりは、説明 7,177 字中 127 字（3.1）                                                                      | 詳しい説明は効くので（2.3）、消すのでなく1か所に寄せる話                                                 |
| F. 差し戻しの仕組みを変える（部分的に直す口・文面の検査をツールの外へ） | 差し戻し ÷ 受理は 0.06〜0.51 で、そのたびに引数を全部書き直す（1.4）。Claude は直しながら2〜3回呼び直す（2.3）                                                   | 差し戻しの理由で一番多いのは文の長さ（1.4）で、受け方の形とは別の軸                                      |

## 3. 推し

### 3.1 決め手になった数

推しを決める前に、作業ツリーの外の台本で次を測った。

- **report の定義のトークンの内訳**: `tools/list` の8本について、字数（ASCII と非 ASCII）と記録のトークン数を最小二乗で当てた。
  - ASCII は1字 0.582、非 ASCII は 0.591 トークンで、1本あたり 36.8。report の当てはめは 12,715 で、記録は 12,706。
  - この率で分けると、report は説明文が約4,360、骨組みが約8,318 トークンになる。
  - 骨組みで字数が多いキーは、`type` 4,058 字、`required` 1,669、`default` 844（うち `""` が56個）、`properties` 752、`enum` 725、`$ref` 706。
- **字数はトークンの物差しとして使える**: ASCII と日本語で1字あたりの費用がほぼ同じなので、字数の上限（`REPORT_INPUT_SCHEMA_MAX_CHARS` ほか）はトークンの代わりとしてそのまま使える。上限の数え方を変える必要はない。
- **骨組みを短く書いた場合の見当**: 同じ型を TypeScript 風の型の表記にすると 3,692 字（推定 2,186 トークン）。説明文を全部残しても、合計は今の約6割の見当。
  - この変換は手元のもので、`minItems` などの制約と既定値は落としている。
  - 制約は今もサーバの zod で検査しているので、モデルに見せなくても検査は残る。
- **プロンプトと schema の説明の重なり**: 12字の窓で一致を数えた。
  - schema の説明 7,177 字のうち、記法の文面（`REPORT_NOTATION_PROMPT`）にもあるのは 127 字。
  - 記法の文面 4,542 字のうち、schema の説明にもあるのは 112 字。
  - 字面の二重はほとんど無い。意味の重なり（言い換え）は数えていない。

### 3.2 候補ごとの判断

| 候補                                                    | 判断                     | 理由                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. 今の形のまま                                         | 採らない                 | 毎リクエスト載る約1.27万トークンのうち、約8.3k は骨組みで、説明文（性能に一番効くもの、2.3）ではない。削れる見込みが測れたので、そのまま置く理由が無い                                                                                                 |
| B. report に `alwaysLoad` を付ける                      | 採らない（今は）         | 1回目の ToolSearch の往復は消える。そのかわり、report を呼ばないセッション（1.3 で108件、約15%）も最初から払う。始めから読み込むツールは説明文が 4,096 字で切られ（2.1）、G で説明文に型を寄せる道と合わない。G のあとで定義が小さくなってから測り直す |
| C. 塊の種類ごとにツールを割る                           | 採らない                 | 遅延はツール1本の単位でしか効かず、割ると検索の往復が増え、1回で読み込めるのは5本まで（2.2）。Anthropic は束ねることを勧めている（2.2）。割ったときの質の評価も無い                                                                                    |
| D. 本文を Markdown で受け、構造はあとから取り出す       | 採らない（今は）         | 図・数・前後のような塊は構造のある値が要り、Markdown の中に結局 JSON や YAML の囲みを作ることになる。そうすると呼んだ時点の zod の検査が無くなる。質の評価は古いモデルのコード課題で、反論もある（2.3）。骨組みの費用は G で、検査を残したまま削れる   |
| E. プロンプトと schema の説明の二重を畳む               | 採らない                 | 字面の重なりは 7,177 字中 127 字（3.1）で、畳んで減るものがほとんど無い                                                                                                                                                                                |
| F. 差し戻しの仕組みを変える（直す欄だけ出し直す口など） | 検討（記録を足してから） | 差し戻し ÷ 受理は 0.06〜0.51 で、そのたびに引数を全部書き直す（1.4）。ただし引数の大きさが記録に無く、減る量を見積もれない。理由で一番多いのは文の長さ（1.4）で、受け方の形とは別の軸                                                                  |
| G. 1本・JSON のまま、骨組みを軽くする（新しい候補）     | 採る（段を踏んで）       | 約8.3k の骨組みが削る相手（3.1）。サーバの zod の検査は残せる。Anthropic が一番効くとする説明文（2.3）は削らない。質への影響は、試しの段で差し戻しと検査の落ちの率で見る                                                                               |

### 3.3 移行の段（1段＝1課題）

1. **記録を足す**: `report-usage` の行に、引数の字数（全体と欄ごと）を足す。schema の検査で落ちた呼び出しも数える。
   - 検査で落ちた呼び出しが、MCP の SDK の手前で弾かれて tsukumo に届いていないかは確かめていない。この段の最初に確かめる。
   - 2・3段の効き目と、F の見積もりの物差しになる。
2. **骨組みのうち、意味の無い部分を落とす**: モデルに渡す schema から、`default: ""`（56個）・`$schema`・モデルの書き方に効かない制約（`exclusiveMinimum`・`minLength` など）を外す。zod の検査はそのまま。
   - 見込みは約1,300字（約780トークン）。
   - 前提として、SDK の `tool()` が zod の形のほかに手で整えた JSON schema を受けられるかは確かめていない。この段の最初に確かめる。
3. **型の表記を短くする試し**: 塊の定義を短い型の表記（TypeScript 風）にして、説明文はそのまま残す版を、切り替えの口の裏で作る。数日動かして、1段の記録で次を前の版と比べる。
   - `context-usage` の report のトークン
   - 差し戻し ÷ 受理
   - 検査で落ちた呼び出しの率
   - 説明文が 4,096 字を超えるので、B と同時には採れない（2.1）。
4. **採否を決めて切り替える**: 3段の数で採るなら既定にして、字数の上限（`REPORT_INPUT_SCHEMA_MAX_CHARS` ほか）を新しい大きさに合わせて下げる。採らないなら試しを消す。
5. **差し戻しを決める（F）**: 1段の記録で、差し戻しの出し直しが出力の何割を占めるかが出てから、直す欄だけ出し直す口を作るかを決める。
6. **B を測り直す**: 定義が小さくなったら、`alwaysLoad` で1回目の往復を消すほうが得かを、1.3 の割合で計算し直す。

### 3.4 確かめていないこと

- Opus 5.5・Sonnet 5.5 で、短い型の表記のほうが JSON schema より書き違いが増えるか減るか（3段の試しで測る）。
- Claude Code が MCP ツールの `inputSchema` を API にそのまま渡しているか。厳格モード（strict）を使っているか。
- 1字あたりのトークンの率は、8本の当てはめの推定で、token-count API で数えたものではない。
