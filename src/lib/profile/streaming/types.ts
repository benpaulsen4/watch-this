export interface StreamingPreferences {
  country: string | null;
  providers: Array<{
    id: number;
    name?: string | null;
    logoPath?: string | null;
    region: string;
  }>;
}

export interface SaveStreamingPreferencesRequest {
  country?: string;
  region?: string;
  providers?: Array<{
    providerId: number;
    providerName?: string;
    logoPath?: string | null;
  }>;
}
