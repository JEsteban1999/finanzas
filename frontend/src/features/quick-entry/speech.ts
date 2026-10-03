"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { 0: RecognitionAlternative; isFinal: boolean; length: number };
export type RecognitionEvent = { results: ArrayLike<RecognitionResult> };

export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
export type RecognitionConstructor = new () => Recognition;

export function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, RecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function transcriptOf(event: RecognitionEvent): string {
  return Array.from(event.results)
    .map((result) => result[0].transcript)
    .join("");
}

const noopSubscribe = () => () => {};

export function useSpeech(onText: (text: string) => void) {
  // Server snapshot is false so hydration matches; the client re-reads after hydrating.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionConstructor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "es-CO";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => onText(transcriptOf(event).slice(0, 300));
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, [onText]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  return { supported, listening, start, stop };
}
