import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillComparisonProfile } from "../calc/profiles";
import type { SkillSettings, SkillView } from "../types/app";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => host.remove());

  it("starts without modifier controls and permits duplicate setting types", async () => {
    const root = createRoot(host);

    function Harness() {
      const [settings, setSettings] = useState<SkillSettings>({ settingDescription: "", modifiers: [] });
      return <table><tbody><SettingsPanel view={view()} settings={settings} colSpan={1} onChange={setSettings} /></tbody></table>;
    }

    await act(async () => root.render(<Harness />));
    expect(host.querySelectorAll(".modifier-setting")).toHaveLength(0);

    await addSetting(host, "More damage %");
    await addSetting(host, "More damage %");
    expect(host.querySelectorAll(".modifier-setting")).toHaveLength(2);

    await act(async () => host.querySelector<HTMLButtonElement>(".remove-setting")!.click());
    expect(host.querySelectorAll(".modifier-setting")).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it("shows active profile values and stores edits as resettable overrides", async () => {
    const root = createRoot(host);
    const profile: SkillComparisonProfile = {
      id: "BallLightning",
      label: "Overlap",
      modifiers: [{ id: "profile:BallLightning:overlap:hits", type: "hit_count", value: 8 }]
    };

    function Harness() {
      const [settings, setSettings] = useState<SkillSettings>({ settingDescription: "", modifiers: [] });
      return <table><tbody><SettingsPanel view={view()} settings={settings} profile={profile} defaultDescription="Maximum overlap." colSpan={1} onChange={setSettings} /></tbody></table>;
    }

    await act(async () => root.render(<Harness />));
    const input = host.querySelector<HTMLInputElement>(".profile-setting input")!;
    expect(host.querySelector<HTMLInputElement>(".setting-description input")?.value).toBe("Maximum overlap.");
    expect(input.value).toBe("8");
    expect(host.querySelector(".profile-setting b")?.textContent).toBe("Profile");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      valueSetter.call(input, "6");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector<HTMLInputElement>(".edited-profile-setting input")?.value).toBe("6");

    await act(async () => host.querySelector<HTMLButtonElement>(".reset-profile-setting")!.click());
    expect(host.querySelector<HTMLInputElement>(".profile-setting input")?.value).toBe("8");
    expect(host.querySelector(".reset-profile-setting")).toBeNull();

    await act(async () => {
      input.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      valueSetter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.blur());
    expect(host.querySelector<HTMLInputElement>(".edited-profile-setting input")?.value).toBe("0");

    await act(async () => root.unmount());
  });

  it("keeps a cleared draft empty while typing and only commits zero on blur", async () => {
    const root = createRoot(host);
    const profile: SkillComparisonProfile = {
      id: "DivineIre",
      label: "Release",
      modifiers: [{ id: "profile:DivineIre:baseline:damage", type: "more_damage", value: 227 }]
    };

    function Harness() {
      const [settings, setSettings] = useState<SkillSettings>({ settingDescription: "", modifiers: [] });
      return <table><tbody><SettingsPanel view={view()} settings={settings} profile={profile} defaultDescription="Perfect release." colSpan={1} onChange={setSettings} /></tbody></table>;
    }

    await act(async () => root.render(<Harness />));
    const input = host.querySelector<HTMLInputElement>(".profile-setting input")!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      input.focus();
      valueSetter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("");

    await act(async () => {
      valueSetter.call(input, "25");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector<HTMLInputElement>(".edited-profile-setting input")?.value).toBe("25");

    await act(async () => root.unmount());
  });
});

async function addSetting(host: HTMLElement, label: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(".add-setting-button")!.click());
  const choice = [...host.querySelectorAll<HTMLButtonElement>(".modifier-menu button")]
    .find((button) => button.textContent === label);
  expect(choice).toBeDefined();
  await act(async () => choice!.click());
}

function view(): SkillView {
  const ability: SkillView["ability"] = { role: "primary", id: "Arc", name: "Arc", castTime: .7, customScaling: [], quality: [] };
  return {
    key: "Arc",
    gem: {
      id: "Arc",
      gameId: "Arc",
      familyId: "Arc",
      name: "Arc",
      baseTypeName: "Arc",
      category: "spell",
      tags: ["spell"],
      abilities: [ability],
      hasDirectDamage: true
    },
    ability,
    searchText: "arc",
    flags: []
  };
}
