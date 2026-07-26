export function isApprovedGitHubAccount(
  providerId: string,
  accountId: string,
  approvedAccountId: string | undefined,
): boolean {
  return providerId === "github" && !!approvedAccountId && accountId === approvedAccountId;
}
