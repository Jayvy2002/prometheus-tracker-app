import { type ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-5 py-8 text-center">
      <p className="text-base font-semibold text-white">{title}</p>
      {body && <p className="text-sm text-neutral-400 mt-2 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
