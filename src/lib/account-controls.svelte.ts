import { createContext } from "svelte";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import { authClient } from "./auth-client";

export type AccountControls = {
  readonly signingOut: boolean;
  signOut(): Promise<void>;
};

export const [getAccountControls, setAccountControls] = createContext<AccountControls>();

export class AccountState implements AccountControls {
  signedOut = $state(false);
  working = $state(false);
  authError = $state("");
  signingOut = $derived(this.working);
  #clearBoardCache: () => Promise<void>;

  constructor(clearBoardCache: () => Promise<void>) {
    this.#clearBoardCache = clearBoardCache;
  }

  mount = (): (() => void) => {
    const channel = new BroadcastChannel("pile-of-memories-auth");
    channel.onmessage = () => {
      this.signedOut = true;
      void invalidateAll();
    };
    return () => channel.close();
  };

  signIn = async (): Promise<void> => {
    this.working = true;
    this.authError = "";
    const url = page.shallow?.url ?? page.url;
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: url.pathname + url.search + url.hash,
    });
    if (result.error) {
      this.authError = result.error.message ?? "GitHub sign-in failed.";
      this.working = false;
    }
  };

  signOut = async (): Promise<void> => {
    this.working = true;
    this.authError = "";
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? "Sign-out failed.");
      const channel = new BroadcastChannel("pile-of-memories-auth");
      channel.postMessage("signed-out");
      channel.close();
      try {
        await this.#clearBoardCache();
      } finally {
        this.signedOut = true;
        await invalidateAll();
      }
    } catch (error) {
      this.authError = error instanceof Error ? error.message : "Sign-out failed.";
    } finally {
      this.working = false;
    }
  };
}

export function createAccountControls(clearBoardCache: () => Promise<void>): AccountState {
  const account = new AccountState(clearBoardCache);
  setAccountControls(account);
  return account;
}
