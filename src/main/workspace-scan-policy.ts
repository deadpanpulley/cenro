/**
 * Workspace enumeration is intentionally anchored to the user-selected root.
 * Renderer input may still carry a legacy root argument, but it is never used
 * as an authority to enumerate another directory.
 */
export function selectedWorkspaceScanRoot(selectedWorkspaceRoot: string, _legacyRendererRoot?: unknown): string {
  if (typeof selectedWorkspaceRoot !== "string" || !selectedWorkspaceRoot.trim()) {
    throw new Error("Choose a workspace folder before scanning files.");
  }
  return selectedWorkspaceRoot;
}
