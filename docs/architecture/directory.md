# アーキテクチャ詳細: ディレクトリ

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: リポジトリのディレクトリの木と、設定・タスク一覧の読み元の置き場、ファイル名の付け方、ページの形を持つ（ディレクトリの節の前半）。
読む時: 新しいファイル・ディレクトリの置き場所や名前に迷ったとき、ページの中の部品をどこに置くか決めるとき。
直す時: ディレクトリの木・ファイル名の規則・ページの形を変えたとき（`src/browser/` の箱の表は `docs/architecture/browser-box.md`）。

## 全体構成

### ディレクトリ

```
src/                          配線（composition root）。cli.ts（入口）・main.ts（起動の段取り）・
                              router.ts（全機能の手続きを束ねる）ほか、起動と接続を進める数ファイル
  wiring/<機能>.ts            セッションの配線を機能ごとに組み立てる（上の「サーバの機能と、機能どうしの辺」）
  types/                      どの層にも属さない ambient 宣言（import されない *.d.ts）だけを置く
  shared/                     契約・イベント・状態・reducer・zod スキーマ（両側が読む語彙）。直下はプロトコルだけ
    <機能>/                   機能の語彙。名前はサーバの機能と同じ（上の「shared の機能」）
    contract/<名前>.ts        手続きの契約（形・断る条件の meta）
  server/
    core/ adapter/            どの機能にも属さない共有の判断・境界
    <機能>/core/ adapter/     機能の判断・境界（上の「サーバの機能と、機能どうしの辺」）
  browser/                    React の部品・hooks・CSS（下の「`src/browser/` の箱と、置く基準」）
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts
fixture/fake-session/         疑似セッション（索引 index.json と、場面1つにつき <場面名>.json。TSUKUMO_FAKE_SESSION の既定）
characters/<name>/            character.json・persona.md・素材
plugin/                       セッションに載せる同梱のプラグイン（`token-usage-diet` だけを持つ。`buildQuerySeedOptions` が渡す。取り込みの図のプラグインは別で、下の行のとおり任意）
vendor/tsukumo-plugins/       取り込んだ tsukumo-plugins（git submodule。契約に型の合うスキルの1つの例。利用者が同じスキルとエージェントを `~/.claude` にリンクで入れていなければ `buildQuerySeedOptions` が渡す。`plugins/tsukumo-figure` は任意で別に判定し、無い版や利用者が `figure-capture` を入れているときは載せない）
```

**設定の置き場は環境変数と歯車の設定の2つ**（`docs/architecture/adr/0025-no-project-settings.md`。リポジトリに属する値の
置き場は無い）。ワークフローの設定（スキルの並び）は tsukumo が持たず、ワークフローの `.tw/config.toml` に置いたまま、
歯車の「ワークフロー」の面が設定コマンド（`tw config --schema`・`tw config set`。`server/workflow-setting/`）を通して見せて書く
（同じ ADR の「2026-10-14 の改訂」）。タスクの節と使い方の見直しの「タスクにする」は、起動先の `.beads` が読めるかだけで出し分ける。
「tsukumo に頼む」の文面は、`browser/features/task-board/domain/task-run-prompt.ts` の `requestPromptOf` が作る。
着手の文面だけは、歯車の「タスクの実行」に利用者が書いたスキル名があれば「/スキル名 ID」になる（同じ ADR の「2026-10-24 の改訂」）。

**タスク一覧の読み元は Beads だけ**（`server/repository/adapter/task-beads-source.ts`。`bd` の課題）。
**課題の解釈は Beads アダプタの1か所に閉じる**（`docs/architecture/adr/0024-no-skill-dependency.md`）。
Beads アダプタ（`server/**/adapter/` の Beads を読むファイル）が、Beads の組み込みの欄だけ（読む欄と読まないものは
`docs/architecture/workflow-contract.md`「Beads の欄」）をタスク一般の形（`TaskSummaryItem`・`DoneTask`。判定済みの `waitingFor` を含む。
`shared/repository/task-summary.ts`）に写す。
一覧・始め方の一覧・成果・おすすめは一般の形だけを読む（成果は `bd` を読んだ境界で `DoneTask` に畳む）。
例外は疑似セッションで、`taskSummaryOptionsOf("fake")` が `bd` の代わりに cwd のファイルを読む口（`fake-beads.ts` の
`readFakeBeadsIssues`）と短い見回りの間隔に差し替える（E2E の足場が課題を置く。課題のファイルがあれば `.beads` があるものとして扱う）。
見張りの `watchTaskSummary` の読み元（`task-beads-source.ts`）は、変化の印を読む呼び出し（`createBeadsStampReader` の `bd where`）で
`.beads` の有無を知り、無ければ `bd list` を打たずに `no-beads` を返す。この印の読み手は成果のキャッシュ
（`closed-issue.ts`）と共有する1つで、`main.ts` が作って配線が両方に渡す（同時の読みは1回に束ねられる）。
成果は Beads の閉じた課題だけで数える（`server/achievement/adapter/closed-issue.ts`。
`.beads` が無ければ成果ごと `unknown`。`docs/requirements.md` 4.11 の「数えられない・読めないとき」）。
前回知らせたものと同じ結果は知らせない。前回の初めは画面の初期値と同じ `loading`（最初の見回りの結果がまだ届いていない）なので、
最初から読めないときも初回に必ず `unknown` か `no-beads` が届く。
起動直後は、前回読めた一覧（`~/.tsukumo/task-summary.json`。作業ディレクトリごと）を
`bd` の結果を待たずに先に知らせ、読んだ結果が違えば差し替える（同じなら知らせない。読めなければ `unknown`）。
知らせた `known` は覚え直す。画面は `loading` ならサイドバーのタスクの節とタスクのモーダルにスケルトン（文字は出さない）、
`unknown` なら「不明」を出し、`no-beads` ならタスクの節ごと出さない
（始め方の一覧の札とおすすめは `loading` も `unknown` と同じ扱いで出さない）。

**ファイル名は概念で、単数形**（原則5）。`helpers/` と `common/` は作らない。**ディレクトリ名に単数形の
縛りは無く**、`src/browser/` の置き場所のディレクトリ（`components/`（とその下の `page/` `domain/` `ui/`）
`features/` `hooks/` `domain/` `lib/` `utils/` `stores/` `styles/` `types/`）は bullet-proof-react の名前を
そのまま採る（`components/` の下の3つは利用者の Next.js の雛形の名前）。機能・領域の名前は用語集の語に、
画面の名前は `stores/location-hash.ts` の `Screen` の値に合わせる。**画面の部品は `components/page/` に置く。**
`features/` には枠・画面に置かれる機能（2つ以上の枠・画面から置かれるもの）だけを置き、ページの部品を置かない。**手本から採るのはディレクトリの形だけ**で、
kebab-case のファイル名・barrel file を作らない・`@/` を使わない相対 import はそのまま（PascalCase・
1部品1フォルダは真似しない）。**例外は `components/ui/` と、ページの `components/` の2つだけ**で、
部品と CSS の対が平たく並ぶと見づらいので部品ごとに `<部品>/<部品>.tsx`・`<部品>.module.css` の
1フォルダへ分ける（例外の中でも `index.tsx` は置かない。`docs/coding-standards/layer-and-dependency.md`「barrel file を作らない」）。
**実体が無い箱は先に作らない**（手本の `app/` `api/` `config/` `assets/` `testing/` などは作らない。
理由は `docs/history/decision.md`「design.md 2. 全体構成 / ディレクトリ（採らなかった bullet-proof-react の要素）」）。
ファイルを移すときは、パスを指す記述が `.module.css` のコメントにもあるので `grep -rn` の対象から外さない。

**ページの形**（`components/page/<ページ>/`）:

```
components/page/<ページ>/
  <ページ>.tsx                   container（入口。components/app/layout.tsx が置く）。名前は Screen の値
  presentational-<ページ>.tsx    presenter（器）
  <ページ>.module.css            container / presenter と、2つ以上の部品が読む CSS（あれば）
  domain/ hooks/                 そのページだけの語彙・フック（container / presenter も読むもの）
  stores/                        そのページだけが読む状態の store（2つ以上の部品が読むもの。ページの直下だけが持てる）
  components/                    そのページの部品。直下はディレクトリだけ
    hooks/                       components/ の下の2つ以上の部品だけが読むフック
    <部品>/                      1部品1ディレクトリ
      <部品>.tsx                 部品（割るなら container）。外から引くのはこのファイルだけ
      presentational-<部品>.tsx  割るときの presenter
      <部品>.module.css          この部品（と中の子部品）だけが読む CSS
      hooks/ domain/             この部品（と中の子部品）だけのフック・語彙
      <子部品>.tsx               この部品だけが使う子部品。部品と同じディレクトリに平らに並べ、CSS は <部品>.module.css に同居
      <概念>/                    下の「機能の中を分ける」の概念のディレクトリ（renderer/・stage/・form/ など）
                                 <部品>.module.css が大きくなったら、規則の本体を概念のディレクトリの *.css に分けて @import する
```

- **ページの直下は、container / presenter の対と `<ページ>.module.css`、`domain/` `hooks/` `stores/` `components/`
  だけ。** 対は**どのページも必ず1対**にする（入口の形が決まっていれば、開く前に中の見当が付き、検査で
  名前を決め打ちできる）。container が state か副作用を持つなら `hooks/use-<ページ>.ts` へ出す。
  **2つ目の画面**（ページの中で並ぶか重なるもの）は直下に置かず `components/<部品>/` の部品にする。
  ファイル名の `-screen` は付けない
- **置き場所は下の表で決める**（部品・フック・語彙・CSS のどれも同じ）。読み手を数えて箱を移すのは、
  2つ以上のページ・枠が読むようになってページの外へ上げるとき（表の4行目）だけで、ページの中では import が
  1本増えても置き場を動かさない。数えるのは `import`（`import type` も含む）で、テストは数えない:

  | 読み手                                               | 置き場                                                                                                        |
  | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
  | ページの直下（対・`hooks/`・`domain/`）を1つでも含む | ページの `hooks/` / `domain/` / `stores/`（状態）/ `components/<部品>/`                                       |
  | `components/` の下の2つ以上の部品（直下は含まない）  | フックは `components/hooks/`、語彙はページの `domain/`、状態はページの `stores/`、部品は `components/<部品>/` |
  | `components/<部品>/` の中だけ（その部品と子部品）    | その部品の中の `hooks/` / `domain/`、子部品は部品のディレクトリに平らに                                       |
  | 2つ以上のページ・枠                                  | ページの外（部品なら `components/domain/`、フックは `browser/hooks/`、それ以外は `browser/domain/`）          |

  **深さの上限は `src/browser/` から6段**（ファイルの置かれたディレクトリまでのディレクトリの数）。
  子部品は親の部品のディレクトリに平らに並べ、`components/` の入れ子を作らない。検査は
  `test/architecture/browser-depth.test.ts` で、上限を超える既存のディレクトリは同じファイルの除外の一覧
  （`DEEP_DIRECTORY_EXCEPTIONS`）に載り、移したら一覧から消す。CSS は class ごとに読み手を数える
  （選択子で結ばれた class は束ねて数える。`docs/architecture/browser.md`「CSS」）

- **部品のディレクトリの外から引いてよいのは `<部品>.tsx` だけ**（例外は `main.tsx` / `app.tsx` /
  `components/app/` とテスト）。ページの部品を画面の外に置くとき（書き終わりの知らせ `DiaryNotice`）は、
  `components/app/layout.tsx` がその `<部品>.tsx` を直に import する。**`<部品>.tsx` は自分の `components/` と
  概念のディレクトリの中を `export … from` で再エクスポートしない**（`hooks/` と `domain/` の型は可）
- 会話の画面は**1ページ**で、4つの領域のうち、メインビュー・キャラビュー・入力欄（`dispatch/`）は `conversation/components/` の下、サイドバーは `domain/sidebar/` の部品。検査は
  `test/architecture/browser-box.test.ts`（`describe("components/page/ の形", …)`）
