import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  userId: locals.user?.id ?? null,
});
