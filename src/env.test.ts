import { expect, it } from "vite-plus/test";
import { variables } from "./env";

it("requires every declared environment variable to be provisioned and nonblank", async () => {
  for (const [name, { schema }] of Object.entries(variables)) {
    for (const value of [undefined, "", " "]) {
      const result = await schema["~standard"].validate(value);
      expect(result.issues, `${name} must reject ${JSON.stringify(value)}`).toBeDefined();
    }
  }
});
