# AI エージェント・開発ツールが「作業の成果」を人に見せる UI の作法（2026-10-02）

**この文書は調査の記録であって正典ではない。** 正典は `docs/architecture/display.md` 4.2（レポートの記法と
各表示物）と `src/server/session-driver/adapter/sdk-tool.ts`（`report` の引数の形）で、採用が決まるまで
コードは1行も変わらない。Web の一次情報源（公式ドキュメント・公式ブログ・デザインシステムの原典・
リポジトリ）まで遡れた主張には **◎**、二次情報（レビュー記事・フォーラム・検索結果の要約）しか
無かった主張には **△** を付ける。URL は末尾「出典一覧」の番号 `[n]` で引く。

**要点（10行以内）**

1. 製品が「最初に見せるもの」は結論の文ではなく **数の帯**。Claude Code は `+42 -18`（セッション全体の追加/削除行）、Warp は右下のチップに「変更ファイル数と追加/削除行」、Jules は完了時に「触ったファイル・総所要時間・追加/変更/削除行・ブランチ作成」の定型サマリ ◎
2. 検証結果は **失敗を先頭に、成功は畳む**。GitHub の新しい merge box は「checks を状態でグループ化し、失敗を一覧の先頭に」、Actions のログは「失敗した step だけ自動で展開」 ◎
3. 状態の記号は **アイコン＋文字**（Primer・Atlassian とも「色だけで伝えない」）。Vercel Geist の Status Dot は「進行中だけ動く」「所要時間は別部品で添える」「`Status: Ready` のような冗長な文で包まない」 ◎
4. 差分は GitHub・GitLab とも unified/split 切替・ファイルツリー・「Viewed で畳む」・生成ファイルは既定で畳む・1ファイル 400 行/20KB だけ自動で読む。Difftastic は2列表示が既定で大きすぎれば行単位へ退避、delta は語単位のハイライト ◎
5. effective-html の条: 「読者の判断を軸に、冒頭で『何か・なぜ重要か・どこを見るか』」「報告は観察・解釈・推奨・不確実を分ける」「比較は同じ属性を揃える」「ツールチップに事実を持たせない」「状態の色は一般のパレットと分ける」「横に広いものは収めた領域の中でスクロール」 ◎
6. 引用は **本文の `[n]` ＋ 末尾の出典**（Perplexity）か、**引用した原文＋位置**（Claude API の citations は `cited_text` と文字/ページ/ブロックの位置）。Codex の「ターミナルログと試験結果の引用」は openai.com が 403 で二次情報のみ △
7. 「次の一手」は全製品が **1つのボタン**に集約（Create PR / Create branch / Review changes / Rollback）。Primer の Blankslate も「primary action は1つ」 ◎
8. Mermaid は公式が ELK を「大きく込み入った図で重なりが少ない」と位置づけ、tiny ビルドは ELK を含まない。手描き風 `look: handDrawn` あり。Excalidraw への変換は flowchart だけ ◎
9. 一次資料で **見つからなかった**もの: Notion AI の引用の表示（公式ヘルプに記述なし）、Linear の状態アイコンの形（公式ドキュメントは並び順だけ）、GitHub のコードブロックのコピーボタン・折り返し・画像ライトボックスの公式告知、Codex の引用の仕様

---

## 1. 現行のエージェント製品がターンの成果をどう描いているか

| 製品                          | 最初に見せるもの                                                                                      | 変更したファイル一覧                                                    | 検証結果                                                                                                                    | 長い内容の畳み方                                                                               | diff                                                                                             | 次にやること                                                                                 | 出典                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------- |
| Claude Code（Desktop / Web）◎ | 差分指標 `+12 -1` / `+42 -18`（セッション全体の追加/削除行）                                          | 指標をクリックすると **左にファイル一覧・右に差分**                     | PR 作成後は CI status bar に Auto-fix / Auto-merge。Desktop は `autoVerify` で編集のたびにスクリーンショットと確認          | 表示モード Normal は「Tool calls collapsed into summaries, with full text responses」          | 行をクリックしてコメント。コメントは次の送信に束ねられ `at src/auth.ts:47, …` の形でモデルへ届く | 差分ビュー上部の **Create PR**（通常 / draft / 生成した題と本文つきで GitHub の compose へ） | [1] [2] [3]         |
| Claude の Artifacts ◎         | 会話の横の side panel                                                                                 | —                                                                       | —                                                                                                                           | 出す条件: 「15 行超で自立し、会話の外で編集・再利用しそうなもの」                              | —                                                                                                | 公開・共有                                                                                   | [4]                 |
| Cursor ◎/△                    | 「The diff view shows changes as they happen」。チャットの時系列に **checkpoint**                     | △ フォーラム: 下部の Review バーに Keep All / Reject All とファイル送り | **Review → Find Issues** で「proposed edits を行ごとに」検査                                                                | —                                                                                              | 公式は Source Control の Agent Review（main との比較）。語単位ハイライトは要望として未実装（△）  | **Restore Checkpoint**（ファイルだけ戻し、会話は残す）                                       | [5] [6] [7]         |
| OpenAI Codex（cloud）◎/△      | 「Review the changes and test results, request follow-ups, and commit or open a pull request」        | 「Inspect changed files and check results」                             | △ 「citations of terminal logs and test outputs」は二次情報のみ（openai.com は 403）                                        | △ 側パネルに Git summary と Sources 節（二次情報）                                             | CLI は `codex cloud diff` で適用前に差分を見る ◎                                                 | commit / open a PR                                                                           | [8] [9] [10]        |
| Devin ◎                       | 開始数秒で「relevant files, findings, and an initial plan」。信頼度 🟢🟡🔴 を出し、緑以外は承認を待つ | Progress tab に「shell・編集・ブラウザ」を **1本の時系列**で            | Follow Devin tab に各アクションと「なぜそうしたか」と、その後に残るエディタ診断                                             | 「Detailed View」はアクションを **plan の step ごと**にまとめる                                | 埋め込み IDE の diff                                                                             | Session UI は **Task・Plan・PR・Summary** の4つの決定点を強調（2025-06-26）                  | [11] [12]           |
| GitHub Copilot coding agent ◎ | 着手直後に **draft PR** を開く。timeline に「Copilot started work」                                   | PR の Files changed                                                     | PR 本文に「summary of changes」。session log に reasoning と使ったツール、token と所要。各 commit に session log へのリンク | PR の title と body を **作業のたびに更新**（2025-07-30）。PR テンプレートに従う（2025-11-05） | GitHub の diff                                                                                   | 終わると自分を reviewer に追加して通知                                                       | [13] [14] [15] [16] |
| Google Jules ◎                | plan を承認してから着手。activity feed に step ごとの進み                                             | ファイルごとの **mini diff** と、各変更の **inline explanation**        | （公式に記述なし）                                                                                                          | diff editor は 2025-09-04 から **stacked（縦並び）が既定**、タブ式へ戻せる                     | mini diff → diff editor の2段                                                                    | 完了サマリ: **files modified・total runtime・lines added/changed/removed・Create branch**    | [17] [18]           |
| Replit Agent ◎                | checkpoint ごとの **AI 生成の説明**と触ったファイル・機能                                             | checkpoint の「Changes」                                                | checkpoint preview でその時点の見た目を確かめる                                                                             | Agent パネルの History に時系列                                                                | —                                                                                                | **Rollback to here**。checkpoint ごとのコストも出す                                          | [19]                |
| Warp ◎                        | 会話の末尾に **Review changes** ボタン。右下の toolbelt chip に「ファイル数と追加/削除行」            | Code Review panel の左にファイル一覧                                    | —                                                                                                                           | Block = 「コマンドと出力を1つの原子的な単位」にし、コマンドと出力を別々にコピー                | gutter から hunk ごとに revert、行コメントを動いているエージェントへ送る                         | Discard all / 行コメントの一括送信                                                           | [20] [21]           |

引用・出典の見せ方（製品の外から）: Perplexity は本文に `[1]`, `[2]` の番号を置き、`search_results` の
`id` で出典（title・url・snippet・date）へ対応づけ、表示側で「`[N]` を Markdown リンクに置き換え末尾に
references 節を付ける」 ◎ [22]。Claude API の citations は本文の text block に**引用した原文 `cited_text`
と位置（文字範囲・ページ・ブロック）**を付け、文の単位に区切って引く ◎ [23]。Notion AI は公式ヘルプに
引用の表示の記述が見つからなかった（二次情報は「出典ページへのリンク付き」とだけ言う）△ [24]。

## 2. 「HTML の理不尽なまでの有効性」と effective-html

**Thariq Shihipar の20例** ◎ [25]: 分類は Exploration & Planning 3・Code Review 3・Design 2・Prototyping 2・
Diagrams 2・Decks 1・Research 2・Reports 2・Custom Editors 3。tsukumo に近い例の中身:

- Code Review: 「Diffs and call-graphs are spatial information; markdown flattens them」。annotated PR は
  「margin notes, severity tags and jump links」付きの diff。PR writeup は「motivation, before/after, a
  file-by-file tour with the why, and where to focus the review」の順
- Reports: weekly status は「What shipped, what slipped, and a small chart」。incident は「minute-by-minute
  timeline, log excerpts and the follow-up checklist」
- Research: 「TL;DR box, collapsible request-path steps, tabbed config snippets, and an FAQ」
- Custom Editors: 「always end with an export button」（UI でやったことを貼れる形に戻す）

**plannotator/effective-html** ◎ [26] [27] [28]（原文を raw で取得）。tsukumo の塊に移せる条:

| 条（原文の要約）                                                                          | 元ファイル                     |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| 「読者の判断か理解を軸に設計し、冒頭で **何か・なぜ重要か・どこに注意か** を示す」        | documents-and-presentations.md |
| 「報告は **観察・解釈・推奨・不確実** を区別する」                                        | 同上                           |
| 「比較は **同じ属性を揃えて**、目が覚えずに比べられるように」                             | 同上                           |
| 「見出し・番号・区切り・callout は、本当に階層か順序を表すときだけ」                      | 同上                           |
| 「散文の行長は読める幅に、表・timeline・code・図は広い領域に」                            | 同上                           |
| 「運用文書は workmanlike な調子。巨大な hero や飾りのダッシュボード家具は要らない」       | 同上                           |
| 「見る人が要る**比較から**グラフを選ぶ: 時間変化→線、順位→並べた棒か表、構成→積み棒」     | charts-and-data.md             |
| 「**正確な値が形より大事なら表**。グラフと小さな表は共存してよい」                        | 同上                           |
| 「単位・期間・出典・フィルタを書く。測定値・推定・目標・予測を見た目と文で分ける」        | 同上                           |
| 「**データを捏造しない**。欠けている値・例示の値ははっきり印を付ける」                    | 同上                           |
| 「**状態の色は一般のパレットと別に**扱う。色に頼らず区別できる色分け」                    | 同上                           |
| 「**ツールチップは精度を足すもの**で、事実を運ばない。結論と要の値は hover なしで見える」 | 同上                           |
| 「アニメーションは状態の変化の説明にだけ。棒や線を登場時に踊らせない」                    | 同上                           |
| 「ページ本体に**意図しない横スクロールを作らない**。広いものは収めたスクロール領域に」    | SKILL.md                       |
| 「本物の中身を使う。placeholder・飾りの統計・何もしない操作子で目立つ場所を埋めない」     | SKILL.md                       |

## 3. 検証結果・CI 結果の UI

- **GitHub Checks API** ◎ [29]: `status` は queued / in_progress / completed / waiting / requested / pending、
  `conclusion` は success / failure / neutral / cancelled / skipped / timed_out / action_required。`output` は
  title・summary（Markdown）・text（Markdown）・annotations（1回 50 件まで、level は notice / warning / failure、
  message 64KB・title 255 字）。Actions は step ごとに警告 10・エラー 10 の annotation まで
- **状態の見え方** ◎ [30]: commit の横に pending / passing / failing。「skipped な job は Success として報告」。
  Checks タブは「どの検証が走り、なぜ通った/落ちたか」を見せる。checks のデータは 400 日で archive
- **merge box（2024-12-03 の刷新）** ◎ [31]: 「checks are now grouped by status with failing checks prioritized
  at the top of the list」、同じ状態の中はアルファベット順。1 review required・checks の一覧・conflict なしの
  3 段で1枚
- **Actions のログと job summary** ◎ [32] [33]: 「Any failed steps are automatically expanded to display the
  results」、検索は展開した step だけが対象。job summary は GFM、step ごと 1MiB、job ごと 20 個まで、複数 job
  は完了時刻順、step 間で隔離（壊れた Markdown が他の step を壊さない）
- **Buildkite annotations** ◎ [34] [35]: build ページの Annotations タブ（最上部）に出す。style は default /
  info / warning / error / success、本文は 1MiB の Markdown、priority 10 が先頭で 1 が末尾。用途は「job の結果の
  要約」「並列 job に散った test failure の要約」「artifact へのリンク」。Test Engine の run は pending →
  passed / failed で、「失敗した test が 1 つでもあれば failed」 ◎ [36]
- **CircleCI Test Insights** ◎ [37]: 「Most failed tests」（成功率の低い 100 件）と「Slowest tests」（長い
  100 件）。列は Test name・Associated job・Run time・Success rate。不安定な test は app 全体で `FLAKY` の札
- **Vercel Geist Status Dot** ◎ [38]: 状態は QUEUED / BUILDING / READY / ERROR / CANCELED / DELETED。「dot は
  BUILDING と QUEUED のあいだだけ動き、終端の状態で止まる」「別の spinner を足さない」「時間が要るなら
  RelativeTimeCard と組む（`Building · 12s ago`）。dot だけでは所要が伝わらない」「`Status: Ready` のような
  余計な文で包まない」
- **Linear** ◎/△ [39]: 状態のカテゴリは固定順 Backlog > Todo > In Progress > Done > Canceled（Triage・Duplicate
  は別枠）。アイコンの形（破線の円・空の円・半分塗り・チェック付き）は公式ドキュメントに記述が無く △
- **Atlassian Lozenge** ◎ [40] [41]: neutral（draft）/ success（completed, approved, added）/ warning（pending,
  needs review, at risk）/ danger（error, failed, blocked）/ information（in progress, reviewing, open）/
  discovery（new, beta）。「色だけで重要な属性を示さない。明確なラベルと、必要なら補助のアイコンを」。文頭だけ
  大文字、幅 200px で省略
- **GitHub Primer** ◎ [42]〜[48]:
  - 色の役割: accent（リンク・選択・focus）、success、attention（「warning と、queued な PR や進行中の test の
    ような**動いている処理**」）、danger、open / closed / done（PR と workflow の状態）。muted と emphasis の2段
  - 「状態は色の変化だけでなく示す」。機能アイコンのコントラストは 3:1
  - Banner: info＝青い丸の i、success＝緑の丸のチェック、warning＝濃い黄の三角の !、critical＝赤の stop の !。
    「控えめに使う」「同時に複数出さない」「見出しの書体や複数の文字サイズを使わない」
  - StateLabel: issue と PR の Draft / Open / Closed / Merged / Not planned に、状態ごとのアイコンを必ず添える
  - Blankslate の順: graphic → primary text → secondary text → **primary action 1つ** → secondary action（文リンク）。
    エラーのときは遊びの絵でなく alert のアイコン、文は「必須の欄が空で送れませんでした」のように具体的に
  - DataTable: 数値列は右寄せ（`align: 'end'`）、「1 列は既定で sort 済みに」、広い表は容れ物の中で横スクロール、
    密度は condensed / normal / spacious

## 4. 差分（前後）の見せ方

- **GitHub の Files changed** ◎ [49] [50]: unified / split の切替、空白差分の非表示（PR ごとに記憶）、ファイル
  ツリーと絞り込み、「Viewed にするとそのファイルが畳まれ、後で変わると外れる」、manifest・lock・画像は rich
  diff。限界は「diff 全体 20,000 行か 1MB、1 ファイル 20,000 行か 500KB、**自動で読むのは 400 行と 20KB**、
  300 ファイル、描画できるファイル 25 個」
- **GitLab の Changes** ◎ [51]: inline は「1 行の変更に向く」、side-by-side は「連続した多数の行の変更に向く」。
  ファイルブラウザは tree と list、1 ファイルずつのモードは j / k で送る。**既定で畳むのは生成物**（lock・
  `node_modules`・minified・source map・生成 Go・`.nib` など。`.gitattributes` の `gitlab-generated` で指定）。
  大きな変更は「Some changes are not shown」と畳み Expand file で開く
- **Difftastic** ◎ [52] [53] [54]: tree-sitter で構文単位に比べ、「**既定は2列表示**」、グラフが大きすぎるか
  parse error が `DFT_PARSE_ERROR_LIMIT` を超えると「従来の行単位の diff に退避」。弱点は文字列リテラル（1 つの
  atom だが「利用者はときどき語単位の diff を欲しがる」）。「GitHub や git の `--word-diff` も語の変化は強調
  するが、コードを理解してはいない」
- **delta** ◎ [55]: 「Levenshtein の編集推定による**語単位のハイライト**」、折り返し付きの side-by-side、
  `n` / `N` でファイル間を移動、ファイルパスを開けるハイパーリンクに
- **数値の前後** ◎ [56] [57] [58]: Datadog の Change widget は「1 時間 / 1 日 / 1 週 / 1 月前」と比べ、**絶対差か
  相対差（%）**を選び、`increase_good` で**増加が良いか**を宣言して色を決め、現在値を併記（`show_present`）、
  並びは change / name / present / past で選ぶ。Query Value は数値の背後に小さな時系列（min-to-max / line /
  bars）を敷き、閾値で色を変え、前期間との比較を Relative / Absolute / Both / Off で出す。Stripe の Checkout
  analytics は「前の期間と比較」で**同じ長さの前期間を日次チャートに重ねる**（直近 30 日なら前の 30 日）。
  Linear の changelog に「数値の前後」の定型は見つからなかった

## 5. 読む人の負担を減らす仕掛けの先例

- **目次**: GitHub は README の見出しから目次を自動生成し、ヘッダの「Outline」アイコンから開く。見出しに hover
  すると anchor が出る ◎ [59]
- **折りたたみの既定**: `<details>` の `open` は boolean（`open="false"` でも開く）。同じ `name` を与えると
  **排他的なアコーディオン**（一度に 1 つだけ開く）が script なしで作れ、`toggle` イベントで状態を拾える ◎ [60]。
  「何を既定で開くか」の先例は、Actions「失敗した step だけ」[32]、GitHub「1 ファイル 400 行まで」[50]、
  GitLab「生成物は畳む」[51]、Claude Code「ツール呼び出しは要約に畳み、本文は全文」[1]、Devin「plan の step ごと
  にまとめる」[12]
- **コードブロックのコピーと折り返し**: GitLab は 2021-12 の MR で「すべての Markdown コードブロックに copy
  ボタン」を足した ◎ [61]。Warp はコマンドと出力を**別々に**コピーできる ◎ [21]。GitHub の copy ボタン・折り
  返し・画像のライトボックスの公式告知は見つからなかった
- **長い表**: Primer DataTable は容れ物の中で横スクロール [48]。effective-html は「ラベルを潰して読めなくする
  より、横のあふれを**収めた領域の中に**」[27] [28]。列の省略を推す一次資料は見つからなかった
- **Mermaid の弱点と代替** ◎ [62] [63] [64]: 公式ドキュメント（取得 2026-10-02）は layout と look を flowchart /
  state / class / ER / requirement / use case / agentflow で選べるとし、ELK を「大きく込み入った図で**より洗練
  された配置、重なりが少ない**」と位置づける。**tiny ビルドは ELK を含まず dagre に退避**。look は neo（対応図
  の既定）/ handDrawn / classic。D2 は dagre（DOT 由来。「container から子への辺は引けない」）・ELK（成熟、
  container の幅と高さに対応）・TALA（アーキテクチャ図向け、位置固定）の 3 エンジン。mermaid-to-excalidraw は
  「**flowchart だけ**」を変換し、他の図は画像として置く

## tsukumo に効く示唆

いまの塊: `conclusion` / `checks`（ok・ng・unverified） / sections の中の text・list・table・matrix・compare・
dimension・note・stats・code・mermaid・chart・progress・options・image・files / `favor`。

**順序を変える**

1. **結論の直下に「数の帯」を1行で自動生成する**（モデルには書かせない）。中身は `files` の件数と追加/削除行、
   `checks` の ok / ng / unverified の数、ターンの所要時間。根拠は Claude Code の `+42 -18` [1]、Warp の
   チップ [20]、Jules の完了サマリ [17]、Geist の「所要は時刻の部品で添える」[38]。行数は `files` のパスから
   サーバが `git diff --numstat` で数えれば、モデルの引数を増やさずに済む
2. **`checks` は ng → unverified → ok の順に並べ替え、ok は件数だけ見せて畳む**。GitHub の merge box [31] と
   Actions のログ [32] がこの順を明文化している。1 件でも ng があれば帯の色を danger に（Buildkite の run の
   規則 [36]）
3. **「次の一手」は末尾に 1 つ**。全製品が primary action を 1 つに絞り [1] [17] [19] [20]、Primer の Blankslate も
   同じ [46]。`favor`（お願い）はすでに末尾の 1 つなのでよい。`options` の「採る」が 2 つ以上あるレポートは
   検査で差し戻す候補

**描き方を変える**

4. **状態は必ずアイコン＋文字、色は success / danger / attention の 3 役に限り、チャートのパレットと分ける**
   [27] [41] [43]。`checks` の label に「成功しました」のような状態の言い直しが入っていたら整形で落とす
   （Geist「`Status: Ready` で包まない」[38]）。unverified は Primer の attention（「進行中・未確定」の役）[42]
5. **`stats` に「前の値」と「増えると良いか」を持たせる**。Datadog の Change widget の形（絶対差・相対差・
   `increase_good`・現在値の併記）[56] をそのまま塊の属性にすれば、色の判断を描画側に閉じ込められる。数値は
   右寄せ、単位と期間を必須にする [48] [28]
6. **`files` はファイルごとに `+n −m` を添え、lock・生成物・`node_modules` 配下は既定で畳む**（GitLab の既定
   [51]）。1 つのコードブロックは 400 行で切って「続きを読む」にする（GitHub の自動ロードの上限 [50]）
7. **`compare` に「前後の差分」の描き方を足すか、`diff` の塊を新設する**。小さな変更は inline（unified）、連続
   した多行は side-by-side（GitLab の使い分け [51]）、変更行の中は語単位でハイライト（delta [55]。Cursor では
   要望止まり [7]）。2 列表示はメインビューの幅（画面の 65%）で足りるかを目視で確かめる
8. **`chart` と `matrix` は hover に事実を置かない**。要の値と結論は常時見える文字で出し、ツールチップは精度を
   足すだけにする [28]。登場時のアニメーションは付けない [28]
9. **`mermaid` は ELK を既定にし、tiny ビルドでないことを組み立てで確かめる**。`look: handDrawn` はキャラクターの
   世界観と合うが、読む速さが先なので既定にはしない [62]。D2 への乗り換えは外部コマンド依存で承認が要り、
   Excalidraw 変換は flowchart 限定で代替にならない [63] [64]

**塊を足す**

10. **`checks` の各行に「根拠」を持たせる**: 走らせたコマンドと出力の抜粋、またはファイル:行。Devin の「各
    アクションの why と診断」[12]、Copilot の「commit → session log のリンク」[14]、Claude API の citations の
    「引用した原文＋位置」[23] がこの形。Codex の「ログの引用」は二次情報でしか確認できなかったが、方向は同じ
11. **`note` に区分を持たせる**: 観察 / 解釈 / 推奨 / 不確実（effective-html の報告の条 [26]）。いまの `note` が
    1 種類なら、まず「不確実」だけを別の見た目にするのが小さい一歩
12. **引用番号 `[n]` は足さない**。Perplexity の形 [22] は Web 検索の答えには合うが、tsukumo のレポートの根拠は
    コマンドの出力とファイルなので、10 の「根拠」の欄で足りる

**採らないもの**: Artifacts の side panel（メインビューがすでにその役）[4]、Viewed のチェック（読者は 1 人で、
レビューの進み具合を共有しない）[49]、Jules の stacked diff（複数ファイルの差分を全部描くと 65% の高さでは
スクロールが長くなる。ファイル一覧から 1 つずつ開くほうが tsukumo の「分かるまでの時間」に合う）[18]。

## 出典一覧

◎ 一次情報源（公式ドキュメント・公式ブログ・デザインシステム・リポジトリ）、△ 二次情報。取得日はすべて 2026-10-02。

1. ◎ Claude Code Docs「Desktop application」 <https://code.claude.com/docs/en/desktop>
2. ◎ Claude Code Docs「Use Claude Code in the cloud」 <https://code.claude.com/docs/en/claude-code-on-the-web>
3. ◎ Claude Code Docs「Get started with Claude Code in the cloud」（Review and iterate） <https://code.claude.com/docs/en/web-quickstart>
4. ◎ Claude Help Center「What are Artifacts and how do I use them?」 <https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them>
5. ◎ Cursor Docs「Reviewing and Testing Code」 <https://cursor.com/docs/agent/review>
6. ◎ Cursor Docs「Agent overview」（checkpoints） <https://cursor.com/docs/agent/overview>
7. △ Cursor Community Forum「Agent diff review: show character-level changes」ほか Review バーの報告 <https://forum.cursor.com/t/agent-diff-review-show-character-level-word-level-changes-not-just-changed-lines/155776>
8. ◎ OpenAI「Codex cloud」 <https://learn.chatgpt.com/docs/cloud>（developers.openai.com/codex/cloud からの転送先）
9. ◎ OpenAI「Developer commands」（`codex cloud diff`） <https://developers.openai.com/codex/cli/reference>
10. △ OpenAI「Introducing Codex」 <https://openai.com/index/introducing-codex/>（HTTP 403 で本文を確認できず、引用の記述は検索結果の要約のみ）
11. ◎ Devin Docs「Devin Session Tools」 <https://docs.devin.ai/work-with-devin/devin-session-tools>
12. ◎ Devin Docs「Release notes 2025」 <https://docs.devin.ai/release-notes/2025>
13. ◎ GitHub Docs「Using Copilot cloud agent on GitHub」 <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github>
14. ◎ GitHub Docs「Tracking GitHub Copilot's sessions」 <https://docs.github.com/en/copilot/using-github-copilot/coding-agent/using-the-copilot-coding-agent-logs>
15. ◎ GitHub Changelog「Copilot coding agent keeps pull request titles and bodies up to date」 <https://github.blog/changelog/2025-07-30-copilot-coding-agent-keeps-pull-request-titles-and-bodies-up-to-date/>
16. ◎ GitHub Changelog「Copilot coding agent now supports pull request templates」 <https://github.blog/changelog/2025-11-05-copilot-coding-agent-now-supports-pull-request-templates/>
17. ◎ Jules Docs「Running Tasks with Jules」 <https://jules.google/docs/running-tasks/>
18. ◎ Jules Changelog「Stacked Diff」 <https://jules.google/docs/changelog/2025-09-04/>
19. ◎ Replit Docs「Checkpoints and Rollbacks」 <https://docs.replit.com/core-concepts/agent/checkpoints-and-rollbacks>
20. ◎ Warp Docs「Code Review panel」 <https://docs.warp.dev/code/code-review/>
21. ◎ Warp Docs「Blocks」 <https://docs.warp.dev/terminal/blocks>
22. ◎ Perplexity Docs「Streaming Citation Parsing」 <https://docs.perplexity.ai/docs/cookbook/articles/streaming-citations/README>（Help Center の記事は HTTP 403）
23. ◎ Claude Platform Docs「Citations」 <https://platform.claude.com/docs/en/build-with-claude/citations>
24. △ Notion Help「Notion AI FAQs」 <https://www.notion.com/help/notion-ai-faqs>（引用の表示の記述なし。二次情報のみ）
25. ◎ Thariq Shihipar「The unreasonable effectiveness of HTML — examples」 <https://thariqs.github.io/html-effectiveness>
26. ◎ plannotator/effective-html `skills/html/references/documents-and-presentations.md` <https://github.com/plannotator/effective-html/blob/main/skills/html/references/documents-and-presentations.md>
27. ◎ plannotator/effective-html `skills/html/references/charts-and-data.md` <https://github.com/plannotator/effective-html/blob/main/skills/html/references/charts-and-data.md>
28. ◎ plannotator/effective-html `skills/html/SKILL.md` <https://github.com/plannotator/effective-html/blob/main/skills/html/SKILL.md>
29. ◎ GitHub Docs「REST API endpoints for check runs」 <https://docs.github.com/en/rest/checks/runs>
30. ◎ GitHub Docs「About status checks」 <https://docs.github.com/articles/about-status-checks>
31. ◎ GitHub Changelog「Improved pull request merge experience now in public preview」 <https://github.blog/changelog/2024-12-03-improved-pull-request-merge-experience-now-in-public-preview/>
32. ◎ GitHub Docs「Using workflow run logs」 <https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/using-workflow-run-logs>
33. ◎ GitHub Docs「Workflow commands — Adding a job summary」 <https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary>
34. ◎ Buildkite Docs「Annotations」 <https://buildkite.com/docs/pipelines/configure/annotations>
35. ◎ Buildkite Docs「buildkite-agent annotate」 <https://buildkite.com/docs/agent/v3/cli-annotate>
36. ◎ Buildkite Docs「Test Engine Runs API」 <https://buildkite.com/docs/apis/rest-api/test-engine/runs>
37. ◎ CircleCI Docs「Test Insights」 <https://circleci.com/docs/guides/insights/insights-tests/>
38. ◎ Vercel Geist「Status Dot」 <https://vercel.com/geist/status-dot>
39. ◎ Linear Docs「Issue status」 <https://linear.app/docs/configuring-workflows>（アイコンの形は △ 検索結果の要約のみ）
40. ◎ Atlassian Design System「Lozenge — Usage」 <https://atlassian.design/components/lozenge/usage>
41. ◎ Atlassian Design System「Lozenge — Examples」 <https://atlassian.design/components/lozenge/examples>
42. ◎ Primer「Color usage」 <https://primer.style/product/getting-started/foundations/color-usage/>
43. ◎ Primer「Color considerations」（accessibility） <https://primer.style/accessibility/design-guidance/color-considerations/>
44. ◎ Primer「Banner — Guidelines」 <https://primer.style/product/components/banner/guidelines>
45. ◎ Primer「StateLabel」 <https://primer.style/product/components/state-label/>
46. ◎ Primer「Empty states」（Blankslate） <https://primer.style/product/ui-patterns/empty-states/>
47. ◎ Primer「Label」 <https://primer.style/product/components/label/>
48. ◎ Primer「DataTable」 <https://primer.style/product/components/data-table/>
49. ◎ GitHub Docs「Reviewing proposed changes in a pull request」 <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request>
50. ◎ GitHub Docs「Repository limits — Diff limits」 <https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits>
51. ◎ GitLab Docs「Changes in merge requests」 <https://docs.gitlab.com/user/project/merge_requests/changes/>
52. ◎ Difftastic manual「Introduction」 <https://difftastic.wilfred.me.uk/introduction.html>
53. ◎ Difftastic manual「Tricky cases」 <https://difftastic.wilfred.me.uk/tricky_cases.html>
54. ◎ Wilfred Hughes「Difftastic, the Fantastic Diff」（作者のブログ） <https://www.wilfred.me.uk/blog/2022/09/06/difftastic-the-fantastic-diff/>
55. ◎ dandavison/delta README <https://github.com/dandavison/delta/blob/main/README.md>
56. ◎ Datadog Docs「Change widget」 <https://docs.datadoghq.com/dashboards/widgets/change/>
57. ◎ Datadog Docs「Query Value widget」 <https://docs.datadoghq.com/dashboards/widgets/query_value/>
58. ◎ Stripe Docs「Use Checkout studio to track analytics」 <https://docs.stripe.com/payments/checkout-studio/analytics>
59. ◎ GitHub Docs「About READMEs」（auto-generated table of contents） <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes>
60. ◎ MDN「`<details>`: The Details disclosure element」 <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details>
61. ◎ GitLab MR !75433「Adds copy button to every markdown code block」 <https://gitlab.com/gitlab-org/gitlab/-/merge_requests/75433>
62. ◎ Mermaid Docs「Syntax reference — Layout and look」 <https://mermaid.js.org/intro/syntax-reference.html>
63. ◎ D2 Docs「Layouts」 <https://d2lang.com/tour/layouts/>
64. ◎ Excalidraw Docs「mermaid-to-excalidraw API」 <https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api>
