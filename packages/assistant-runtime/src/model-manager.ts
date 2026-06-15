export interface LocalModelRecord {
  id: string;
  name: string;
  path: string;
  sizeBytes?: number;
  installed: boolean;
}

export interface RuntimeInstallPlan {
  runtime: "llama.cpp-compatible";
  willDownloadRuntime: boolean;
  willDownloadModel: boolean;
  modelId?: string;
  installRoot: string;
  note: string;
}

export function previewRuntimeInstall(args: { installRoot: string; modelId?: string }): RuntimeInstallPlan {
  return {
    runtime: "llama.cpp-compatible",
    willDownloadRuntime: true,
    willDownloadModel: Boolean(args.modelId),
    modelId: args.modelId,
    installRoot: args.installRoot,
    note: "Preview only. Runtime/model download is intentionally not performed by this implementation without explicit dependency/network work."
  };
}
