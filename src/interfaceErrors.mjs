const CODE_TO_KEY = Object.freeze({
  plan_limit_reached: 'errors.planLimit',
  content_plan_save_failed: 'errors.contentPlanSave',
  brand_brain_save_failed: 'errors.brandBrainSave',
  auto_import_failed: 'errors.signalImport',
  youtube_popular_failed: 'errors.youtubePopular',
  apify_import_failed: 'errors.apifyImport',
  signal_discovery_status_failed: 'errors.discoveryStatus',
  signal_discovery_toggle_failed: 'errors.discoveryToggle',
  automatic_discovery_running: 'errors.discoveryRunning',
  automatic_budget_reached: 'errors.discoveryBudget',
  automatic_discovery_run_failed: 'errors.discoveryRun',
  remix_generation_failed: 'errors.remixGeneration',
  daily_remix_limit_reached: 'errors.dailyRemixLimit',
  daily_agent_chat_limit_reached: 'errors.dailyAgentChatLimit',
  trial_expired: 'errors.trialExpired',
  ai_provider_not_configured: 'errors.aiProviderNotConfigured',
  ai_provider_failed: 'errors.aiProviderFailed',
  ai_provider_capacity_reached: 'errors.aiProviderCapacity',
  agent_error: 'errors.assistant',
  video_jobs_failed: 'errors.videoJobs',
  video_job_failed: 'errors.videoJob',
  idea_save_failed: 'errors.ideaSave',
  select_plan_failed: 'errors.selectPlan',
  meta_not_configured: 'errors.instagramNotConfigured',
  demo_error: 'errors.demoLogin',
  email_auth_failed: 'errors.emailLogin',
  request_failed: 'errors.generic',
  unknown_error: 'errors.generic',
});

export function extractInterfaceErrorCode(value, fallbackCode = 'unknown_error') {
  const candidates = [value?.error, value?.code, value instanceof Error ? value.message : value];
  const code = candidates.find(
    (candidate) => typeof candidate === 'string' && Object.hasOwn(CODE_TO_KEY, candidate),
  );
  return code || fallbackCode;
}

export function localizeInterfaceError(value, t, fallbackKey = 'errors.generic', parameters) {
  const code = extractInterfaceErrorCode(value);
  return t(CODE_TO_KEY[code] || fallbackKey, parameters);
}
