export function getProductContentPlanIdentity({ workspaceId = '', brandId = '' } = {}) {
  return `${String(workspaceId || '').trim()}::${String(brandId || '').trim()}`;
}

export function isCurrentProductContentPlanResponse({ requestIdentity, currentIdentity, cancelled = false } = {}) {
  return !cancelled && Boolean(requestIdentity) && requestIdentity === currentIdentity;
}
