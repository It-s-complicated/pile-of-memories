declare global {
  namespace App {
    interface PageState {
      captureHistory?: boolean;
    }
    interface Locals {
      did: string | null;
    }
  }
}

export {};
