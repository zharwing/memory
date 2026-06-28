export function estimateTokens(content) {
    if (!content)
        return 0;
    return Math.ceil(content.trim().split(/\s+/).length * 1.35);
}
export function truncateToTokenBudget(content, maxTokens) {
    const words = content.trim().split(/\s+/);
    const maxWords = Math.floor(maxTokens / 1.35);
    if (words.length <= maxWords)
        return content;
    return `${words.slice(0, maxWords).join(" ")}\n\n[Truncated to context budget]`;
}
//# sourceMappingURL=tokens.js.map