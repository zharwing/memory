import { type Project, type ProjectId } from "@aimem/core";
export interface RegistryFile {
    version: 1;
    projects: Project[];
}
export declare class ProjectRegistry {
    readonly memoryRoot: string;
    readonly registryPath: string;
    constructor(memoryRoot?: string);
    ensure(): Promise<void>;
    load(): Promise<RegistryFile>;
    save(registry: RegistryFile): Promise<void>;
    listProjects(): Promise<Project[]>;
    getProject(projectId: ProjectId): Promise<Project | undefined>;
    findByRepo(repoPath: string): Promise<Project | undefined>;
    register(project: Project): Promise<Project>;
    unregister(projectId: ProjectId): Promise<Project>;
    createModel(args: {
        name: string;
        repoPath?: string;
        slug?: string;
    }): Promise<Project>;
}
