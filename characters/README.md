# characters/

キャラクターの定義と素材の置き場。

## 既定のキャラクター

`tsukumo-spirit/` — このリポジトリのために自作した精霊。**権利がクリーンなので公開リポジトリに
置いてある。** 素材が1つも無くても tsukumo が動くようにするためのもの。

## 自分の立ち絵を使う

**`characters/local/` に置く。このディレクトリは `.gitignore` されている。**

公開リポジトリなので、**権利のある画像（公式絵・ファンアートなど）をコミットしない**こと。
`characters/local/` に置いて、そこを指す定義ファイルを同じ場所に用意する。

```
characters/
├── tsukumo-spirit/     ← 自作。コミットされる
│   ├── character.json
│   ├── persona.md
│   └── *.svg
└── local/              ← .gitignore 済み。ここに自分の素材を置く
    ├── character.json
    ├── persona.md
    └── *.png / *.svg / *.gif
```

**この1ディレクトリが「キャラクターパック」**（定義・人格・素材の1単位）。サイドバーの
`<select>` で切り替えると、tsukumo は**そのパックでセッションを起こし直す**（会話は続かない。
吹き出し・立ち絵・メインビューが消えて、新しいキャラクターで始まる）。

## 切り替えの選択肢に出るもの

1. **tsukumo 同梱の `characters/` の各ディレクトリ**（`character.json` があるもの）
2. **起動先の `characters/local/`**（tsukumo を起こしたディレクトリの下）

**同名は起動先が勝つ**（同梱の既定より、そのプロジェクトで用意したものを優先する）。

## 定義ファイルの形

```json
{
  "name": "表示名",
  "license": "その素材をここに置いてよい根拠",
  "accent": "#f2b0a0",
  "speechMarker": "名前: ",
  "expressions": {
    "default": "通常",
    "working": "作業中",
    "proud": "どや顔",
    "flustered": "あわあわ"
  },
  "portraits": {
    "default": "通常時の画像",
    "working": "作業中",
    "proud": "どや顔",
    "flustered": "あわあわ"
  },
  "outfitAccents": {
    "default": "#b8c7ff",
    "light": "#a8e6c0",
    "normal": "#b8c7ff",
    "heavy": "#ffb3a7"
  }
}
```

- **`name` は画面に出る表示名**（切り替えの `<select>` に出るのもこれ）。無ければ
  ディレクトリ名が出る
- **`expressions` は表情名 → 表示するラベル。** `speak` ツールの説明と立ち絵の alt に出る。
  **表情の呼び名はキャラクターの言葉なのでコード側に持たない**ので、ここに無い表情は
  表情名（`default` などの英語）がそのままラベルになる。**立ち絵が無くてもラベルがあれば
  `speak` で選べる**（絵は `default` に落ちる）
- **`speechMarker` はセリフの行頭マーカー**（`speak` が呼ばれなかったターンの補助。
  `docs/requirements.md` 4.2）。**書かなければ補助そのものが効かない**（`speak` だけが
  セリフの経路になる）。既定値はコード側に無い
- **`accent` はキャラクターの色**（吹き出し・選ばれたタブなど画面全体に効く。衣装ごとの
  差し色 `outfitAccents` とは別物）
- **`portraits` は「あるものだけ」でよい。** 見つからない表情は `default` に落ちる。
  1枚から始めて、増やすほど細かくなる
- **`default` と `working` の2つだけは必ず用意する。** `default` は「speak がまだ無い・
  表情の指定が無い」ときの既定、`working` はツールを実行している間に自動で切り替える先
  （`docs/requirements.md` 4.3）。この2つはコード側が名前で直接参照するので、他の表情名のように
  「あるものだけ」で済ませられない
- **`outfitAccents` は衣装（実行中のモデル）ごとの差し色。** `light` = haiku /
  `normal` = sonnet / `heavy` = opus（`docs/requirements.md` 4.3）

### `persona.md`

パックと同じディレクトリに置く**そのキャラクターの人格**。tsukumo はこれを `systemPrompt` の
append として毎ターン効かせる（**無くてもよい**。無ければ人格の追加が空になるだけで、tsukumo は
そのまま動く）。

- 書くのは**人格と話し方だけ**。レポートの記法は tsukumo 側が別に足すので書かない
- **セリフ（`speak`）と詳細（本文）の書き分け**も、実際に守らせるのはここ
  （`docs/requirements.md` 4.2）
- **tsukumo のセッションでは、グローバルの出力スタイルは中立に戻る**ので、人格が二重に
  効くことはない（`docs/requirements.md` 4.4）

### 立ち絵

- **差し色が効くのはインラインで埋め込んだ SVG だけ。** `<img>` で読み込んだ画像は独立した
  文書として扱われ、ページ側の CSS 変数（`--outfit-accent`）が届かない。ラスタ画像
  （PNG / GIF）を使う場合、衣装の出し分けは**表情と同じくファイルを分ける**ことになる
