# AI が書いた長文の報告・調べものの結果を読ませる画面の先例（2025 後半〜2026、2026-10-18）

**この文書は調査の記録であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
画面の値と色の正典は `docs/architecture/screen-design.md` 13 章と `src/browser/styles/theme.css`、表示物の正典は
`docs/architecture/display.md`「各表示物」で、**採用が決まるまでコードは1行も変わらない。**

**主題**: Deep Research 系・ノート系・検索系の製品が、AI の書いた長い報告を**どの形で読ませているか**（最初の1画面・本文の寸法・出典・図・
読む補助・暗い面・書き出し）と、それを評した声・「テンプレっぽさ」の議論。既存の調査とは重ねず、引くだけにする:
コーディングエージェントの完了報告の UI は `agent-report-ui-patterns.md`、報告の型は `engineering-report-forms.md`、Distill・Tufte・Linear などの
読み物の値は `beautiful-explanation-design-precedents.md`、塊ごとの作法は `report-block-craft.md`。2026-10-17 の提案書
`report-excellence-strategy.md` で決まった値（見出し 52/13・`ink-bright`・余白の柱・題の2段など）は繰り返さない。

**出典の印**: 無印は一次情報（公式のブログ・ヘルプ・ドキュメント・公開の画面）。**【実測】**は公開ページを 2026-10-18 に headless Chromium
（1440×900、`prefers-color-scheme: dark`）で開き、計算済みスタイルを読んだ値。**【二次】**は記事・フォーラム・デザイナーの分析経由。
**【推測】**は私の推定。**【換算】**は私の計算（対比は WCAG 2 の式）。番号 `[n]` は末尾の出典一覧。確認日はすべて 2026-10-18。

## 要点（10行以内）

1. 2026 年は**報告を会話から外し、文書として読ませる**側へ揃った。ChatGPT は全画面のビューア（左に目次・右に出典）[8][9]、Copilot Researcher は左上に目次を持つ埋め込みの窓 [35]、Gemini は Canvas の板 [12]、Manus は右半分のファイルビューア【実測】、Claude は Docs [6]
2. tsukumo の「やり取りの列（見出しの子の行）＋本文＋余白の柱」は ChatGPT のビューアの3列と**同じ型**。違うのは高さ（1400×900 で 512px 対 Manus のビューアの約 800px【実測】）
3. 本文の値【実測】は 16px・行送り 24〜26px・列 684〜768px、字は 13.2〜17.2:1、地は #15〜#1b の無彩色寄り。tsukumo（15/26px・12.8:1・地 `#221f2b`）は帯の中で、地だけ一段明るく紫に寄る
4. 出典は3つの形に分かれる: **文の直後のドメインの札**（Perplexity・ChatGPT【実測】）、**番号の札に原文の引用が出て、押すとその位置へ飛ぶ**（NotebookLM [19]）、**文の隣のリンク＋なぜ役立つかの一言**（Google AI Mode、2026-10 [42]）。末尾だけの脚注は「探す手間」で不評 [11]
5. 生成する図の形式も3つ: 画像モデルの1枚絵（NotebookLM のインフォグラフィック・スライド。見栄えは評価、誤字と編集できないことが不評 [24]）、HTML/SVG（Claude のインラインの図 [4]・Gemini の visual reports [14]）、Markdown の表（ChatGPT・Perplexity）
6. 評価の一次は「中身と形」の両方を指す。Google の研究で、問いごとに組んだ画面は Markdown の答えより 82.8%（情報を探す問いで 90.5%）好まれたが、人の専門家の画面には届かず、生成の速さは測っていない [17][18]
7. テンプレっぽさの手がかりは「**カードの左か上の色の罫**」（1,590 ページを DOM で採点した Krebs の記事に「文の em ダッシュと同じくらい確かな印」と引かれる [44]）・数の札の横並び・1-2-3 の番号・同じ形のカード・太字の多用・「語: 文」の箇条 [44][45][47]。tsukumo は 3px の左の色罫を6つの役で使う
8. 採るとしたら: 左の色罫を状態を運ぶ所に絞る・描いた DOM でテンプレの手がかりを数える・`path:line` の抜き書きをその場で見せる・選んだ字を入力欄へ引く口・数が2つ以下なら文に入れる条

## 1. 知見: 製品ごとの読む面

### 1.1 最初の1画面・図・書き出し

| 製品（版・時期）                                                 | (a) 最初の1画面                                                                                                                                   | (d) 図・数の札と生成形式                                                                                                                                                                                | (g) 書き出し・共有                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Claude（Research 2025-04・インラインの図 2026-03・Docs 2026-09） | Research は会話の中の答えに押せる引用 [1]【二次】[2]                                                                                              | **インラインの図**は側の板ではなく本文の中に出て「会話が進むと変わるか消える」一時のもの。常に置く artifact と分ける [4]。HTML/SVG【二次】                                                              | Docs は Word・Google Docs へ、Slides は PowerPoint・PDF へ。作ったものは1本の共有リンク [6]                 |
| Claude Code の artifact（2026）                                  | 会話から出した1枚の HTML。公式の見本は主張の題を持つグラフ・番号の注を付けた画面の並び・増減の札つきの数の札の列（明るい面）[7]                   | 「行の脇に注を付けた差分」「案を格子に並べ、各案の下に1行の得失」「進むと埋まる経過の時系列」。図はラスタ画像より SVG か HTML/CSS を勧める [7]                                                          | 版つきで同じ URL を更新、組織内・公開の共有、注釈の会話、「Copy as prompt」で結果を会話へ戻す口 [7]         |
| ChatGPT deep research（GPT-5.2、2026-02 の更新）                 | 全画面のビューア: 左に目次、右に開ける出典の列 [8][9]【二次】。共有ページは角丸のカードに h1 と「Introduction」から始まり、要約の段は無い【実測】 | 表・グラフ・データの要約を報告に入れる【二次】[9]。共有の1本は表2つ・図0【実測】                                                                                                                        | Markdown・Word・PDF、共有リンク [8]【二次】                                                                 |
| Gemini Deep Research（Gemini 3、visual reports 2025-12）         | 右の Canvas の板に報告。右上に Create と Share & export [12][13]                                                                                  | Ultra は画像・グラフ・対話できる模擬・図式を報告に入れる [14]。Create でウェブページ・インフォグラフィック・クイズ・音声の概要へ作り替える [13]                                                         | Docs へ書き出し・Canvas の共有・中身の写し [12]                                                             |
| NotebookLM（2026-07-16 に Gemini Notebook へ改名 [23]）          | 出典・会話・成果物（Studio）の3枚の板【二次】[52]。成果物は報告・マインドマップ・インフォグラフィック・スライド・データ表・音声と動画の概要 [20]  | インフォグラフィックとスライドは画像モデル（Nano Banana Pro）の1枚絵 [22]。2026-03 に10の画風（Professional・Editorial・Bento Grid など）[20]。マインドマップは枝を押すとその話題で会話が始まる【二次】 | スライドは PDF と PPTX [20]、データ表は Sheets へ【二次】                                                   |
| Perplexity（Pages 2024-05・Deep Research 2025-02・Labs 2025-05） | Discover の記事面は serif の大きな題 → 引用つきの導入の段落 → 出典の札4枚 → 画像【実測】                                                          | Labs は図・画像・CSV・コードを「Assets」のタブに集め、ミニアプリ（ダッシュボード・スライド）を「App」のタブに出す [27]                                                                                  | PDF・文書へ書き出し、Page に変換して共有 [26]。Page は節の追加・並べ替え、読み手（一般・専門家）を選ぶ [25] |
| Manus（2.0 の共有の再生）                                        | 会話に「報告は次を含む: 1〜6」の箇条と添付の札（`comprehensive_report` Markdown 54.77 KB）、押すと右半分にビューア【実測】                        | スライド・対話できるダッシュボード・PDF の報告・単独のウェブページ。棒・線・円・散布・ヒートマップ・レーダー [30]                                                                                       | 公開ページの恒久リンク [30]、作業の再生（Step 8/8）【実測】                                                 |
| Microsoft 365 Copilot Researcher（2026-04 GA・09 の更新）        | 埋め込みの窓、左上に目次、下端に変換の道具、出典の全一覧【二次】[35]                                                                              | 図・グラフ・章立て・引用つき [33]。要点を1枚にまとめるインフォグラフィックと合成の画像【二次】[35]                                                                                                      | Word・Pages・PowerPoint・PDF・インフォグラフィック・音声の概要へ、引用を保ったまま [34]                     |
| Notion AI（Research Mode 2025-05）                               | 作業場とウェブを読んで「詳しく磨いた文書」を下書きする [36]。出力は Notion のページの組版そのもの【実測は公開ページで】                           | Notion のブロック（表・callout）                                                                                                                                                                        | ページの共有                                                                                                |
| Kimi（Researcher 2025-06・OK Computer 2025-09）                  | visual report の公開ページ: 勾配の地の表紙 → 右上に「Key Metrics」の4行 → アイコンつきのカード3枚 → 左に目次の列【実測】                          | HTML のページそのもの。多ページのサイトとスライドも作る【二次】[40]                                                                                                                                     | preview の公開リンク【実測】                                                                                |
| Grok DeepSearch（Grok 3、2025-02）                               | 「簡潔で網羅的な報告」[41]。途中の考えは「Thoughts」で開く【二次】                                                                                | 確認できず                                                                                                                                                                                              | 確認できず                                                                                                  |
| Google AI Mode（2026-05・10 の更新）                             | 2026-10 から、公式の場所が1〜2つしかない問いでは答えの頭にその節を出し、各リンクに「なぜ役立つか」を添える [42]                                   | Pro・Ultra に問いごとに組む画面（generative UI）[17]                                                                                                                                                    | —                                                                                                           |

### 1.2 出典・読む補助

| 製品           | (c) 出典・根拠                                                                                                                                                                            | (e) 読む補助                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Claude         | 「確かめやすい引用」[1]。主張ごとに出典の位置を探す専用の段（CitationAgent）が報告と資料を読んで付ける [3]                                                                                | 確認できず（要ログイン）                                                                            |
| ChatGPT        | 文の直後に favicon とドメインの丸い札（`colab.ws` など。末尾の出典の箇条を含めリンクが1本に 156）、本文の後に「Sources」の札（favicon を重ねた丸）【実測】。ビューアは右の列に出典 [8]    | 左の目次から節へ飛ぶ [8]。研究の計画を走る前に直し、走りながら範囲を足せる【二次】[9]               |
| Gemini         | 2025 の報告は末尾にリンクの無い脚注を並べ、「脚注の節まで行って押す」手間を利用者が指摘 [11]【二次】                                                                                      | 計画を「Edit plan」で直してから走らせる [12]                                                        |
| NotebookLM     | 引用の札に重ねると引用した原文の全文、押すとその原文の位置へ飛んで文脈で読む [19]                                                                                                         | マインドマップで全体を先に見る【二次】                                                              |
| Perplexity     | 段落の末尾に等幅 10px のドメインの札（`news.bloombergtax`）、本文の直後に出典の札4枚（角丸 8px・favicon・ドメイン・題2行）【実測】。答えの頭は Answer / Links / Images のタブ【二次】[28] | 調べた手順は「Completed N steps」として既定で畳み、答えを主にする【二次】[28]                       |
| Manus          | 確認できず（今回の1本は本文に出典の印が無い）                                                                                                                                             | ビューアの右端に**見出しごとの点の列**（6px、いまの節だけ明るい点、押すと飛ぶ）。⤢ で広げる【実測】 |
| Copilot        | 引用を保ったまま他の形式へ [34]。出典の全一覧【二次】[35]                                                                                                                                 | 左上の目次【二次】[35]。長さと詳しさを生成の前に選ぶ【二次】[35]                                    |
| Kimi           | 本文中の青いリンク【実測】                                                                                                                                                                | 左の目次の列が読んでいる節に左罫と字の明るさで付いてくる（scroll-spy）【実測】                      |
| Google AI Mode | 文の隣にリンクを置き、応答の上のほうに出す頻度を上げた（2026-10）[42]。デスクトップでリンクに重ねると題とサイト名の下見（2026-05）【二次】[43]                                            | 末尾の関連記事に縮小画像 [42]                                                                       |

## 2. 知見: 本文の寸法と暗い面【実測】

公開ページを開いて本文の段落・見出し・引用の札の計算済みスタイルを読んだ。Claude.ai・Gemini・NotebookLM・Copilot は共有ページを
見つけられないか要ログインで、測っていない。

| 面（見た日 2026-10-18）                              | 地 / 本文の面                                                    | 本文の字 / 対比【換算】                          | 本文                                        | 列         | 見出し                                                              | 罫・その他                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- | ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| ChatGPT の共有ページ（2025-03 の deep research）[10] | 地 `#000000`、報告は**角丸 28px のカード** `#1b1b1b`（幅 832px） | `#ffffff` / 17.2:1                               | 16 / 26px・400・system-ui                   | 768px      | h1 24/32px・600、h2 20/28px・600・上 16 下 4px（h3 なし）           | 表は 14px、見出し行の下 白 15%・行罫 白 5%。`strong` が1本に **67** |
| Perplexity Discover の記事（Pages の系統）[29]       | `#15191d`（外側 `#100e12`）                                      | `#dadfe3` / 13.2:1                               | 16 / 26px・**太さ 350**・serif（pplxSerif） | 720px      | 題 36.8/46px・465・serif                                            | 引用は等幅 10px のドメインの札、出典の札は角丸 8px                  |
| Manus のファイルビューア [32]                        | `#1a1a1a`                                                        | `#e6e6e6` / 13.9:1                               | 16 / 24px・system-ui                        | 684px      | h1 30/39px・600・**serif（Libre Baskerville）**、h2 24/31.2px・sans | 右端に見出しの点の列（6px）                                         |
| Notion の公開ページ（Deep Research の解説）[37]      | `#191919`                                                        | `#f0efed` / 15.3:1                               | 16 / 24px                                   | 708〜720px | h1 40/48px・700、h3 24/31.2px・600                                  | —                                                                   |
| Kimi の visual report [39]                           | **暗い指定でも明るい**: 目次の列 `#faf8f6`、本文 `#ffffff`       | `#1f2937` / 14.7:1                               | 16 / 24px・Inter                            | 896px      | h2 30/36px・600・serif（Crimson Text）・字は藍 `#1e1b4b`            | 目次の字 14px `#64748b` は 4.49:1。勾配の表紙・左罫の囲み           |
| tsukumo（正典）                                      | ground `#191720` / surface `#221f2b`                             | `ink` `#e8e3ea` / 12.8:1（`ink-bright` 約 15:1） | 15 / 26px・system-ui                        | 42em       | `##` 21px・`###` 17px                                               | 行罫 `rule-soft` 約 1.3:1                                           |

読み取り:

- 本文は5面とも **16px・行送り 24〜26px**、列は **684〜768px**（Kimi だけ 896px）。tsukumo の 15px・26px・42em は帯の中にある
- 暗い面の地は **#15〜#1b の無彩色に近い黒**で、Perplexity だけ青に、tsukumo は紫に寄る。tsukumo の本文の面 `#221f2b` は4製品より一段明るい
- 字の明るさの決め方は割れる。ChatGPT は純白（17.2:1）、Perplexity は 13.2:1 に**細字（350）の serif**、Manus は 13.9:1。暗い面で字を細くして
  にじみを抑える選択は Perplexity だけに見えた【推測: 意図の公式の説明は見つけていない】
- 報告を**一段明るいカードに載せる**のは ChatGPT（`#000` の上に `#1b1b1b`）。Perplexity・Manus・Notion は地にそのまま組む。tsukumo は最終レポートに
  箱を持たない（13.2、2026-10-03）側で、Perplexity などと同じ
- serif を見出しにだけ使う（Manus・Kimi）か本文まで使う（Perplexity の記事面）製品が3つあった。どれも欧文で、和文の例は無い
- 太字は ChatGPT の1本に 67 個。tsukumo の条（`**` は1段落に1か所）より桁で多い

## 3. 知見: 出典と根拠の見せ方

| 形                               | 先例                                                             | 良い点                                             | 悪い点                                                            |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 文の直後のドメインの札           | Perplexity（等幅 10px）・ChatGPT（favicon つきの丸い札）【実測】 | 出どころの種類（論文・報道）が読む流れの中で分かる | 札が多いと段落が途切れる（ChatGPT の1本は段落ごとに複数）【実測】 |
| 番号の札＋原文の下見＋位置へ飛ぶ | NotebookLM [19]                                                  | **主張と根拠の原文を同じ場所で照らし合わせられる** | 重ねる操作が要る（読むだけでは見えない）                          |
| 文の隣のリンク＋「なぜ役立つか」 | Google AI Mode（2026-10）[42]                                    | どのリンクを開くべきかを読み手が判断できる         | 検索の文脈で、報告の本文での効き目は未確認                        |
| 末尾の脚注・出典の一覧           | Gemini の 2025 の報告 [11]・Copilot の全一覧【二次】[35]         | 本文が静か                                         | 「脚注の節まで行って押す」手間（利用者の指摘 [11]）               |
| 主張ごとに根拠を付ける専用の段   | Claude の CitationAgent [3]                                      | 書き手と別の段が付けるので取り違えが減る           | 画面の形ではなく作り方                                            |

利用者の声で一番具体的なのは DEVONthink のフォーラム [11]: 同じ問いで ChatGPT と Gemini を比べた人が「Gemini はリンクの無い脚注を並べるだけで、
脚注の節まで行って押す必要がある」「本文の中のリンクのほうが手間が少ない」と書き、別の人は「脚注の見た目の美しさ」を好み、補う道具で両立していた【二次】。

## 4. 知見: 図と数の札の形式

| 生成の形式                   | 先例                                                                                                       | 評価された点                                                                                                                                          | 不評・限界                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 画像モデルの1枚絵            | NotebookLM のインフォグラフィックとスライド（Nano Banana Pro）[22]、Copilot の1枚の要約【二次】            | 「見て美しい物語」に磨かれた見た目【二次】[24]、画風を選べる [20]                                                                                     | 画像の中の字が**誤字・作り話**になり、全部読んで確かめる必要。字や配置を直せない（2026-01 の評【二次】[24]。2026-03 に PPTX の書き出しと直しの依頼が入った [20]） |
| HTML / SVG（問いごとに組む） | Claude のインラインの図 [4]、Gemini の dynamic view・visual reports [14][17]、Kimi・Manus のページ【実測】 | Markdown の答えより 82.8% 好まれ、情報を探す問いで 90.5%。Elo は専門家の画面 1800 > 生成の画面 1736 > Markdown 1438 > 検索1位 1352 > 素の文 1174 [18] | 生成に1分以上、ときどき誤り [17]。評価は生成の速さを含まない [17]                                                                                                 |
| Markdown の表と文            | ChatGPT・Perplexity【実測】                                                                                | 速く、直せて、写せる                                                                                                                                  | 上の研究で生成の画面に大きく負ける [18]                                                                                                                           |

- Claude は図を**2つの寿命**に分けた: 会話の理解を助ける一時の図は本文の中、残して共有するものは artifact [4]。Claude Code の artifact の文書は
  図に「ラスタ画像より SVG か HTML/CSS」を勧める（字が直せて軽い）[7]
- 数の札の横並び（増減の札つき）は Claude Code の公式の見本 [7] と Kimi の「Key Metrics」【実測】にあり、ChatGPT・Perplexity・Manus の報告には無かった（各1本の実測）【実測】
- 図の題を主張にする例: Claude Code の見本は「The funnel didn't sag — it snapped」のように題で結論を言い、下に測り方（n と期間）を小さく添える [7]
  （10-17 の題の2段と同じ形で、繰り返さない）

## 5. 知見: 何が「美しい・読みやすい」と評されたか

| 評されたもの        | 声                                                                                                                                                                                                                                              | 何が評価されているか   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 文書として読む形    | ChatGPT のビューアは「会話より専用の文書の読み物に近い」「気の散らない環境」【二次】[9]。どの製品も 2026 年に報告を会話から外した（1.1）                                                                                                        | **構造**               |
| 問いごとに組む画面  | 人の評価で Markdown より 82.8% 好まれる。ただし専門家の画面と同等以上は半分 [18]                                                                                                                                                                | **図・構造**           |
| 1枚絵のスライド・図 | 「見て美しい」が、直せず誤字があるので仕事の資料には向かない【二次】[24]                                                                                                                                                                        | 図（ただし信頼で減点） |
| 本文の中の引用      | 「確かめやすい引用」を Claude が売りにする [1]。脚注より本文の中のリンク（利用者）[11]                                                                                                                                                          | **引用**               |
| 中身                | Gemini 2.5 Pro の Deep Research は他社より 2 対 1 で好まれた [15]。項目別は網羅 76.9%・完全さ 73.3%・指示 60.6%・**文の質 58.2%**【二次】[16]。好みを動かすのは網羅で、文の差は小さい                                                           | 中身 > 文              |
| 長さ                | Mollick は「長すぎるという声は分析の報告の要点を外している。報告は答えより、曖昧な場面で考えるために論拠の議論を見せるもの」と擁護 [49]。Evans は「表に誤りがあれば数によらず信用できない。10ページの文書も同じで、だいたい合っているだけ」[48] | 信頼                   |
| 評価の物差し        | DeepResearch Bench の RACE は網羅・洞察・指示・**読みやすさ**の4軸を問いごとに重み付けする [50]                                                                                                                                                 | 読みやすさは4分の1     |

「静けさ」を名指しで評した一次の声は見つからなかった。Perplexity の記事面（serif・細字・装飾なし）と Notion は静かな紙面に寄せた選択に見える【推測】。

## 6. 知見: AI 生成の報告がテンプレっぽく見える手がかり

Krebs は Hacker News の Show HN の 1,590 ページを headless のブラウザで開き、DOM と計算済みスタイルを**決まった規則で**検査した（LLM に画を見せない）。
4つ以上の手がかりを持つページが 22%（347）、2〜3 が 32%、0〜1 が 46% [44]。Anthropic 自身も、指示が無いとモデルは「Inter、白地に紫の勾配、
控えめな動き」に寄ると書き、原因を分布の収束と呼ぶ [46]。

| 手がかり                                      | 出典                                                                                                                                               | 測った面で見た所                                            | tsukumo のいま                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **カードの左か上の色の罫**                    | Krebs の記事に引かれたデザイナーの言「色の左罫は、文の em ダッシュと同じくらい確かな印」[44]、Canatselis「あの左端の色の線と角丸の板」【二次】[45] | Kimi の「Key Innovations」の囲み（左の青い罫）【実測】      | **3px の左の色罫が6つの役**: `note` の5種（地の段差つき）・お願い・採る案・依頼・引用・図のエラー（`report-notation.module.css` ほか） |
| 数の札の横並び（stat banner）                 | Krebs [44]                                                                                                                                         | Kimi の Key Metrics【実測】、Claude Code の見本 [7]         | `stats`（レポートの 4.1%）。10-17 の条6 は「2行以下の表は `stats` か label 付きの箇条へ」                                              |
| 1・2・3 の番号の並び                          | Krebs [44]                                                                                                                                         | —                                                           | `flow` の番号の丸                                                                                                                      |
| アイコンを頭に置いた同じ形のカード            | Krebs [44]・Canatselis【二次】[45]                                                                                                                 | Kimi の3枚【実測】                                          | 候補のカードはアイコンなし                                                                                                             |
| 「**語:** 文」の箇条（inline-header）         | Wikipedia の Signs of AI writing [47]                                                                                                              | Kimi の囲み【実測】                                         | label 付きの箇条が 80%。ただし描画は2列の定義表で、行頭に太字を置く形ではない                                                          |
| 太字の多用                                    | [47]                                                                                                                                               | ChatGPT の共有の1本に 67【実測】                            | 1段落に1か所の条                                                                                                                       |
| 決まった見出し・見出しの誤用                  | [47]                                                                                                                                               | Manus・Kimi の「Executive Summary」【実測】                 | 汎用語の見出しは 2820 中 30                                                                                                            |
| Inter・紫の勾配・灰色の本文の暗い面・低い対比 | Anthropic [46]・Krebs [44]                                                                                                                         | Kimi は Inter と藍の見出しと slate の目次（4.49:1）【実測】 | system-ui、本文 12.8:1。暗い面は常時（正典）                                                                                           |
| 飾りの絵文字・全部大文字の見出し              | [44][47]                                                                                                                                           | —                                                           | 使っていない（状態の印は ✓ ? ✕ の字）                                                                                                  |
| 全部を一度に見せる（段階的に開かない）        | Canatselis【二次】[45]                                                                                                                             | ChatGPT の共有の1本は畳みなし【実測】                       | `fold` はレポートの 0.4%                                                                                                               |

注意: 左罫の囲みは GitHub の Markdown の注意書き（alerts）の形でもあり、手がかりは「その形があること」より「どこにでもあること」に効く【推測】。
Krebs も1つではなく4つ以上を「多い」と数える [44]。

## 7. tsukumo に効く示唆

### 7.1 いま／先例／差（10-17 で決まっていないものだけ）

| 項目               | tsukumo のいま                                                              | 先例                                                                                                               | 差                                                                                                              |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 読む面の型         | やり取りの列（見出しの子の行・いまの節に地と印）＋本文＋余白の柱（`aside`） | ChatGPT のビューアの左目次・本文・右出典 [8]、Kimi の scroll-spy の目次【実測】                                    | **型は同じ**。高さが 512px（1400×900）対 Manus のビューア 約 800px【実測】、全画面の ChatGPT はそれ以上【推測】 |
| 読む面を広げる     | 13.13 で「一時的に広げる口」を却下（仕切りのドラッグで足りる）              | ChatGPT は全画面へ、Manus は ⤢ で広げる【実測】                                                                    | 仕切りが実際に動かされているかを誰も数えていない                                                                |
| 根拠の照らし合わせ | `path:line` は押すと開く、`files` に1行の `note`、柱に出どころ              | NotebookLM は重ねると原文、押すと位置へ [19]。Google は「なぜ役立つか」[42]                                        | `note` は「なぜ」を持つが、**根拠の中身をその場で見る口が無い**                                                 |
| URL の出典         | 下線のリンク（13.1）                                                        | 文の直後のドメインの札（Perplexity・ChatGPT）【実測】                                                              | 調べもので出どころの種類が読む流れで分からない                                                                  |
| 一部への問い返し   | 正典に口の記述が無い（選んで写すことはできる）                              | ChatGPT の「Ask ChatGPT」で選んだ字を入力欄へ引く【二次】[51]、Claude Code の artifact の「Copy as prompt」[7]     | 読んだ箇所を指して聞くのに、写して貼る2手がかかる                                                               |
| 左の色罫           | 6つの役（7.2 の1）                                                          | 「em ダッシュと同じくらい確かな印」[44]                                                                            | 多い                                                                                                            |
| 数の札             | 10-17 の条6 が2行以下の表を `stats` へ寄せる                                | 報告の製品は数の札を使わず文と表で言う（ChatGPT・Perplexity・Manus の各1本）、札は dashboard 型の面だけ【実測】[7] | 条6 がテンプレの手がかりを増やす向きに効く                                                                      |
| 図の形式           | tsukumo が描く塊（`mermaid`・`graph`・`chart`・`svg`・`image`）             | 画像モデルの1枚絵は誤字と直せないことで不評 [24]                                                                   | 先例の失敗を避けた側。変えない                                                                                  |
| 暗い面の地         | surface `#221f2b`（紫寄り）                                                 | #15〜#1b の無彩色寄り【実測】                                                                                      | 一段明るい。効き目の根拠は無く、変える理由も無い                                                                |

### 7.2 採るとしたら何を変えるか

1. **左の色罫を、状態を運ぶ所に絞る。** 残すのは注意・異常の `note` とお願い（読み手の行動か危険を言う）。採る案の罫は「採る」の札が同じことを
   言うので外す（二度処理）。依頼の塊は `ground` の地と枠で足りるので罫を外す。情報・疑問・メモの `note` は罫を外し、種別のラベルの字を種類の色に
   して見分けを残す（13.1 原則5 の「文字と対で」は保たれる。灰の縦罫の引用との見分けは地の染めが担う）。図のエラー（異常）と引用（灰）の罫は残す。**10-17 の判断7（note の地の段差、案 C）の見直しの材料**で、決める前に同じ場面で
   「いま／絞る」の2案を並べて目視する。〔描画〕**正典の変更**（13.2 の `note` の段落）
2. **テンプレの手がかりを、描いた DOM で数える。** Krebs の決まった規則の検査 [44]（headless で計算済みスタイルを読む）を、`capture-view` の疑似
   セッションの場面に当て、左の色罫の数・数の札の列・番号の列・絵文字・段落あたりの太字を数える。差し戻しにはせず、意匠を変えたときの前後で比べる
   （10-17 の原則5「縛る前に測る」）。〔仕組み〕
3. **`path:line` の抜き書きを、押す前に見せる。** 重ねるかフォーカスしたとき、その行の前後3行をサーバが読んで出す（`image` の棚と同じく、描いた
   時点で読みメモリに持つ）。主張は本文に残し、抜き書きは照らし合わせ用にする（`agent-report-ui-patterns.md` 2 章の effective-html の条「ツールチップに事実を持たせない」と両立）。
   NotebookLM の「重ねると原文、押すと位置へ」[19] の形。〔描画〕〔仕組み〕
4. **URL の出典は文の直後のドメインの札にする。** 規約で外部の出典を `[ドメイン](URL)` の形で書かせ、描画はリンクの字がドメインと同じものを等幅
   12px の札にする（字の下限 12px を守る。Perplexity の 10px は採らない）。本文の文字列は変えないので見せ方の側。調べもののレポートに効く。〔規約〕〔描画〕
5. **選んだ字を入力欄へ引く口。** レポートの字を選ぶと小さな「引いて聞く」が出て、入力欄の頭に `> 選んだ字` を入れる。読んで分からなかった箇所を
   指して聞くのが1手になる。〔描画〕
6. **数が2つ以下なら結論の文に入れる。** 10-17 の条6 に「`stats` は数が3つ以上で、前後か推移を見せるときだけ」を足す。報告の製品の本文は数を
   文と表で言い、札の横並びは dashboard 型の面に限られる（7.1）。〔規約〕
7. **仕切りを動かした回数と比率を記録する。** 広げる口は 13.13 で却下済みなので足さない。先例は読む面に 800px 前後を与えるので、利用者が最終
   レポートを読むときに仕切りを動かすかを数え、既定の比率を見直す材料にする（比率と回数だけを残し、本文は持たない）。〔仕組み〕
8. **畳んだやり取りの列に見出しの点を残す**（優先度は低い）。狭い窓で列を畳むと目次が消えるので、Manus の点の列【実測】のように見出しの数だけの点と
   いまの節の明るい点を残す。〔描画〕

### 7.3 採らないもの

| 案                                                           | 理由                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 画像モデルのインフォグラフィック・スライド                   | 画像の中の字が誤る・直せない [24]。Claude Code も図は SVG/HTML を勧める [7]                    |
| レンダラが要約・インフォグラフィック・別の形式を起こす       | Gemini の Create・Copilot の変換と同じだが、`display.md`「見せ方と再構成の線引き」で再構成の側 |
| 塊の代わりに問いごとに組む画面（generative UI）              | 82.8% は強いが、1分以上かかり誤りがある [17]。塊は欄で検査でき差し戻せるのが tsukumo の強み    |
| 明るい紙の地で報告を描く（Kimi）・本文を serif（Perplexity） | 暗い読む面と `system-ui` は正典（13.2・13.3）。和文の serif の画面の例は今回見つからなかった   |
| 引用の札をすべての文に付ける（ChatGPT の共有の1本）          | 段落が途切れる。tsukumo の出典は柱と `files` に寄せてある                                      |

## 確かめていないこと

- ChatGPT の 2026-02 の全画面ビューア・Gemini の Canvas・NotebookLM・Copilot Researcher・Claude.ai の Research の寸法と暗い面（要ログイン、測っていない）。
  ChatGPT の値は旧い共有ページの描き方で、ビューアとは違うかもしれない
- OpenAI の公式のヘルプとブログは 403 で読めず、ビューアの中身はすべて記事経由【二次】
- Grok と Kimi の引用の形、Google AI Mode の 2026-05 の下見の札の寸法、Claude.ai の引用の札の形
- Google の generative UI の評価で、何が好まれた理由か（見た目・対話・構造のどれか）の内訳。論文の本文の該当節は読んでいない
- Gemini の項目別の数（76.9% など）は 9to5Google の記事の値で、Google のブログの本文には無かった（図にある可能性）
- Krebs の検査を tsukumo の画面に当てたときの点数（7.2 の2 は未実施）。左罫を減らしたときに状態の見分けが遅くならないか
- 測った5面は欧文で、和文の AI の報告面（日本語の製品）は探していない
- Mollick の投稿 [49] と DeepResearch Bench [50] は検索結果の要約で照合し、本文を開いていない

## 出典一覧

（確認日はすべて 2026-10-18）

1. Claude, Research の告知（2025-04-15）https://claude.com/blog/research
2. Claude Help Center, "Use Research on Claude" https://support.claude.com/en/articles/11088861-use-research-on-claude ／ 表示の形は fast.io のガイド（2026-06-28）【二次】https://www.fast.io/resources/claude-deep-research-guide.md
3. Anthropic Engineering, "How we built our multi-agent research system"（2025-06-13）https://www.anthropic.com/engineering/multi-agent-research-system
4. Claude, "Claude now creates interactive charts, diagrams and visualizations"（2026-03-12）https://claude.com/resources/articles/claude-builds-visuals ／ HTML/SVG は AlternativeTo の記事【二次】https://alternativeto.net/news/2026/3/anthropic-s-claude-can-now-respond-with-interactive-visuals-such-as-charts-and-diagrams
5. Claude Help Center, Release notes https://support.claude.com/en/articles/12138966-release-notes
6. Claude, "Cowork is now Claude"（Docs・Slides・Design, 2026-09-16。2026-10-08 に全プランへ）https://claude.com/blog/cowork-is-now-claude
7. Claude Code Docs, "Share session output as artifacts"（公式の見本画 `artifacts-viewer.png` を含む）https://code.claude.com/docs/en/artifacts
8. MacRumors, "ChatGPT's Deep Research Mode Gets a Fullscreen Document Viewer"（2026-02-11）【二次】https://www.macrumors.com/2026/02/11/chatgpt-deep-research-mode-document-viewer/
9. Kingy AI, "OpenAI transforms deep research with new viewer and GPT-5.2 integration"（2026-02）【二次】https://kingy.ai/news/openai-transforms-deep-research-with-new-viewer-and-gpt-5-2-integration/
10. ChatGPT の共有ページ（deep research の1本。[11] のフォーラムで公開されたもの）【実測】https://chatgpt.com/share/67e3cc02-3c1c-8013-a215-040bed317c90
11. DEVONthink Community, "Specific example of a Gemini Pro 2.5 'Deep Research' report"（2025）【二次】https://discourse.devontechnologies.com/t/specific-example-of-a-gemini-pro-2-5-deep-research-report/83028
12. Gemini Apps Help, "Use Deep Research in Gemini Apps" https://support.google.com/gemini/answer/15719111
13. Gemini Apps Help, "Create docs, apps & more with Canvas" https://support.google.com/gemini/answer/16047321
14. Google, "Gemini Deep Research visual reports"（2025-12-15）https://blog.google/products-and-platforms/products/gemini/visual-reports/
15. Google, "Deep Research is now available on Gemini 2.5 Pro Experimental"（Dave Citron, 2025-04-08）https://blog.google/products-and-platforms/products/gemini/deep-research-gemini-2-5-pro-experimental/
16. 9to5Google, Gemini 2.5 Pro の Deep Research（2025-04-08。項目別の数）【二次】https://9to5google.com/2025/04/08/gemini-2-5-pro-deep-research/
17. Google Research, "Generative UI: A rich, custom, visual interactive user experience for any prompt"（Leviathan ほか, 2025-11-18）https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/
18. Leviathan ほか, "Generative UI: LLMs are Effective UI Generators"（arXiv 2604.09577。Elo と 82.8%・90.5%）https://arxiv.org/html/2604.09577
19. NotebookLM Help, "Use chat in NotebookLM"（引用に重ねる・押す）https://support.google.com/notebooklm/answer/16179559
20. Google Workspace Updates, "New ways to customize and interact with your content in NotebookLM"（2026-03-20）https://workspaceupdates.googleblog.com/2026/03/new-ways-to-customize-and-interact-with-your-content-in-NotebookLM.html
21. Google Workspace Updates, Data Tables in NotebookLM（2025-12-23。題と日付だけ確認）https://workspaceupdates.googleblog.com/2025/12/transform-sources-structured-data-tables-notebooklm.html
22. Google, "8 ways to make the most out of Slide Decks in NotebookLM"（2025-12-16）https://blog.google/technology/google-labs/8-ways-to-make-the-most-out-of-slide-decks-in-notebooklm/
23. Google, "NotebookLM is now Gemini Notebook"（2026-07-16）https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/
24. eesel AI, "The NotebookLM slide deck feature: powerful, but far from perfect"（2026-01-06）【二次】https://www.eesel.ai/blog/notebooklm-slide-deck-feature
25. Perplexity, "Perplexity Pages"（2024-05-30）https://www.perplexity.ai/hub/blog/perplexity-pages
26. Perplexity, "Introducing Perplexity Deep Research"（2025-02-14）https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research
27. Perplexity, "Introducing Perplexity Labs"（2025-05）https://www.perplexity.ai/hub/blog/introducing-perplexity-labs
28. AI UX Playground, "Perplexity Output UX"（タブと「Completed N steps」。検索結果の要約で照合）【二次】https://aiuxplayground.com/teardowns/perplexity/output/
29. Perplexity Discover の記事（2026-10-18 の Top の1本「Trump waives Graham Act tariffs on Russia amid diesel row」）【実測】https://www.perplexity.ai/discover
30. Manus Docs, "Data Analysis & Visualization" https://manus.im/docs/features/data-visualization
31. Manus Docs, "Wide Research" https://manus.im/docs/features/wide-research
32. Manus の共有の再生（気候変動の報告。awesome-manus-replay に載ったもの）【実測】https://manus.im/share/WB6qiUBGeXHI9gpu1MlW25
33. Microsoft Support, "Get started with Researcher in Microsoft 365 Copilot" https://support.microsoft.com/en-us/topic/get-started-with-researcher-in-microsoft-365-copilot-e63ab760-f3de-4c47-ae87-dad601b0e9c4
34. Microsoft 365 Message Center RM546246 "Researcher Output Formats"（2026-04 GA。merill の写し）https://mc.merill.net/message/RM546246
35. M365 Copilot Connection, "The Copilot Researcher agent got a serious upgrade in 2026"（2026-09-22）【二次】https://m365copilotconnection.substack.com/p/the-copilot-researcher-agent-got
36. Notion Releases, 2025-05-13（Research Mode）https://www.notion.com/releases/2025-05-13
37. Notion の公開ページ（OpenAI Deep Research の解説）【実測】https://fabulous-nemophila-465.notion.site/OpenAI-Deep-Research-AI-Technical-Specs-Capabilities-and-Impact-19a97725baba801a848ade5f563342e1
38. Moonshot AI, "Kimi-Researcher"（2025-06-20）https://moonshotai.github.io/Kimi-Researcher/
39. Kimi の visual report の公開ページ（Kimi-Researcher の解説）【実測】https://www.kimi.com/preview/1980dc6f-2d71-86a6-8f19-ef56820005d1
40. SCMP, Kimi の agent mode（OK Computer, 2025-09。検索結果の要約で照合）【二次】https://www.scmp.com/tech/tech-trends/article/3326859/moonshot-ais-kimi-assistant-offers-agent-mode-creating-multi-page-websites-slides
41. xAI, Grok 3 の告知（2025-02）https://x.ai/news/grok-3
42. Google, "More ways to connect with the web from Search"（Hema Budaraju, 2026-10-15）https://blog.google/products-and-platforms/products/search/updates-ai-mode-overviews-explore-web/
43. TechWyse, AI Mode のリンクの5つの変更（2026-05。検索結果の要約で照合）【二次】https://www.techwyse.com/news/ai-search/google-ai-overviews-ai-mode-link-updates-subscription-labels-hover-previews
44. Adrian Krebs, "Scoring Show HN submissions for AI design patterns"（2026-04-20、1,590 ページの版）https://adriankrebs.ch/blog/design-slop/ ／ 手がかりの一覧の整理は Developers Digest（2026-10-06 更新）【二次】https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
45. Kosta Canatselis, "Spot the Slop: A UI Designer's Guide to Fixing AI Defaults"（2026-07-23）【二次】https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults/
46. Anthropic, "Improving frontend design through Skills"（2025-11-12）https://claude.com/resources/articles/improving-frontend-design-through-skills
47. Wikipedia, "Wikipedia:Signs of AI writing" https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
48. Benedict Evans, "The Deep Research problem"（2025-02）https://www.ben-evans.com/benedictevans/2025/2/17/the-deep-research-problem
49. Ethan Mollick の X の投稿（2025-02。検索結果の要約で照合）https://x.com/emollick/status/1886786341041500607
50. "DeepResearch Bench: A Comprehensive Benchmark for Deep Research Agents"（arXiv 2506.11763。検索結果の要約で照合）https://arxiv.org/abs/2506.11763
51. OpenAI Developer Community, "More 'Ask ChatGPT' tooltips for browser-based ChatGPT to improve UX"【二次】https://community.openai.com/t/more-ask-chatgpt-tooltips-for-broswer-based-chatgpt-to-improve-ux/1380953
52. Jason Spielman, "Designing NotebookLM"（Notion の写し。検索結果の要約で照合）【二次】https://laurengolem.notion.site/Jason-Spielman-Designing-NotebookLM-2fbe20465528811480b9ccb37d430ebd
53. tsukumo のいまの値: `src/browser/styles/theme.css`、`src/browser/components/page/conversation/components/markdown/renderer/report-notation.module.css`、`docs/architecture/screen-design.md` 13.2・13.3・13.13、`docs/architecture/display.md`「見せ方と再構成の線引き」「各表示物」（2026-10-18 の作業ツリー）。使われ方の数は `report-excellence-strategy.md` 1.1・1.2
