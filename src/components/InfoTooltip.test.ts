import { describe, expect, it } from "vitest";
import { formatTooltipCooldown, poedbUrl, poeWikiUrl } from "./InfoTooltip";

describe("PoEDB skill links", () => {
  it("uses PoEDB's underscore-separated skill slug", () => {
    expect(poedbUrl("Ice Nova of Frostbolts")).toBe("https://poedb.tw/us/Ice_Nova_of_Frostbolts");
    expect(poedbUrl("Fireball")).toBe("https://poedb.tw/us/Fireball");
  });

  it("uses PoE Wiki as the normal-click destination", () => {
    expect(poeWikiUrl("Ice Nova of Frostbolts")).toBe("https://www.poewiki.net/wiki/Ice_Nova_of_Frostbolts");
    expect(poeWikiUrl("Fireball")).toBe("https://www.poewiki.net/wiki/Fireball");
  });
});

describe("tooltip cooldowns", () => {
  it("includes multiple stored uses without changing cooldown math", () => {
    expect(formatTooltipCooldown(8, 3)).toBe("8.00 sec (3 uses)");
    expect(formatTooltipCooldown(1, 1)).toBe("1.00 sec");
  });
});
