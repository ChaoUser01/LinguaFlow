export interface DictDefinition {
  id: string;
  word_id: string;
  meaning: string;
}

export interface DictSentence {
  id: string;
  word_id: string;
  chinese: string;
  pinyin: string;
  english: string;
}

export interface DictWord {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  hsk_level: number;
  dictionary_definitions?: DictDefinition[];
  dictionary_sentences?: DictSentence[];
}

export interface DictCharacter {
  character: string;
  radical: string;
  stroke_count: number;
  decomposition: string;
}
