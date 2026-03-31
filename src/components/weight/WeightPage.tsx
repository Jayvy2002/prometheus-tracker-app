import { useEffect, useState } from 'react';
import { Plus, TrendingDown, TrendingUp, Minus, Trash2, CreditCard as Edit3 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { formatWeight, formatDate, formatDateShort, parseDateStr, todayStr } from '../../lib/utils';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { toast } from '../ui/Toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import PageTransition from '../ui/PageTransition';

type Period = '7d' | '30d' | '3m' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '3m', label: '3M' },
  { value: 'all', label: 'All' },
];

function filterByPeriod(measurements: Array<{ weight_kg: number; measured_at: string }>, period: Period) {
  if (period === 'all') return measurements;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === '7d') cutoff.setDate(now.getDate() - 7);
  else if (period === '30d') cutoff.setDate(now.getDate() - 30);
  else if (period === '3m') cutoff.setDate(now.getDate() - 90);
  return measurements.filter((m: { weight_kg: number; measured_at: string }) => parseDateStr(m.measured_at) >= cutoff);
}

export default function WeightPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { measurements, fetchMeasurements, addMeasurement, updateMeasurement, deleteMeasurement } = useWeightStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(todayStr());
  const [period, setPeriod] = useState<Period>('30d');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const unit = profile?.unit_weight ?? 'kg';

  useEffect(() => {
    if (user) fetchMeasurements(user.id);
  }, [user]);

  useEffect(() => {
    if (searchParams.get('log') === '1') {
      setEditId(null);
      setWeight('');
      setDate(todayStr());
      setShowAdd(true);
      setSearchParams({});
    }
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!user || !weight) return;
    const kg = unit === 'lbs' ? +weight / 2.20462 : +weight;
    if (editId) {
      await updateMeasurement(editId, { weight_kg: kg, measured_at: date });
      toast('Weight updated');
      setEditId(null);
    } else {
      await addMeasurement({ user_id: user.id, weight_kg: kg, measured_at: date });
      toast('Weight logged');
    }
    setWeight('');
    setDate(todayStr());
    setShowAdd(false);
  };

  const startEdit = (m: typeof measurements[0]) => {
    setEditId(m.id);
    setWeight(unit === 'lbs' ? (m.weight_kg * 2.20462).toFixed(1) : m.weight_kg.toString());
    setDate(m.measured_at);
    setShowAdd(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMeasurement(deleteTarget);
    toast('Measurement deleted', 'error');
    setDeleteTarget(null);
  };

  const sortedAsc = [...measurements].sort(
    (a, b) => parseDateStr(a.measured_at).getTime() - parseDateStr(b.measured_at).getTime()
  );

  const filtered = filterByPeriod(sortedAsc, period);

  const chartData = filtered.map((m: { weight_kg: number; measured_at: string }) => ({
    date: formatDateShort(m.measured_at),
    weight: unit === 'lbs' ? +(m.weight_kg * 2.20462).toFixed(1) : +m.weight_kg.toFixed(1),
  }));

  const latest = measurements[0]?.weight_kg;
  const previous = measurements[1]?.weight_kg;
  const diff = latest && previous ? +(latest - previous).toFixed(2) : 0;
  const targetKg = profile?.target_weight_kg ?? 0;

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Weight</h1>
        <Button onClick={() => { setEditId(null); setWeight(''); setDate(todayStr()); setShowAdd(true); }} size="sm">
          <Plus size={16} /> Log
        </Button>
      </div>

      {latest && (
        <Card className="mb-4 animate-fade-in-scale">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-3xl font-bold text-white">{formatWeight(latest, unit)}</p>
              <p className="text-sm text-neutral-500 mt-0.5">Current weight</p>
            </div>
            <div className="flex-1" />
            {diff !== 0 && (
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium
                ${diff > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                {diff > 0 ? <TrendingUp size={14} /> : diff < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                {diff > 0 ? '+' : ''}{unit === 'lbs' ? (diff * 2.20462).toFixed(1) : diff} {unit}
              </div>
            )}
          </div>
        </Card>
      )}

      {chartData.length > 1 && (
        <Card className="mb-4 animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-400">Progress</h3>
            <div className="flex gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors
                    ${period === p.value ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-300'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                {targetKg > 0 && (
                  <ReferenceLine
                    y={unit === 'lbs' ? +(targetKg * 2.20462).toFixed(1) : +targetKg.toFixed(1)}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: 'Goal', fill: '#f59e0b', fontSize: 10 }}
                  />
                )}
                <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <h3 className="text-sm font-medium text-neutral-400 mb-3">History</h3>
      <div className="space-y-2">
        {measurements.map((m, i) => (
          <div key={m.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
          <Card className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-white">{formatWeight(m.weight_kg, unit)}</p>
              <p className="text-xs text-neutral-500">{formatDate(m.measured_at)}</p>
            </div>
            <button onClick={() => startEdit(m)} className="p-2 text-neutral-500 hover:text-white transition-colors">
              <Edit3 size={14} />
            </button>
            <button onClick={() => setDeleteTarget(m.id)} className="p-2 text-neutral-600 hover:text-rose-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </Card>
          </div>
        ))}
      </div>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? 'Edit Weight' : 'Log Weight'}>
        <div className="space-y-4">
          <Input
            label={`Weight (${unit})`}
            type="number"
            step="0.1"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            placeholder="75.0"
          />
          <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Button onClick={handleSubmit} className="w-full">{editId ? 'Update' : 'Save'}</Button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Measurement">
        <p className="text-neutral-300 mb-6">Are you sure you want to delete this weight measurement? This action cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1">Cancel</Button>
          <Button onClick={handleDelete} className="flex-1 !bg-red-600 hover:!bg-red-700">Delete</Button>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
