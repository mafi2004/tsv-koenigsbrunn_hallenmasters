const request = require("supertest");
const app = require("../../server");

describe("Teams API", () => {
  it("loads teams", async () => {
    const res = await request(app).get("/api/minis5/teams");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("adds a team", async () => {
    const res = await request(app)
      .post("/api/minis5/teams")
      .send({ name: "Testteam", groupName: "A" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Testteam");
  });
});
