export function previewRuntimeInstall(args) {
    return {
        runtime: "llama.cpp-compatible",
        willDownloadRuntime: true,
        willDownloadModel: Boolean(args.modelId),
        modelId: args.modelId,
        installRoot: args.installRoot,
        note: "Preview only. Runtime/model download is intentionally not performed by this implementation without explicit dependency/network work."
    };
}
//# sourceMappingURL=model-manager.js.map