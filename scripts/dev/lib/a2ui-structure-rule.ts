/** 書き手に渡す、部品の一覧の構造の検査が見る規則。本番ではツールの説明ではなく差し戻しで伝わる。 */
export const A2UI_STRUCTURE_RULES =
  "規則: 根は id が root の Report。Report.children には Section の id だけを置く。Section の子に Section は置けない。配置の部品（Row・Column・Card・Tabs）の入れ子は 3 階層まで。参照されない部品・同じ id・参照先の無い id は置けない。"
