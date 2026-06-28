export interface AimemClientOptions {
    baseUrl?: string;
    authToken?: string;
}
export declare class AimemClient {
    readonly baseUrl: string;
    readonly authToken: string;
    constructor(options?: AimemClientOptions);
    call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    health(): Promise<unknown>;
    listProjects(): Promise<unknown>;
    getStartupState(params: Record<string, unknown>): Promise<unknown>;
    getContextBundle(params: Record<string, unknown>): Promise<unknown>;
}
