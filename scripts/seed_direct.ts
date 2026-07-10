import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(" ERROR: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log(" Starting direct database seed using Service Role Key...");
  
  const hskData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/hsk.json'), 'utf-8'));
  
  console.log("🧹 Clearing old data...");
  await supabase.from('dictionary_sentences').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('dictionary_definitions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('dictionary_words').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log(`📦 Preparing ${hskData.length} HSK words...`);
  
  const wordsToInsert = [];
  const defsToInsert = [];
  
  for (let i = 0; i < hskData.length; i++) {
    const w = hskData[i];
    const wordId = crypto.randomUUID();
    
    wordsToInsert.push({
      id: wordId,
      simplified: w.simplified,
      traditional: w.traditional || w.simplified,
      pinyin: w.pinyin,
      hsk_level: w.hsk_level,
      frequency_rank: i + 1
    });
    
    if (w.meaning) {
      const meanings = w.meaning.split(/[\/,;]/).map((m: string) => m.trim()).filter((m: string) => m);
      for (const m of meanings) {
        defsToInsert.push({
          word_id: wordId,
          meaning: m
        });
      }
    }
  }

  async function batchInsert(table: string, data: any[]) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      
      let retries = 5;
      let success = false;
      while (retries > 0 && !success) {
        const { error } = await supabase.from(table).insert(batch);
        if (error) {
          if (error.message.includes('fetch failed') || error.message.includes('ECONNRESET')) {
            console.log(`\n Network error, retrying... (${retries} attempts left)`);
            await new Promise(r => setTimeout(r, 2000));
            retries--;
          } else {
            console.error(`\n Error inserting into ${table}:`, error);
            return false;
          }
        } else {
          success = true;
        }
      }
      if (!success) {
        console.error(`\n Failed to insert into ${table} after 5 retries due to network drops.`);
        return false;
      }
      
      process.stdout.write(`\r ${table}: Inserted ${Math.min(i + BATCH_SIZE, data.length)} / ${data.length}`);
    }
    console.log();
    return true;
  }

  // 5. Execute Inserts
  console.log("\n⬆ Uploading Words...");
  await batchInsert('dictionary_words', wordsToInsert);
  
  console.log("\n⬆ Uploading Definitions...");
  await batchInsert('dictionary_definitions', defsToInsert);
  
  console.log("\n Refreshing Materialized View...");
  const { error } = await supabase.rpc('refresh_flashcard_view');
  
  if (error) {
    console.log(" Could not trigger view refresh via RPC. Please run 'REFRESH MATERIALIZED VIEW public.flashcard_view;' in your SQL Editor.");
  } else {
    console.log(" Materialized View refreshed!");
  }

  console.log("\n SEED COMPLETE! Your dictionary is fully populated.");
}

main();
