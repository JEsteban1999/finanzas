import { useMutation } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type DraftTransaction = Schemas["DraftTransaction"];

export function useParseTransaction() {
  return useMutation({
    mutationFn: (text: string) => unwrap(api.POST("/api/ai/parse-transaction", { body: { text } })),
  });
}
