function canAccessWorkspace(user = {}, workspaceId = '') {
  if (!user || !workspaceId) return false;
  if (user.role === 'admin') return true;
  if (user.workspaceId === workspaceId) return true;
  return Array.isArray(user.workspaceIds) && user.workspaceIds.includes(workspaceId);
}

function publicWorkspace(workspace = {}) {
  return {
    id: workspace.id,
    name: workspace.name,
    owner: workspace.owner || '',
    mode: workspace.mode || '',
    marketFocus: Array.isArray(workspace.marketFocus) ? workspace.marketFocus : [],
    createdAt: workspace.createdAt || null,
  };
}

function getUserWorkspaces(db = {}, user = {}) {
  const workspaces = Array.isArray(db.workspaces) ? db.workspaces : [];
  const accessible = workspaces.filter((workspace) => canAccessWorkspace(user, workspace.id));
  const primaryId = user?.workspaceId || '';
  return accessible
    .sort((left, right) => {
      if (left.id === primaryId) return -1;
      if (right.id === primaryId) return 1;
      return 0;
    })
    .map(publicWorkspace);
}

function buildAuthWorkspacePayload(db = {}, user = {}, publicUser = (value) => value) {
  return {
    user: publicUser(user),
    workspaces: getUserWorkspaces(db, user),
  };
}

module.exports = {
  buildAuthWorkspacePayload,
  canAccessWorkspace,
  getUserWorkspaces,
  publicWorkspace,
};
