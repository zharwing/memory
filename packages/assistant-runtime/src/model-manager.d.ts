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
export declare function previewRuntimeInstall(args: {
    installRoot: string;
    modelId?: string;
}): RuntimeInstallPlan;
