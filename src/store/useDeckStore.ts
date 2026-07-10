import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Deck {
  id: string;
  name: string;
  levels: number[]; // e.g. [1, 2]
  timeLimitMinutes: number | null; // null means no limit
}

interface DeckState {
  decks: Deck[];
  addDeck: (deck: Omit<Deck, 'id'>) => void;
  deleteDeck: (id: string) => void;
}

export const useDeckStore = create<DeckState>()(
  persist(
    (set) => ({
      decks: [],
      addDeck: (deckData) => set((state) => {
        return {
          decks: [...state.decks, { ...deckData, id: Date.now().toString() }]
        };
      }),
      deleteDeck: (id) => set((state) => ({
        decks: state.decks.filter(d => d.id !== id)
      }))
    }),
    {
      name: 'linguaflow-decks',
    }
  )
);
