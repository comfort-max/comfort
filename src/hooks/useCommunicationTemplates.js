import { useQuery } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";

export function useCommunicationTemplates(enabled = true) {
  return useQuery({
    queryKey: ["communication-templates"],
    queryFn: () => db.CommunicationTemplate.list(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
