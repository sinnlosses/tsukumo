**`capture-catalog.ts` の件 `notation` が演出の途中を撮り、本文がほぼ空に写るのを、目視に使える画にする（振り返り: GH-584）**

- 観点: 黄 道具の不足
- 根拠: GH-584 の目視で、`node scripts/capture-catalog.ts` の件 `notation` の wide の画が「表」の見出しと線の切れ端だけで、崩れか演出の途中かを画から見分けられず、委譲先が原因を調べて撮り直すまで1往復かかった。件 `notation` は `skipReveal: false` で、書き上げ演出（約15秒）の途中を撮る（`scripts/capture-catalog.ts` の件の表と `CatalogEntry` の説明）。同じ場面の `notation-memo`・`notation-flow` は `skipReveal: true` で書き上がった画が撮れる。移動や CSS の直しの目視で、記法の一覧の件として真っ先に選ばれやすいのは名前の素直な `notation` のほう
- 出し先: タスクにする（difficulty は haiku）。件 `notation` を演出を打ち切って撮る形にするか、演出の途中を撮る件なら名前（例 `notation-revealing`）と `--help` の説明でそれと分かるようにする。`docs/architecture/testing.md`「手で確かめること」の件の説明も合わせる
