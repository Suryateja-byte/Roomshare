/**
 * Deterministic Search Release Gate - API contract checks
 *
 * Validates that the server-side scenario header still yields stable typed
 * metadata for the list and map API surfaces.
 */

import { test, expect } from "@playwright/test";
import {
  SEARCH_SCENARIO_HEADER,
  defaultSearchUrl,
  isSearchReleaseGateEnabled,
  isSearchReleaseGateProject,
  type SearchScenario,
  scenarioHeaders,
} from "../helpers/search-release-gate-helpers";

const scenarios: SearchScenario[] = [
  "default-results",
  "v2-fails-v1-succeeds",
  "map-empty",
];

function gateProject(projectName: string) {
  test.skip(
    !isSearchReleaseGateProject(projectName),
    "Search release gate runs only on chromium, webkit, and Mobile Safari"
  );
}

function gateScenarioMode() {
  test.skip(
    !isSearchReleaseGateEnabled(),
    "Enable the deterministic search seam with ENABLE_SEARCH_TEST_SCENARIOS=true"
  );
}

function gateClientSideSearchMode() {
  test.skip(
    process.env.ENABLE_CLIENT_SIDE_SEARCH !== "true",
    "List API release-gate checks run only when ENABLE_CLIENT_SIDE_SEARCH=true"
  );
}

test.beforeEach(async ({}, testInfo) => {
  gateProject(testInfo.project.name);
  gateScenarioMode();
  gateClientSideSearchMode();
});

test.describe("Search release gate - API", () => {
  for (const scenario of scenarios) {
    test(`list and map APIs honor ${scenario}`, async ({ request }) => {
      const headers = scenarioHeaders(scenario);
      expect(headers[SEARCH_SCENARIO_HEADER]).toBe(scenario);
      const url = defaultSearchUrl();

      const listResponse = await request.get(`/api/search/listings${url.slice(
        "/search".length
      )}`, {
        headers,
      });

      if (listResponse.status() === 429) {
        test.skip(true, "Search API was rate-limited in this run");
        return;
      }

      expect(listResponse.ok()).toBeTruthy();
      const listBody = await listResponse.json();
      expect(listBody.meta).toBeTruthy();
      expect(listBody.meta.queryHash).toBeTruthy();

      if (scenario === "v2-fails-v1-succeeds") {
        expect(listBody.kind === "degraded" || listBody.kind === "ok").toBe(
          true
        );
      }

      const mapResponse = await request.get(`/api/map-listings${url.slice(
        "/search".length
      )}`, {
        headers: {
          ...headers,
          "x-search-query-hash": listBody.meta.queryHash,
        },
      });

      if (mapResponse.status() === 429) {
        test.skip(true, "Map API was rate-limited in this run");
        return;
      }

      expect(mapResponse.ok()).toBeTruthy();
      const mapBody = await mapResponse.json();
      expect(mapBody.meta).toBeTruthy();
      expect(mapBody.meta.queryHash).toBe(listBody.meta.queryHash);
      expect(
        mapBody.meta.backendSource ||
          mapBody.meta.responseVersion ||
          mapBody.kind
      ).toBeTruthy();

      if (scenario === "map-empty") {
        expect(mapBody.kind === "ok" || mapBody.kind === "zero-results").toBe(
          true
        );
      }

    });
  }
});
