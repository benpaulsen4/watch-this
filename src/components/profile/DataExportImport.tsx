"use client";

import { useState, useRef } from "react";
import {
  Download,
  Upload,
  FileText,
  Database,
  AlertCircle,
  CheckCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useMutation } from "@tanstack/react-query";

type ExportFormat = "json" | "csv";
type ImportStatus = "idle" | "uploading" | "success" | "error";

interface ImportResult {
  success: boolean;
  imported: {
    lists: number;
    contentStatus: number;
    episodeStatus: number;
  };
  errors: string[];
}

export function DataExportImport() {
  const [exportLoading, setExportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Import is now JSON-only, no format selection needed
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportMutation = useMutation({
    mutationFn: async (format: ExportFormat) => {
      const response = await fetch(`/api/profile/export?format=${format}`);
      const responseData = await response.json();
      if (!response.ok)
        throw new Error(responseData.error || "Failed to export data");
      return responseData as { data: string; filename: string; isZip: boolean };
    },
    onSuccess: ({ data, filename, isZip }) => {
      let blob: Blob;
      if (isZip) {
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++)
          bytes[i] = binaryString.charCodeAt(i);
        blob = new Blob([bytes], { type: "application/zip" });
      } else {
        blob = new Blob([data], { type: "application/json" });
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error: unknown) => {
      console.error("Export failed:", error);
      alert(error instanceof Error ? error.message : "Failed to export data");
    },
    onSettled: () => setExportLoading(false),
  });

  const handleExport = async (format: ExportFormat) => {
    setExportLoading(true);
    try {
      await exportMutation.mutateAsync(format);
    } catch {
      // Error surfaced via onError alert; swallow to avoid unhandled rejection
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate that it's a JSON file
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "json") {
        alert("Only JSON files are supported for import.");
        return;
      }

      setSelectedFile(file);
      setImportResult(null);
      setImportStatus("idle");
    }
  };

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", "json");
      const response = await fetch("/api/profile/import", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Failed to import data");
      return result as ImportResult;
    },
    onSuccess: (result) => {
      setImportResult(result);
      setImportStatus("success");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (error: unknown) => {
      console.error("Import failed:", error);
      setImportResult({
        success: false,
        imported: { lists: 0, contentStatus: 0, episodeStatus: 0 },
        errors: [
          error instanceof Error ? error.message : "Failed to import data",
        ],
      });
      setImportStatus("error");
    },
  });

  const handleImport = async () => {
    if (!selectedFile) return;
    setImportStatus("uploading");
    setImportResult(null);
    try {
      await importMutation.mutateAsync(selectedFile);
    } catch {
      // Error handled via onError; swallow to avoid unhandled rejection
    }
  };

  const clearImportResult = () => {
    setImportResult(null);
    setImportStatus("idle");
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400">
          Export your lists and data for backup, or import data from a previous
          export.
        </p>
      </div>

      {/* Export Section */}
      <Card variant="outline">
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Download className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-medium text-gray-100 mb-2">
                Export Data
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Download all your data in JSON format or as a ZIP file
                containing CSV files for backup or migration.
              </p>
              <div className="flex gap-3 flex-col sm:flex-row">
                <Button
                  onClick={() => handleExport("json")}
                  disabled={exportLoading}
                  loading={exportLoading}
                  size="sm"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Export as JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport("csv")}
                  disabled={exportLoading}
                  loading={exportLoading}
                  size="sm"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export as ZIP (CSV files)
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card variant="outline">
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Upload className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-medium text-gray-100 mb-2">
                Import Data
              </h4>
              <p className="text-sm text-gray-400 mb-4">
                Upload a previously exported JSON file to restore your lists,
                content status, and episode watch history.
              </p>

              <div className="space-y-4">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="import-file"
                  />
                  <label
                    htmlFor="import-file"
                    className="inline-flex items-center px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </label>
                  {selectedFile && (
                    <span className="ml-3 text-sm text-gray-300">
                      {selectedFile.name}
                    </span>
                  )}
                </div>

                {selectedFile && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleImport}
                      disabled={importStatus === "uploading"}
                      size="sm"
                    >
                      {importStatus === "uploading" ? (
                        <LoadingSpinner size="sm" className="mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Import Data
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Results */}
      {importResult && (
        <Card variant="entertainment">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {importStatus === "success" ? (
                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                )}
                <div>
                  <h4
                    className={`font-medium mb-2 ${
                      importStatus === "success"
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {importStatus === "success"
                      ? "Import Completed"
                      : "Import Failed"}
                  </h4>

                  {importResult.success && (
                    <div className="text-sm text-gray-300 mb-2 space-y-1">
                      <p>Successfully imported:</p>
                      <ul className="ml-4 space-y-1">
                        <li>• {importResult.imported.lists} list(s)</li>
                        <li>
                          • {importResult.imported.contentStatus} content status
                          entries
                        </li>
                        <li>
                          • {importResult.imported.episodeStatus} episode watch
                          entries
                        </li>
                      </ul>
                    </div>
                  )}

                  {importResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-400">
                        Issues encountered:
                      </p>
                      <ul className="text-sm text-gray-300 space-y-1">
                        {importResult.errors.slice(0, 5).map((error, index) => (
                          <li key={index} className="text-red-400">
                            • {error}
                          </li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li className="text-gray-400">
                            ... and {importResult.errors.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearImportResult}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-yellow-400 mb-1">
              Important Notes
            </h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>
                • Importing data will add to your existing data, not replace it
              </li>
              <li>
                • Duplicate items may be created if you import the same data
                multiple times
              </li>
              <li>• Large files may take some time to process</li>
              <li>
                • Only JSON files exported from WatchThis are supported for
                import
              </li>
              <li>
                • CSV exports are provided as ZIP files containing separate CSV
                files for different data types
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
