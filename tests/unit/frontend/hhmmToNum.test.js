const { hhmmToNum } = require("../../../public/5v5/minis5_viewer.js");

test("converts HH:MM to minutes", () => {
  expect(hhmmToNum("10:30")).toBe(630);
});
