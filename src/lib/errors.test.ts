import { expect, it } from "vite-plus/test";
import { getErrorMessage } from "./errors";

it("preserves remote HTTP messages as well as ordinary errors without exposing other details", () => {
  class RemoteFailure {
    body = { message: "A selected label was renamed.", detail: "Private SQL details" };
  }
  expect(getErrorMessage(new RemoteFailure())).toBe("A selected label was renamed.");
  expect(getErrorMessage(new Error("Connect to the internet."))).toBe("Connect to the internet.");
  expect(getErrorMessage({ body: { message: "" } }, "Please retry.")).toBe("Please retry.");
  expect(getErrorMessage(null, "Please retry.")).toBe("Please retry.");
});
