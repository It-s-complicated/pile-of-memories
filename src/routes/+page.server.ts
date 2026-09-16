import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  did: locals.did,
});
