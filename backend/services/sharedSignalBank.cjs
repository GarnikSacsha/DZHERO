'use strict';

const SHARED_SIGNAL_CURATION_APPROVED = 'approved';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLimit(value, fallback = 250) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1000, Math.max(1, Math.floor(parsed)));
}

function getUserWorkspaceIds(user = {}) {
  return Array.from(new Set([
    user.workspaceId,
    ...(Array.isArray(user.workspaceIds) ? user.workspaceIds : []),
  ].filter(Boolean)));
}

function resolveSharedSignalBankWorkspace(db = {}, options = {}) {
  const workspaces = Array.isArray(db.workspaces) ? db.workspaces : [];
  const reels = Array.isArray(db.reels) ? db.reels : [];
  const explicitWorkspaceId = String(options.workspaceId || '').trim();
  if (explicitWorkspaceId && workspaces.some((workspace) => workspace.id === explicitWorkspaceId)) {
    return explicitWorkspaceId;
  }

  const ownerEmail = normalizeEmail(options.ownerEmail);
  if (!ownerEmail) return '';
  const owner = (Array.isArray(db.users) ? db.users : [])
    .find((user) => normalizeEmail(user.email) === ownerEmail);
  if (!owner) return '';

  return getUserWorkspaceIds(owner)
    .filter((workspaceId) => workspaces.some((workspace) => workspace.id === workspaceId))
    .sort((left, right) => (
      reels.filter((reel) => reel.workspaceId === right).length
      - reels.filter((reel) => reel.workspaceId === left).length
    ))[0] || '';
}

function isSharedSignalBankPlan(entitlements = {}) {
  return entitlements?.plan?.id === 'trial';
}

function isApprovedSharedSignal(reel = {}) {
  return String(reel.curationStatus || '').trim().toLowerCase()
    === SHARED_SIGNAL_CURATION_APPROVED
    && reel.importedMetadata?.qualityGate?.admittedToBank !== false;
}

function projectSharedSignal(reel = {}, targetWorkspaceId = '') {
  const sharedSourceId = String(reel.id || '').trim();
  const stableId = sharedSourceId || String(reel.sourceUrl || reel.title || 'signal')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
    || 'signal';
  const projected = {
    ...reel,
    id: `shared_${stableId}`,
    workspaceId: targetWorkspaceId,
    sharedBank: true,
    sharedSourceId,
  };
  delete projected.remixResult;
  delete projected.workspaceNotes;
  delete projected.privateNotes;
  delete projected.curationStatus;
  return projected;
}

function buildSharedSignalBankReels(db = {}, options = {}) {
  const targetWorkspaceId = String(options.targetWorkspaceId || '').trim();
  const sourceWorkspaceId = resolveSharedSignalBankWorkspace(db, options);
  if (!targetWorkspaceId || !sourceWorkspaceId || sourceWorkspaceId === targetWorkspaceId) {
    return {
      sourceWorkspaceId,
      reels: [],
      sourceSignalCount: 0,
      archivedSignalCount: 0,
    };
  }
  const limit = normalizeLimit(options.limit);
  const sourceReels = (Array.isArray(db.reels) ? db.reels : [])
    .filter((reel) => reel.workspaceId === sourceWorkspaceId);
  const approvedReels = sourceReels.filter(isApprovedSharedSignal);
  const reels = approvedReels
    .sort((left, right) => {
      const scoreDelta = (Number(right.score) || 0) - (Number(left.score) || 0);
      if (scoreDelta) return scoreDelta;
      return (Date.parse(right.updatedAt || right.createdAt || '') || 0)
        - (Date.parse(left.updatedAt || left.createdAt || '') || 0);
    })
    .slice(0, limit)
    .map((reel) => projectSharedSignal(reel, targetWorkspaceId));
  return {
    sourceWorkspaceId,
    reels,
    sourceSignalCount: sourceReels.length,
    archivedSignalCount: sourceReels.length - approvedReels.length,
  };
}

module.exports = {
  SHARED_SIGNAL_CURATION_APPROVED,
  buildSharedSignalBankReels,
  isApprovedSharedSignal,
  isSharedSignalBankPlan,
  normalizeLimit,
  projectSharedSignal,
  resolveSharedSignalBankWorkspace,
};
