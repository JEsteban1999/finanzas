"use client";

import { Mic, Square, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type TransactionSaved, useCreateTransaction } from "@/features/transactions/api";
import { SaveFeedback } from "@/features/transactions/SaveFeedback";
import { TransactionForm, type TransactionFormValues } from "@/features/transactions/TransactionForm";
import { type DraftTransaction, useParseTransaction } from "./api";
import { useSpeech } from "./speech";

type Step =
  | { name: "entry"; error: unknown }
  | { name: "form"; draft: DraftTransaction | null; notice: string | null; source: "voice" | "manual" }
  | { name: "saved"; result: TransactionSaved };

export function RegisterFlow() {
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ name: "entry", error: null });
  const parse = useParseTransaction();
  const create = useCreateTransaction();
  const speech = useSpeech(setText);

  async function interpret(event: FormEvent) {
    event.preventDefault();
    try {
      const draft = await parse.mutateAsync(text.trim());
      setStep({ name: "form", draft, notice: null, source: "voice" });
    } catch (error) {
      if (error instanceof ApiError && error.code === "AI_UNAVAILABLE") {
        setStep({ name: "form", draft: null, notice: messageFor(error), source: "manual" });
      } else {
        setStep({ name: "entry", error });
      }
    }
  }

  async function save(values: TransactionFormValues, source: "voice" | "manual") {
    const result = await create.mutateAsync({ ...values, source });
    setStep({ name: "saved", result });
  }

  if (step.name === "saved") {
    return (
      <SaveFeedback
        result={step.result}
        onDone={() => {
          setText("");
          setStep({ name: "entry", error: null });
        }}
      />
    );
  }

  if (step.name === "form") {
    const draft = step.draft;
    return (
      <div className="card stack animate-[rise_320ms_cubic-bezier(0.2,0.8,0.2,1)]">
        {step.notice && <p role="note">{step.notice}</p>}
        {text.trim() && <p className="muted font-semibold">Dijiste: {text.trim()}</p>}
        <TransactionForm
          initial={draft ?? {}}
          missingFields={draft?.missing_fields ?? []}
          submitLabel="Guardar"
          onSubmit={(values) => save(values, step.source)}
          onCancel={() => setStep({ name: "entry", error: null })}
        />
      </div>
    );
  }

  return (
    <form onSubmit={interpret} className="card stack">
      <label>
        Cuéntame el movimiento
        <textarea
          value={text}
          maxLength={300}
          rows={4}
          className="!text-xl !leading-snug"
          placeholder="almorcé 35 mil con la débito"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="actions">
        {speech.supported && (
          <button
            type="button"
            aria-pressed={speech.listening}
            className={speech.listening ? "!bg-[var(--mora)] !text-[var(--mora-ink)]" : "btn-soft"}
            onClick={speech.listening ? speech.stop : speech.start}
          >
            {speech.listening ? <Square aria-hidden size={18} /> : <Mic aria-hidden size={20} strokeWidth={2.5} />}
            {speech.listening ? "Detener" : "Dictar"}
          </button>
        )}
        <button type="submit" disabled={!text.trim() || parse.isPending} className="flex-1">
          <Sparkles aria-hidden size={20} strokeWidth={2.5} />
          {parse.isPending ? "Interpretando…" : "Interpretar"}
        </button>
        <button type="button" onClick={() => setStep({ name: "form", draft: null, notice: null, source: "manual" })}>
          Registrar a mano
        </button>
      </div>
      <FormError error={step.error} />
    </form>
  );
}
