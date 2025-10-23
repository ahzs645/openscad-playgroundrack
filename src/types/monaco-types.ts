// Extracted Monaco types to avoid bundling the entire Monaco editor
// These are duplicated from monaco-editor to prevent it from being included in the main bundle

export enum MarkerSeverity {
  Hint = 1,
  Info = 2,
  Warning = 4,
  Error = 8,
}

export interface IMarkerData {
  code?: string | {
    value: string;
    target: any;
  };
  severity: MarkerSeverity;
  message: string;
  source?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  relatedInformation?: any[];
  tags?: any[];
}
