import { useState } from 'react';
import { Send, Lightbulb, Bug } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import Button from '../ui/Button';
import Input from '../ui/Input';

type FeedbackType = 'suggestion' | 'bug';

export default function FeedbackForm() {
  const { user } = useAuthStore();
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);

    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }

    setSending(true);
    const { error: insertErr } = await supabase.from('user_feedback').insert({
      user_id: user?.id,
      type,
      title: title.trim(),
      description: description.trim(),
    });
    setSending(false);

    if (insertErr) {
      setError(insertErr.message);
    } else {
      setSuccess(true);
      setTitle('');
      setDescription('');
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setType('suggestion')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            type === 'suggestion'
              ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'
              : 'bg-neutral-900 text-neutral-400 hover:text-neutral-300'
          }`}
        >
          <Lightbulb size={15} />
          Suggestion
        </button>
        <button
          onClick={() => setType('bug')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            type === 'bug'
              ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30'
              : 'bg-neutral-900 text-neutral-400 hover:text-neutral-300'
          }`}
        >
          <Bug size={15} />
          Bug Report
        </button>
      </div>

      <Input
        label="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={type === 'suggestion' ? 'What would you like to see?' : 'What went wrong?'}
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-neutral-300">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={type === 'suggestion' ? 'Describe your idea in detail...' : 'Steps to reproduce the issue...'}
          rows={4}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-white
            placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
            transition-all duration-200 resize-none text-sm"
        />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && (
        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 rounded-xl px-3 py-2">
          <Send size={14} />
          Thank you! Your feedback has been submitted.
        </div>
      )}

      <Button onClick={handleSubmit} loading={sending} className="w-full">
        <Send size={15} /> Send Feedback
      </Button>
    </div>
  );
}
