export interface LocalModelRecord {
  id: string;
  name: string;
  path: string;
  sizeBytes?: number;
  installed: boolean;
}

export interface RuntimeInstallPlan {
  runtime: "llama.cpp-compatible";
  supported: boolean;
  willDownloadRuntime: boolean;
  willDownloadModel: boolean;
  modelId?: string;
  installRoot: string;
  note: string;
}

export function previewRuntimeInstall(args: { installRoot: string; modelId?: string }): RuntimeInstallPlan {
  return {
    runtime: "llama.cpp-compatible",
    supported: false,
    willDownloadRuntime: false,
    willDownloadModel: false,
    modelId: args.modelId,
    installRoot: args.installRoot,
    note: "App-managed downloads are not supported. Configure LM Studio, Ollama, llama.cpp server, or another provider endpoint instead."
  };
}
