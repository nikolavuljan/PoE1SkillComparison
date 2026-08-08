import type { GemDataPayload } from "../types/data";

let dataPromise: Promise<GemDataPayload> | undefined;

export function loadGemData(): Promise<GemDataPayload> {
  dataPromise ??= fetch(`${import.meta.env.BASE_URL}gem-data.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load gem data (${response.status})`);
      return response.json() as Promise<GemDataPayload>;
    })
    .then(validatePayload);
  return dataPromise;
}

function validatePayload(payload: GemDataPayload): GemDataPayload {
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.gems)) {
    throw new Error("Unsupported or invalid PoE1 gem-data.json");
  }
  return payload;
}
