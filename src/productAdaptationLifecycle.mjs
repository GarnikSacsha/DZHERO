export function getProductAdaptationRequestIdentity({
  workspaceId = '',
  signalId = '',
  brandRevision = '',
  targetLanguage = '',
} = {}) {
  return [workspaceId, signalId, brandRevision, targetLanguage].filter((value, index) => index < 3 || value).join(':');
}

export function isCurrentProductAdaptationRequest({
  requestRevision,
  currentRevision,
  requestIdentity,
  currentIdentity,
} = {}) {
  return requestRevision === currentRevision && requestIdentity === currentIdentity;
}
