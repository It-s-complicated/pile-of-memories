import { defineCollection, defineSpace, scopesFor } from "airspace";
import { defineLexicons, field, space } from "airspace/lexicon";

const lexicons = defineLexicons("app.pileofmemories.prototype", {
  board: { key: "self", snapshot: field.text({ max: 200_000 }) },
  workspace: space(["board"]),
});

export default lexicons;
export const workspace = defineSpace(lexicons.workspace, {
  collections: { boards: defineCollection(lexicons.board) },
});
export const storageScopes = scopesFor({ spaces: { workspace } });
