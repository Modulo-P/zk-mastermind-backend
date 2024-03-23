import { unwrapCBOR } from "./blockchain";

describe("unwrapCBOR", () => {
  it("should unwrap 2 bytes", () => {
    expect(unwrapCBOR("5900001234")).toBe("1234");
  });
});
