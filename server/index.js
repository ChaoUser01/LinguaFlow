import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Setup ES module paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from root directory
dotenv.config({ path: resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const groqApiKey = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;

let groq = null;
try {
  if (groqApiKey) {
    groq = new Groq({ apiKey: groqApiKey });
  } else {
    console.warn("WARNING: VITE_GROQ_API_KEY or GROQ_API_KEY is not set in .env.");
  }
} catch (e) {
  console.error("Failed to initialize Groq client:", e);
}

// Check middleware for Groq availability
const requireGroq = (req, res, next) => {
  if (!groq) {
    return res.status(500).json({ error: 'AI features are disabled because the Groq API key is missing on the server.' });
  }
  next();
};

// 1. Story Generator Endpoint
app.post('/api/story', requireGroq, async (req, res) => {
  try {
    const { targetWords, knownWords } = req.body;
    
    const knownList = knownWords.join(', ');
    const targetList = targetWords.join(', ');

    const prompt = `You are an expert Chinese language teacher creating Comprehensible Input material.
Write a short, engaging story in Simplified Chinese (about 150-200 characters).

Constraints:
1. Use these specific new target words organically: [${targetList}].
2. Also try to use these known words: [${knownList}]. If empty, use basic HSK 1/2 words.
3. Segment EVERY SINGLE word or punctuation mark in the story into an array of objects. Do not group entire sentences. Each object should represent a single word or punctuation mark.

Return ONLY a valid JSON object in this exact format:
{
  "title": "Story Title in English",
  "words": [
    { "zh": "我", "py": "wǒ", "en": "I" },
    { "zh": "喜欢", "py": "xǐhuan", "en": "like" },
    { "zh": "喝", "py": "hē", "en": "drink" },
    { "zh": "。", "py": "", "en": "" }
  ],
  "english_translation": "I like to drink water."
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    let content = completion.choices[0]?.message?.content || '{}';
    res.json(JSON.parse(content));
  } catch (error) {
    console.error("Story Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Chat (AI Tutor) Endpoint
app.post('/api/chat', requireGroq, async (req, res) => {
  try {
    const { messages, userLevel } = req.body;
    
    // Inject system prompt with the requested user context
    const systemPrompt = `You are a friendly, encouraging, and highly competent Mandarin Chinese tutor. 
The student is currently at approximately ${userLevel || 'HSK 1-2'} level.
Your goals:
1. Respond naturally to the student's Chinese, keeping your vocabulary tailored to their level.
2. If they make a grammar or vocabulary mistake, gently correct them in English, explain why, and then provide your conversational response in Chinese.
3. Always include Pinyin for Chinese sentences you produce if the user is below HSK 4.
4. Keep your responses concise (2-4 sentences). Don't overwhelm the student.`;

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: fullMessages,
      temperature: 0.6,
    });

    res.json({ message: completion.choices[0]?.message?.content });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Grammar Explanations Endpoint
app.post('/api/grammar', requireGroq, async (req, res) => {
  try {
    const { hskLevel } = req.body;
    
    const prompt = `Generate a JSON list of exactly 5 critical grammar points for HSK level ${hskLevel}.
For each point, provide a short name, a brief explanation in English, and 2 example sentences (each with chinese, pinyin, and english translation).

Return ONLY a valid JSON object in this format:
{
  "grammar_points": [
    {
      "name": "The shi...de construction",
      "explanation": "Used to emphasize the time, place, or manner of an action in the past.",
      "examples": [
        {
          "chinese": "我是昨天来的。",
          "pinyin": "wǒ shì zuótiān lái de.",
          "english": "It was yesterday that I came."
        }
      ]
    }
  ]
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    let content = completion.choices[0]?.message?.content || '{}';
    res.json(JSON.parse(content));
  } catch (error) {
    console.error("Grammar Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`[Server] Backend listening on port ${port}`);
});
