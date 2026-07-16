import { createContext } from "svelte";
import type { CardChanges } from "./card";

export type CardPersistence = {
  readonly canManage: boolean;
  update: (id: string, changes: CardChanges) => Promise<void>;
  delete: (id: string) => Promise<void>;
};
export const [getCardPersistence, setCardPersistence] = createContext<CardPersistence | null>();
