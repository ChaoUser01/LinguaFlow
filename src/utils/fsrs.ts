export function calculateFSRS(
  quality: number,
  stability: number, // Map to ease_factor in DB
  difficulty: number, // Map to repetitions in DB
  frequency_rank: number = 50000
) {
  // Quality mapping from UI (1: Again, 3: Hard, 4: Good, 5: Easy)
  // to FSRS Grade (1: Again, 2: Hard, 3: Good, 4: Easy)
  const grade = quality === 1 ? 1 : quality === 3 ? 2 : quality === 4 ? 3 : 4;

  // Initialize if new card
  if (stability === 0) stability = 2.0;
  if (difficulty === 0) difficulty = 5.0;

  // 1. Update Difficulty
  let newDifficulty = difficulty - 0.5 * (grade - 3);
  newDifficulty = Math.max(1, Math.min(newDifficulty, 10)); // bounds 1 to 10

  // 2. Update Stability
  let newStability = stability;
  if (grade === 1) {
    newStability = Math.max(1, stability * 0.5); // Halve stability on failure
  } else {
    // Increase stability based on difficulty and grade
    const stabilityMultiplier = 1 + Math.exp(-0.1 * newDifficulty) * (grade - 1);
    newStability = stability * stabilityMultiplier;
  }

  // 3. Calculate Interval (Days)
  // We want Retrievability (R) to be ~90% at the end of the interval
  const interval = Math.round(newStability * 0.9);

  // 4. Calculate Priority (The Knowledge Graph Leap)
  // priority = forgetting_probability × frequency
  // Lower frequency_rank means higher frequency word (e.g. rank 1 is "de")
  const r = Math.exp(-interval / newStability); // Retrievability
  const forgetting_probability = 1 - r;
  const priority = forgetting_probability * (100000 / Math.max(1, frequency_rank));

  // 5. Next Review Date
  const nextReviewDate = new Date();
  if (grade === 1) {
    nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10); // Review again in 10 mins
  } else {
    nextReviewDate.setDate(nextReviewDate.getDate() + Math.max(1, interval));
  }

  return {
    easeFactor: newStability, // Save back to ease_factor
    interval: interval,       // Save back to interval
    repetitions: newDifficulty, // Save back to repetitions
    nextReviewDate: nextReviewDate.toISOString(),
    priority
  };
}
