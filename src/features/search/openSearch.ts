export const OPEN_SEARCH_EVENT = 'prometheus:open-search';

/** Any button can open the search without prop drilling. */
export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
