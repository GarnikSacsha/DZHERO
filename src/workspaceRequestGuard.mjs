export function createWorkspaceRequestContext(requestWorkspaceId, requestId = 0, currentState = { workspaceId: '', generation: 0 }) {
  return {
    workspaceId: requestWorkspaceId,
    generation: currentState.workspaceId === requestWorkspaceId
      ? currentState.generation
      : currentState.generation + 1,
    requestId,
  };
}

export function isWorkspaceRequestCurrent(requestContext, currentState = { workspaceId: '', generation: 0 }, requestRef = null) {
  if (!requestContext) return false;
  if (requestContext.workspaceId !== currentState.workspaceId) return false;
  if (requestContext.generation !== currentState.generation) return false;
  return requestRef ? requestContext.requestId === requestRef.current : true;
}
