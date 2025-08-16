'use client';

import { useState, useRef } from 'react';
import { Download, Upload, FileText, Database, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type ExportFormat = 'json' | 'csv';
type ImportStatus = 'idle' | 'uploading' | 'success' | 'error';

interface ImportResult {
  success: boolean;
  imported_count: number;
  errors: string[];
}

export function DataExportImport() {
  const [exportLoading, setExportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState<ExportFormat>('json');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async (format: ExportFormat) => {
    setExportLoading(true);
    
    try {
      const response = await fetch(`/api/profile/export?format=${format}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export data');
      }

      // Parse the JSON response to get data and filename
      const responseData = await response.json();
      const { data, filename } = responseData;
      
      if (!data || !filename) {
        throw new Error('Invalid response format from server');
      }

      // Create blob from the data portion only
      const blob = new Blob([data], { 
        type: format === 'json' ? 'application/json' : 'text/csv' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to export data');
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
      setImportStatus('idle');
      
      // Auto-detect format based on file extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'csv' || extension === 'json') {
        setImportFormat(extension);
      }
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setImportStatus('uploading');
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('format', importFormat);

      const response = await fetch('/api/profile/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import data');
      }

      setImportResult(result);
      setImportStatus('success');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult({
        success: false,
        imported_count: 0,
        errors: [error instanceof Error ? error.message : 'Failed to import data']
      });
      setImportStatus('error');
    }
  };

  const clearImportResult = () => {
    setImportResult(null);
    setImportStatus('idle');
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400">
          Export your lists and data for backup, or import data from a previous export.
        </p>
      </div>

      {/* Export Section */}
      <Card variant="entertainment">
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Download className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-medium text-gray-100 mb-2">Export Data</h4>
              <p className="text-sm text-gray-400 mb-4">
                Download all your lists and items in JSON or CSV format for backup or migration.
              </p>
              <div className="flex gap-3 flex-col sm:flex-row">
                <Button
                  onClick={() => handleExport('json')}
                  disabled={exportLoading}
                  loading={exportLoading}
                  size="sm"
                >
                    <Database className="h-4 w-4 mr-2" />
                  Export as JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('csv')}
                  disabled={exportLoading}
                  loading={exportLoading}
                  size="sm"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export as CSV
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card variant="entertainment">
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Upload className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-medium text-gray-100 mb-2">Import Data</h4>
              <p className="text-sm text-gray-400 mb-4">
                Upload a previously exported file to restore your lists and items.
              </p>
              
              <div className="space-y-4">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv"
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
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        File Format
                      </label>
                      <div className="flex gap-3">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="json"
                            checked={importFormat === 'json'}
                            onChange={(e) => setImportFormat(e.target.value as ExportFormat)}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-300">JSON</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="csv"
                            checked={importFormat === 'csv'}
                            onChange={(e) => setImportFormat(e.target.value as ExportFormat)}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-300">CSV</span>
                        </label>
                      </div>
                    </div>

                    <Button
                      onClick={handleImport}
                      disabled={importStatus === 'uploading'}
                      size="sm"
                    >
                      {importStatus === 'uploading' ? (
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
                {importStatus === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                )}
                <div>
                  <h4 className={`font-medium mb-2 ${
                    importStatus === 'success' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {importStatus === 'success' ? 'Import Completed' : 'Import Failed'}
                  </h4>
                  
                  {importResult.success && (
                    <p className="text-sm text-gray-300 mb-2">
                      Successfully imported {importResult.imported_count} list(s).
                    </p>
                  )}
                  
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-400">Issues encountered:</p>
                      <ul className="text-sm text-gray-300 space-y-1">
                        {importResult.errors.slice(0, 5).map((error, index) => (
                          <li key={index} className="text-red-400">• {error}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li className="text-gray-400">... and {importResult.errors.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearImportResult}
              >
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
            <h4 className="font-medium text-yellow-400 mb-1">Important Notes</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Importing data will add to your existing lists, not replace them</li>
              <li>• Duplicate items may be created if you import the same data multiple times</li>
              <li>• Large files may take some time to process</li>
              <li>• Only JSON and CSV files exported from WatchThis are supported</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}