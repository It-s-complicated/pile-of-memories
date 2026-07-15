import { createContext } from "svelte";
import type { CardChanges } from "./card";

export type PersistCard = (id: string, changes: CardChanges) => Promise<void>;
export const [getCardPersistence, setCardPersistence] = createContext<PersistCard | null>();
