import { describe, expect, it } from "vitest";

import { formatMessage } from "../lib/format";

describe("formatMessage", () => {
  it("trims surrounding whitespace", () => {
    expect(formatMessage("  hello  ")).toBe("hello");
  });
});
