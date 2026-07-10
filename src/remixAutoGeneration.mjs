function getRemixSourceKey(reel = {}) {
  return String(reel.id || reel.sourceUrl || reel.title || '').trim();
}

export function createRemixAutoRequest(previousId = 0, reel = {}) {
  return {
    id: Number(previousId || 0) + 1,
    sourceKey: getRemixSourceKey(reel),
  };
}

export function shouldRunRemixAutoRequest({ request, lastHandledId = 0, workspaceId = '' } = {}) {
  return Boolean(
    workspaceId
    && request?.id
    && request.sourceKey
    && request.id !== lastHandledId
  );
}

export { getRemixSourceKey };
