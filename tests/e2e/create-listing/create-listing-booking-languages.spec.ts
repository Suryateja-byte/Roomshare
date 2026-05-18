import { test, expect, tags } from "../helpers/test-utils";
import { CreateListingPage } from "../page-objects/create-listing.page";

test.describe("Create Listing - Optional Metadata and Languages", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test(`${tags.auth} host selects, searches, removes, and submits household languages and gender fields`, async ({
    page,
  }) => {
    test.slow();

    const createPage = new CreateListingPage(page);
    await createPage.goto();
    await createPage.fillRequiredFields({
      title: "Language Metadata Listing",
      description:
        "This listing captures household languages and gender metadata in the submission body.",
      price: "1850",
      totalSlots: "2",
      address: "77 Language Lane",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
    });

    await createPage.searchLanguage("span");
    await createPage.selectLanguage("Spanish");
    await createPage.expectSelectedLanguage("Spanish");

    await createPage.searchLanguage("hin");
    await createPage.selectLanguage("Hindi");
    await createPage.expectSelectedLanguage("Hindi");

    await createPage.removeSelectedLanguage("Spanish");
    await createPage.expectLanguageNotSelected("Spanish");
    await createPage.expectSelectedLanguage("Hindi");

    await createPage.fillOptionalFields({
      genderPreference: "Any Gender / All Welcome",
      householdGender: "Mixed (Co-ed)",
    });

    await createPage.mockImageUpload();
    await createPage.uploadTestImage();
    await createPage.waitForUploadComplete();

    const getBodies = await createPage.mockListingApiSuccessWithCapture(
      "language-metadata-id"
    );
    await createPage.submitAndWaitForResponse();

    expect(getBodies()).toHaveLength(1);
    expect(getBodies()[0].householdLanguages).toEqual(["hi"]);
    expect(getBodies()[0].genderPreference).toBe("NO_PREFERENCE");
    expect(getBodies()[0].householdGender).toBe("MIXED");
    await createPage.expectSuccess();
  });
});
