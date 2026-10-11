import { createContext } from "svelte";
import type { RemoteFormEnhanceInstance } from "$app/server";
import type { Card, CardChanges, UpdateCardFormInput } from "./card";

export type CardPersistence = {
  browse: () => boolean;
  save: (form: RemoteFormEnhanceInstance<UpdateCardFormInput, Card>) => Promise<boolean>;
  update: (id: string, changes: CardChanges) => Promise<void>;
  delete: (id: string) => Promise<void>;
};
export const [getCardPersistence, setCardPersistence] = createContext<CardPersistence>();
