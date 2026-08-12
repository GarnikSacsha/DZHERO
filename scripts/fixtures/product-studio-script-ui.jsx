import React from 'react';
import { createRoot } from 'react-dom/client';

import ProductStudioPreview from '../../src/components/ProductStudioPreview.jsx';
import { I18nProvider } from '../../src/i18nProvider.mjs';
import '../../src/styles.css';

const fixture = window.__DZHERO_PRODUCT_STUDIO_FIXTURE__;
if (!fixture?.signal || !fixture?.adaptation) {
  throw new Error('product_studio_fixture_missing');
}

createRoot(document.getElementById('root')).render(
  <I18nProvider initialLanguage="en">
    <ProductStudioPreview
      signal={fixture.signal}
      adaptationState={{ status: 'ready', adaptation: fixture.adaptation, errorCode: '' }}
      onRetryAdaptation={() => {
        window.__DZHERO_GROUNDED_RETRY_COUNT__ = (window.__DZHERO_GROUNDED_RETRY_COUNT__ || 0) + 1;
      }}
      onAddToPlan={() => {}}
    />
  </I18nProvider>,
);
