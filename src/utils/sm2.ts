export interface SM2Data {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: string;
}

/**
 * SuperMemo 2 Algorithm
 * @param quality 0-5 user rating (0=Blackout, 1=Incorrect, 2=Incorrect but remembered, 3=Hard, 4=Good, 5=Easy)
 * @param easeFactor Current ease factor (default 2.5)
 * @param interval Current interval in days
 * @param repetitions Number of consecutive correct reviews
 * @returns SM2Data
 */
export function calculateSM2(
  quality: number,
  easeFactor: number = 2.5,
  interval: number = 0,
  repetitions: number = 0
): SM2Data {
  let newEaseFactor = easeFactor;
  let newInterval = interval;
  let newRepetitions = repetitions;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
    newRepetitions += 1;
  } else {
    // Incorrect response
    newRepetitions = 0;
    newInterval = 1;
  }

  // Adjust ease factor
  newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  // Calculate next review date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);

  return {
    easeFactor: newEaseFactor,
    interval: newInterval,
    repetitions: newRepetitions,
    nextReviewDate: nextDate.toISOString()
  };
}
