import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/revise", () => {
  it("rejects a request with no slug", async () => {
    const req = new Request("http://localhost/api/revise", {
      method: "POST",
      body: JSON.stringify({ request: "push it back a week" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a request with no change text", async () => {
    const req = new Request("http://localhost/api/revise", {
      method: "POST",
      body: JSON.stringify({ slug: "sample-japan" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
