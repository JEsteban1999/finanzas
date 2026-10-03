import { useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type MonthlySummaryData = Schemas["MonthlySummary"];
export type CompareData = Schemas["CompareOut"];

export function useMonthlySummary(month: string) {
  return useQuery({
    queryKey: ["dashboard", "monthly", month],
    queryFn: () => unwrap(api.GET("/api/dashboard/monthly", { params: { query: { month } } })),
  });
}

export function useCompare(months: number, until: string) {
  return useQuery({
    queryKey: ["dashboard", "compare", months, until],
    queryFn: () =>
      unwrap(api.GET("/api/dashboard/compare", { params: { query: { months, until } } })),
  });
}
