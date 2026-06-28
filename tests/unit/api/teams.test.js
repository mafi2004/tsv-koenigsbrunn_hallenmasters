const request = require("supertest");
const express = require("express");

// Router importieren
const router = require("../../../routes/teams");

// Mocks für DB, Socket.IO, appendOp, makeSnapshot
jest.mock("../../../db", () => ({
  run: jest.fn()
}));

jest.mock("../../../utils/recovery", () => ({
  appendOp: jest.fn(),
  makeSnapshot: jest.fn()
}));

jest.mock("../../../server", () => ({
  io3: {emit: jest.fn() }
}));

const db = require("../../../db");
const recovery = require("../../../utils/recovery");
const { io3 } = require("../../../server");

describe("POST /api/minis3/teams", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/teams", router);

    // Reset mocks
    db.run.mockReset();
    io3.emit.mockReset();
    recovery.appendOp.mockReset();
    recovery.makeSnapshot.mockReset();
  });

  it("returns 400 if name is missing", async () => {
    const res = await request(app)
      .post("/api/minis3/teams")
      .send({ groupName: "A" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Teamname fehlt");
  });

  it("inserts team and returns new team", async () => {
    // Mock für db.run
    db.run.mockImplementation((sql, params, callback) => {
      callback.call({ lastID: 42 }, null); // lastID simulieren
    });

    const res = await request(app)
      .post("/api/minis3/teams")
      .send({ name: "TSV Königsbrunn", groupName: "A" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 42,
      name: "TSV Königsbrunn",
      groupName: "A"
    });

    // DB wurde korrekt aufgerufen
    expect(db.run).toHaveBeenCalled();

    // Socket wurde gesendet
    expect(io3.emit).toHaveBeenCalledWith("teams:updated");

    // Snapshot & Log wurden aufgerufen
    expect(appendOp).toHaveBeenCalled();
    expect(makeSnapshot).toHaveBeenCalled();
  });

  it("returns 500 if DB error occurs", async () => {
    db.run.mockImplementation((sql, params, callback) => {
      callback(new Error("DB kaputt"));
    });

    const res = await request(app)
      .post("/api/minis3/teams")
      .send({ name: "Fehlerteam" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB kaputt");
  });
});
