const { generateSchedule } = require("../../utils/schedule");

test("generates schedule with correct number of matches", () => {
  const result = generateSchedule("09:00", 10, 2);
  expect(result.length).toBeGreaterThan(0);
  expect(result[0]).toHaveProperty("plannedStart");
});
