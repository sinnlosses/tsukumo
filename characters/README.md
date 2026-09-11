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
│   └── *.svg
└── local/              ← .gitignore 済み。ここに自分の素材を置く
    ├── character.json
    └── *.png / *.svg / *.gif
```

## 定義ファイルの形

```json
{
  "name": "表示名",
  "license": "その素材をここに置いてよい根拠",
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

- **`portraits` は「あるものだけ」でよい。** 見つからない表情は `default` に落ちる。
  1枚から始めて、増やすほど細かくなる
- **`default` と `working` の2つだけは必ず用意する。** `default` は「speak がまだ無い・
  表情の指定が無い」ときの既定、`working` はツールを実行している間に自動で切り替える先
  （`docs/requirements.md` 4.3）。この2つはコード側が名前で直接参照するので、他の表情名のように
  「あるものだけ」で済ませられない
- **`outfitAccents` は衣装（実行中のモデル）ごとの差し色。** `light` = haiku /
  `normal` = sonnet / `heavy` = opus（`docs/requirements.md` 4.3）
- **差し色が効くのはインラインで埋め込んだ SVG だけ。** `<img>` で読み込んだ画像は独立した
  文書として扱われ、ページ側の CSS 変数（`--outfit-accent`）が届かない。ラスタ画像
  （PNG / GIF）を使う場合、衣装の出し分けは**表情と同じくファイルを分ける**ことになる
