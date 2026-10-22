import { expect, it } from "vite-plus/test";
import { variables } from "./env";

it("rejects missing required variables and blank values", async () => {
  for (const [name, { schema }] of Object.entries(variables)) {
    for (const value of [undefined, "", " "]) {
      if (name === "DATABASE_SSL" && value === undefined) continue;
      const result = await schema["~standard"].validate(value);
      expect(result.issues, `${name} must reject ${JSON.stringify(value)}`).toBeDefined();
    }
  }
});

it.each([
  [undefined, "true"],
  ["true", "true"],
  ["false", "false"],
])("resolves DATABASE_SSL=%j to %s", async (value, expected) => {
  const result = await variables.DATABASE_SSL.schema["~standard"].validate(value);
  expect(result).toEqual({ value: expected });
});

it("rejects invalid DATABASE_SSL values instead of defaulting them", async () => {
  const result = await variables.DATABASE_SSL.schema["~standard"].validate("yes");
  expect(result.issues).toBeDefined();
});
