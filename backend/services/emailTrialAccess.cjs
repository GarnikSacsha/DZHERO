function isEmailTrialLoginAllowed(env = process.env) {
  if (env.ALLOW_EMAIL_TRIAL_LOGIN === 'true') return true;
  if (env.ALLOW_EMAIL_TRIAL_LOGIN === 'false') return false;
  return env.NODE_ENV !== 'production';
}

module.exports = {
  isEmailTrialLoginAllowed,
};
