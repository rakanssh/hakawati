export type ChatGptSession = {
  available: boolean;
  connected: boolean;
  planUsageEnabled: boolean;
  account: { id: string; email: string | null } | null;
};
