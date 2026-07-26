import { describe, expect, it } from "vite-plus/test";
import { isApprovedGitHubAccount } from "./auth-policy";

describe("GitHub account admission", () => {
  it("allows only the configured GitHub provider account", () => {
    expect(isApprovedGitHubAccount("github", "123", "123")).toBe(true);
    expect(isApprovedGitHubAccount("github", "456", "123")).toBe(false);
    expect(isApprovedGitHubAccount("google", "123", "123")).toBe(false);
    expect(isApprovedGitHubAccount("github", "123", undefined)).toBe(false);
  });
});
