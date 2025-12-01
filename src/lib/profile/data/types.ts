export type ExportFormat = "json" | "csv";

export interface ExportResponse {
  data: string;
  filename: string;
  isZip?: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: {
    lists: number;
    contentStatus: number;
    episodeStatus: number;
  };
  errors: string[];
}
