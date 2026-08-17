export const PRODUCT_DISCOVER_PREVIEW_PATH = '/?preview=product&tab=discover';

export function resolveDefaultProductEntry({
  pathname = '/',
  search = '',
  defaultPreviewEnabled = false,
  controlledLiveRunEnabled = false,
} = {}) {
  if (!defaultPreviewEnabled && !controlledLiveRunEnabled) return '';
  if (pathname !== '/') return '';
  const params = new URLSearchParams(search);
  if (params.has('preview')) return '';
  return PRODUCT_DISCOVER_PREVIEW_PATH;
}

export function resolveAuthFailureProductEntry({
  pathname = '/',
  search = '',
  hash = '',
  productPreview = false,
  authReturn = false,
  controlledLiveRunEnabled = false,
} = {}) {
  if (controlledLiveRunEnabled && pathname === '/') return PRODUCT_DISCOVER_PREVIEW_PATH;
  if (!productPreview || authReturn) return '';
  const url = new URL(`${pathname}${search}${hash}`, 'http://127.0.0.1');
  url.searchParams.delete('preview');
  url.searchParams.delete('tab');
  return `${url.pathname}${url.search}${url.hash}`;
}
