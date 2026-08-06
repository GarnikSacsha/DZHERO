export function getProductAdaptationRequestIdentity({ workspaceId = '', signalId = '', brandRevision = '' } = {}) {
  return `${workspaceId}:${signalId}:${brandRevision}`;
}

export function isCurrentProductAdaptationRequest({
  requestRevision,
  currentRevision,
  requestIdentity,
  currentIdentity,
} = {}) {
  return requestRevision === currentRevision && requestIdentity === currentIdentity;
}
