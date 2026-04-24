import fs from "fs";
import path from "path";

describe("vercel cron budget", () => {
  it("keeps the Hobby-plan cron count at two entries", () => {
    const vercelJsonPath = path.join(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(vercelConfig.crons).toHaveLength(1);
    expect(vercelConfig.crons?.map((cron) => cron.path)).toEqual([
      "/api/cron/daily-maintenance",
    ]);
  });
});
