import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A form's main action, always at the bottom of the screen and never on top of
 * a field: above the phone tab bar, right of the desktop sidebar. Rendered in
 * <body> because an animated page wrapper keeps a transform, which would turn
 * `position: fixed` into « fixed inside the page » (the button floating over
 * the fields). A spacer keeps the end of the page reachable, and the page's
 * scroll padding keeps a focused field above the bar.
 */
export default function FixedActionBar({
  children,
  hint,
  testId,
}: {
  children: ReactNode;
  hint?: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = '11rem';
    return () => { root.style.scrollPaddingBottom = previous; };
  }, []);

  const bar = (
    <div
      className="fixed inset-x-0 z-30 border-t border-neutral-800 bg-neutral-950 px-4 py-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 md:left-64 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      data-testid={testId}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {hint ? <p className="text-[11px] text-neutral-500 sm:flex-1 sm:min-w-0">{hint}</p> : null}
        <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Room for the bar so the last field is never under it. */}
      <div aria-hidden="true" className="h-28 md:h-20" />
      {typeof document === 'undefined' ? bar : createPortal(bar, document.body)}
    </>
  );
}
