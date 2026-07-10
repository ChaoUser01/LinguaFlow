import { supabase } from './supabase';
import Groq from 'groq-sdk';

interface ExtraDetails {
  pos: string | null;
  sentence: { chinese: string; pinyin: string; english: string } | null;
  compounds: { simplified: string; pinyin: string; english: string }[] | null;
}

const parseJSON = (str: string) => {
  try {
    let clean = str.trim();
    if (clean.startsWith('```json')) clean = clean.replace('```json', '');
    if (clean.startsWith('```')) clean = clean.replace('```', '');
    if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
    return JSON.parse(clean);
  } catch (e) {
    console.error("Failed to parse LLM JSON:", str);
    return null;
  }
};

export const getExtraDetails = async (vocab: any): Promise<ExtraDetails> => {
  // 1. Tier 1: Check Database (already populated in vocab object from flashcard_view)
  const hasDbSentence = vocab.sentences && vocab.sentences.length > 0 && vocab.sentences[0];
  const hasDbCompounds = vocab.compounds && vocab.compounds.length > 0 && vocab.compounds[0];

  if (hasDbSentence && hasDbCompounds) {
    return {
      pos: null,
      sentence: vocab.sentences[0],
      compounds: vocab.compounds
    };
  }

  // 2. Tier 2: Check LocalStorage
  const localKey = `lingua_extra_${vocab.vocab_id}`;
  const localData = localStorage.getItem(localKey);
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      return parsed;
    } catch (e) {}
  }

  // 3. Tier 3: AI Generation (BYOK)
  const apiKey = localStorage.getItem('lingua_groq_key');
  if (!apiKey) {
    console.warn("No Groq API Key found. Skipping generation.");
    return { pos: null, sentence: null, compounds: null };
  }

  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

  const prompt = `You are a Chinese lexicographer API.
Generate 1 highly contextual example sentence and exactly 3 common compound words containing the character/word "${vocab.simplified}" (${vocab.pinyin}).
The target HSK level is ${vocab.hsk_level}. Ensure the sentence is comprehensible for this level.

Respond ONLY with valid JSON in this exact structure:
{
  "pos": "Noun", // or Verb, Adjective, etc.
  "sentence": {
    "chinese": "...",
    "pinyin": "...",
    "english": "..."
  },
  "compounds": [
    { "simplified": "...", "pinyin": "...", "english": "..." },
    { "simplified": "...", "pinyin": "...", "english": "..." },
    { "simplified": "...", "pinyin": "...", "english": "..." }
  ]
}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const result = parseJSON(completion.choices[0]?.message?.content || '');

    if (result && result.sentence && result.compounds) {
      // Save to Tier 2 (Local Cache)
      localStorage.setItem(localKey, JSON.stringify(result));

      // Save to Tier 1 (Supabase Database - Crowdsourcing)
      // Note: RLS policies will reject this if the user is not an Admin/Whitelist, 
      // but that is intended behavior. The frontend doesn't need to care.
      try {
        if (!hasDbSentence) {
          await supabase.from('dictionary_sentences').insert({
            word_id: vocab.vocab_id,
            chinese: result.sentence.chinese,
            pinyin: result.sentence.pinyin,
            english: result.sentence.english
          });
        }
        
        // Note: For compounds, we would ideally search if the compound word exists in dictionary_words, 
        // then insert into word_relations. For simplicity, we just cache it locally if they don't exist.
        // A full crowdsourced insert for relations requires more complex backend RPC logic to prevent duplication.
      } catch (dbErr) {
        console.log("DB Insert failed (likely RLS restricting non-admins), safely ignoring.", dbErr);
      }

      return result;
    }
  } catch (err) {
    console.error("AI Generation error:", err);
  }

  return { pos: null, sentence: null, compounds: null };
};
