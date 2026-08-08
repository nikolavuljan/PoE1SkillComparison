import { describe, expect, it } from "vitest";
import { defaultSkillSettings } from "../data/storage";
import { settingNotes } from "./SettingsTooltip";

describe("custom setting notes", () => {
  it("stays hidden for an untouched skill", () => {
    expect(settingNotes(defaultSkillSettings)).toEqual([]);
  });

  it("describes changed hit and damage settings", () => {
    expect(settingNotes({
      settingDescription: "7 chains, each giving 50% more damage.",
      modifiers: [
        { id: "hits", type: "hit_count", value: 3 },
        { id: "more", type: "more_damage", value: 20 },
        { id: "cast", type: "override_cast_time", value: .65 },
        { id: "es", type: "maximum_energy_shield", value: 15000 }
      ]
    })).toEqual([
      "7 chains, each giving 50% more damage.",
      "3 hits per use.",
      "+20% more damage.",
      "Base cast time overridden to 0.65 seconds.",
      "15,000 maximum Energy Shield."
    ]);
  });

  it("summarizes duplicate multiplicative and additive modifiers", () => {
    expect(settingNotes({ settingDescription: "", modifiers: [
      { id: "more-1", type: "more_damage", value: 50 },
      { id: "more-2", type: "more_damage", value: 20 },
      { id: "added-1", type: "added_damage", value: 10 },
      { id: "added-2", type: "added_damage", value: 15 }
    ] })).toEqual([
      "+50% × +20% more damage modifiers (+80% combined).",
      "25 total custom added flat damage per hit from 2 modifiers."
    ]);
  });

  it("shows a global default description when the user has not edited it", () => {
    expect(settingNotes({ settingDescription: "", modifiers: [] }, "Default skill description.")).toEqual([
      "Default skill description."
    ]);
  });
});
