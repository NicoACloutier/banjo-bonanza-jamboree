import { afterEach, describe, expect, it } from "vitest";
import { getAccessToken, getRefreshToken, migrateLegacyTokens } from "../lib/apiClient";

afterEach(() => localStorage.clear());

describe("migrateLegacyTokens", () => {
  it("moves logins saved under the old Banjo Tabs keys to the current ones", () => {
    localStorage.setItem("banjo_tabs_access_token", "old-access");
    localStorage.setItem("banjo_tabs_refresh_token", "old-refresh");
    migrateLegacyTokens();
    expect(getAccessToken()).toBe("old-access");
    expect(getRefreshToken()).toBe("old-refresh");
    expect(localStorage.getItem("banjo_tabs_access_token")).toBeNull();
    expect(localStorage.getItem("banjo_tabs_refresh_token")).toBeNull();
  });

  it("keeps a newer login and just drops the old one", () => {
    localStorage.setItem("bbj_access_token", "new-access");
    localStorage.setItem("banjo_tabs_access_token", "old-access");
    migrateLegacyTokens();
    expect(getAccessToken()).toBe("new-access");
    expect(localStorage.getItem("banjo_tabs_access_token")).toBeNull();
  });

  it("does nothing when there's nothing to move", () => {
    migrateLegacyTokens();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
