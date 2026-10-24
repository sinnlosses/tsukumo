# アーキテクチャ詳細: `src/browser/` の箱と領域

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: `src/browser/` の箱ごとに置くものと import してよい先、上げる・下ろす引き金、領域の機能（枠・画面）と置かれる機能の辺を持つ（ディレクトリの節の後半と、領域の機能の節）。
読む時: ブラウザ側のファイルをどの箱に置くか迷ったとき、領域や置かれる機能どうしの import を確かめたいとき。
直す時: 箱や領域の一覧・辺を変えたとき（検査は `test/architecture/browser-box.test.ts`）。

## 節の索引

| 節                             | 中身                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| ### ディレクトリ               | 後半: `src/browser/` の箱と置く基準、部品の箱の向き、上げる引き金と下ろす引き金（前半は `docs/architecture/directory.md`） |
| ### 領域の機能と、置かれる機能 | 枠・画面・置かれる機能の3種類と辺、区画ひとまとまりは領域の側に置く                                                        |

## 全体構成

### ディレクトリ

**`src/browser/` の箱と、置く基準**（判断に迷ったら「その機能しか読まないなら機能の中」が既定。
領域も同じ）:

| 箱                     | 置くもの                                                                                                             | import してよい先                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx` / `app.tsx` | 入口（`main.tsx` は mount だけ）と `<App>`（`app.tsx`。Provider を重ねて `<Root>` を描く）                           | すべて                                                                                                                              |
| `components/app/`      | **`<Root>` と、出す画面を選ぶ `<Layout>`**。すべての画面を知る composition root                                      | `components/page` / `components/domain` / `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared` |
| `components/page/`     | **画面**。1つの画面（会話の画面は1つの領域）に閉じた部品・状態・保存                                                 | `components/domain` / `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                     |
| `components/domain/`   | **tsukumo の語彙を持つ部品**。直下は2つ以上の領域が読む部品、サブディレクトリは全画面で共有する枠（領域）            | `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                                           |
| `features/`            | **置かれる機能**（置き場所を持たず、領域に置いてもらう機能の部品・状態）                                             | `components/ui` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                                                        |
| `components/ui/`       | **語彙を持たない** React の部品（値と呼び先を全部受け取る）                                                          | `components/ui` / `hooks` / `lib` / `utils` / `shared`                                                                              |
| `hooks/`               | **語彙を持たない** React のフック（`use-modal-dialog.ts`）                                                           | `lib` / `utils` / `shared`                                                                                                          |
| `domain/`              | **画面全体の語彙**（tsukumo の語彙を名乗り、複数の領域・機能が読むもの。部品ではないもの）                           | `lib` / `utils` / `shared`                                                                                                          |
| `lib/`                 | **固有のライブラリ**（`orpc` のように特定用途のパッケージ）を包む道具                                                | `utils` / `shared`                                                                                                                  |
| `utils/`               | **それ以外**の汎用の道具（実行環境の API・`react` / `remeda` / `zod` を含む。下の「`lib/` と `utils/` に置く基準」） | —（`utils` の中だけ）                                                                                                               |
| `stores/`              | **画面全体で共有する状態**の store・Context と、それを読む hook                                                      | `domain` / `lib` / `utils` / `shared`                                                                                               |
| `styles/`              | **グローバルな CSS だけ**（`theme.css`。領域・機能の見た目はその中）                                                 | —                                                                                                                                   |
| `types/`               | **ambient 宣言だけ**（`*.d.ts`。`css-variable.d.ts` など。どの箱にも属さず、import では辿らない）                    | —                                                                                                                                   |

- **部品の箱の向きは `app.tsx` → `components/app` → `components/page` → `components/domain` → `features` →
  `components/ui` の一方通行**。`components/domain` は画面を知らず、`features/` は自分を置く枠も画面も
  知らず、`components/ui` は tsukumo の語彙を知らない。**画面の組み立てを `components/domain/` へ移さない**
  （枠が画面を import する逆向きの辺になるので、`page` より上の段 `components/app/` に置く）
- **`components/domain` と `components/ui` の線は、tsukumo の語彙を持つかで引く**（`Portrait` は `domain`、
  `Select`・`Button`・`ImageZoom` は `ui`）
- **`stores/` は「状態ライブラリの置き場」ではなく「画面全体で共有する状態の置き場」**（`docs/architecture/browser.md`「状態の持ち方」）。置くのは
  **複数の領域が読む**状態で、領域の中に置けず、`app.tsx` に残すと領域が入口を import することになる
  ので箱が要る。**1本の hash の書き方は `stores/location-hash.ts` だけが知る**。領域と機能が触れるのは
  `stores/` が公開する hook までで、`app.tsx` と `stores/` の中身を組み立てる側として import しない
- **領域どうし・機能どうしは import しない**（唯一の例外が「領域 → 置かれる機能」の1方向。次の節。
  親が子を組む形も数える）。またいで要るものは、**語彙を持つ部品なら `components/domain/`、フックなら
  `hooks/`、状態なら `stores/`、それ以外は tsukumo の語彙を名乗るなら `domain/`、ライブラリを包む道具なら
  `lib/` へ上げる**。上げる引き金は「2つ目の読み手が出たとき」で、1つの領域しか読まないものは領域の中に残す
- **引き金は逆にも引く。** 読み手が1つの領域だけに戻ったら、その中へ**下ろす**。`browser/lib/` と
  `browser/domain/`、`components/domain/` の直下に「1つの領域（機能）だけが読むファイル」が無いことは
  `test/architecture/browser-box.test.ts` が見る（どの領域・機能も読まないものは対象外）
- **`domain/` と `lib/` の線は、tsukumo の語彙を名乗るか、固有のライブラリ（`orpc` のような）を
  包むかで引く。** `domain/appearance-color.ts` は `localStorage` を包むが名前が指すのは**画面の色**
  なので `domain/`、`domain/tool-summary.ts` は純関数で `remeda`（用途を問わない汎用ライブラリ）しか
  使わず、`shared/` の型にも依存する（`utils/` の歯止め3を満たさない）ので、`lib/` ではなく `domain/`
- 検査は `test/architecture/browser-box.test.ts`（領域と置かれる機能の一覧が横の辺を、箱の一覧が縦の辺を落とす）

### 領域の機能と、置かれる機能

画面を組み立てる部品のまとまりは3種類ある。**まとまりどうしの辺は「枠・画面 → 置かれる機能」と
「画面 → 枠」だけ**を許し、それ以外は落とす。

| 種類                       | どういうものか                                                       | 置き場                    | 辺                                                                                                         | いまの中身                                                   |
| -------------------------- | -------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **枠**（frame）            | 全画面で共有する枠。差し込み口は props で受け、画面を知らない        | `components/domain/<枠>/` | 画面と `<Layout>` から import してよい。**枠どうしは import しない**                                       | `screen-nav` / `sidebar`                                     |
| **画面**（screen）         | 1つの画面 = 1つのページ。**どの画面を出すかを決めるのは `<Layout>`** | `components/page/<画面>/` | `<Layout>` だけが import する。**画面どうしは import しない**                                              | `conversation` / `character` / `token-usage` / `achievement` |
| **置かれる機能**（placed） | 自分の置き場所を持たず、枠か画面の中に置いてもらう                   | `features/<機能>/`        | 枠・画面から import してよい。**自分はどの機能も、枠・画面も、`components/domain` も import しない（葉）** | `task-board` / `current-work` / `run-setting`                |

- **`components/domain/` の直下のファイルは領域ではなく共有の部品**。**直下にサブディレクトリを足す
  ときは枠として一覧に載せる**（載せ忘れは検査が `throw` する。どの一覧にも無いディレクトリが
  `features/` と `components/domain/` の直下、`components/page/` の下にあれば落ちる）
- **どの画面にも出るが、1つの画面と語彙を共有するものは、その画面の中に置く**（書き終わりの知らせは
  成果の画面と見開きを開く合図と鈴の絵を共有する）。どこに出すかは `<Root>` が決める
- **「置かれる機能」にするのは、中身が領域の持ち物でなくなったとき**（`task-board` はサイドバーの
  一覧と画面いっぱいの `<dialog>` の対で、どちらも**タスクの語彙**で書かれている。`current-work` は
  帯と会話の画面の2箇所に置かれ、どちらの持ち物でもない。`run-setting` はモデル・effort・許可モードの
  吊り札で、サイドバーの下端の帯と設定の「セッションの既定」の両方が同じ行の中身を使う）。置かれる機能の側は
  「サイドバー」も「区画」も名乗らず、置き場所を知らないまま書く。語彙を持たない `components/ui/` とは別物
- **区画ひとまとまりは領域の側に置く。** 枠・見出しの文言・押せる口・購読・state を1ファイルにまとめて
  領域の中に置き（`components/domain/sidebar/components/task-section.tsx`）、置かれる機能からは「何を描くか」だけを
  import する。**購読と state を区画が持つ**ので、描き直しはその区画で止まる（`<Root>` へ上げると
  タスクが変わるたびに全領域が描き直される）。例外はタスクのモーダルで、開く口がサイドバーの外（レポートの
  目録の1行のタスクID）にもあり、狭い画面ではタスク一覧が引き出しの中に入るので、開いているかは store
  （`stores/task-board-request.ts`）が持ち、`<dialog>` は会話の画面に1つだけ置く
  （`conversation/components/requested-task-board/`）
