import { describe, expect, it, vi } from "vitest";
import { getRecognitionConstructor, transcriptOf } from "./speech";

describe("speech", () => {
  it("returns null without Web Speech support", () => {
    expect(getRecognitionConstructor()).toBeNull();
  });

  it("finds the prefixed constructor", () => {
    class Fake {}
    vi.stubGlobal("webkitSpeechRecognition", Fake);
    expect(getRecognitionConstructor()).toBe(Fake);
  });

  it("joins partial results", () => {
    const event = {
      results: [
        { 0: { transcript: "almorcé " }, isFinal: true, length: 1 },
        { 0: { transcript: "35 mil" }, isFinal: false, length: 1 },
      ],
    };
    expect(transcriptOf(event)).toBe("almorcé 35 mil");
  });
});
