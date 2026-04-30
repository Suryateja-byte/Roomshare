import fs from "fs";
import path from "path";

describe("vercel cron budget", () => {
  it("keeps one Hobby-compatible daily dispatcher cron", () => {
    const vercelJsonPath = path.join(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(vercelConfig.crons).toHaveLength(1);
    expect(vercelConfig.crons?.map((cron) => cron.path)).toEqual([
      "/api/cron/daily-maintenance",
    ]);
    expect(vercelConfig.crons?.[0]?.schedule).toBe("2 9 * * *");
  });
});
