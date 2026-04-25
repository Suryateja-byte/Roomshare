/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

import fs from "node:fs";
import path from "node:path";
import { PUBLIC_AUTOCOMPLETE_SELECT_SQL } from "@/lib/geocoding/public-autocomplete";
import { publicListingDetailSelect } from "@/lib/listings/public-detail";
import {
  findForbiddenPublicPayloadKeys,
  PUBLIC_PAYLOAD_FORBIDDEN_KEYS,
} from "@/lib/privacy/public-read-contract";

describe("Phase 05 public read privacy contract", () => {
  it("detects forbidden public payload keys recursively", () => {
    expect(
      findForbiddenPublicPayloadKeys({
        id: "listing-1",
        location: { city: "Austin", exact_point: "POINT(-97 30)" },
        owner: { name: "Host", phoneNumber: "+15551234567" },
      })
    ).toEqual(["exact_point", "phoneNumber"]);
  });

  it("keeps public listing detail select free of exact location and contact fields", () => {
    expect(findForbiddenPublicPayloadKeys(publicListingDetailSelect)).toEqual([]);
    expect(publicListingDetailSelect.location).toEqual({
      select: {
        city: true,
        state: true,
      },
    });
    expect(publicListingDetailSelect.owner.select).not.toHaveProperty("email");
  });

  it("keeps public autocomplete SQL projection-safe", () => {
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/loc\.address/i);
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/loc\.zip/i);
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/loc\.coords/i);
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/exact_point/i);
  });

  it("keeps Phase 04 projection search source away from forbidden private columns", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/search/projection-search.ts"),
      "utf8"
    );

    for (const key of PUBLIC_PAYLOAD_FORBIDDEN_KEYS) {
      expect(source).not.toContain(key);
    }
  });
});
