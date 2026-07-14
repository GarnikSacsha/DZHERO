export function formatTesterStatus(status, language = 'uk') {
  const labels = language === 'en'
    ? {
        pending: 'Pending first Google sign-in',
        active: 'Active',
        revoked: 'Revoked',
      }
    : {
        pending: 'Очікує першого входу через Google',
        active: 'Активний',
        revoked: 'Відкликаний',
      };
  return labels[status] || status || '—';
}

function roundTwo(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getTesterUsageRows(tester = {}) {
  const usage = tester.billing?.usage || {};
  const limits = tester.billing?.plan?.limits || {};
  const discovery = tester.discovery?.status || {};
  return [
    { key: 'aiOperations', used: Number(usage.aiOperations) || 0, limit: Number(limits.aiOperations) || 0 },
    { key: 'reelImports', used: Number(usage.reelImports) || 0, limit: Number(limits.reelImports) || 0 },
    {
      key: 'apifyDailyUsd',
      used: roundTwo(discovery.dailySpendUsd),
      limit: roundTwo(discovery.dailyBudgetUsd),
    },
  ];
}
