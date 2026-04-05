import { useState, useRef } from 'react';
import { Camera, X, Loader2, Sparkles, AlertCircle, Check, ImagePlus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import type { FoodProduct } from '../../lib/types';
import Button from '../ui/Button';

interface Props {
  onResult: (product: FoodProduct, confidence: number) => void;
  onClose: () => void;
}

export default function FoodPhotoAnalyzer({ onResult, onClose }: Props) {
  const { user } = useAuthStore();
  const { uploadProductImage, createProductRequest, analyzeProductRequest } = useNutritionStore();
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (photo?.preview) URL.revokeObjectURL(photo.preview);
    setPhoto({ file, preview: URL.createObjectURL(file) });
    setErrorMsg('');
  };

  const handleAnalyze = async () => {
    if (!user || (!photo && !notes.trim())) return;
    setStatus('analyzing');
    setErrorMsg('');

    let imagePath = '';
    if (photo) {
      const path = await uploadProductImage(user.id, photo.file, 'front');
      if (path) imagePath = path;
    }

    const request = await createProductRequest({
      user_id: user.id,
      barcode: '',
      notes: notes.trim(),
      image_front: imagePath,
      image_back: '',
      image_nutrition: '',
      status: 'pending',
    });

    if (!request) {
      setStatus('error');
      setErrorMsg('Failed to start analysis. Please try again.');
      return;
    }

    const result = await analyzeProductRequest(request.id);
    if (result) {
      setStatus('done');
      setTimeout(() => onResult(result.product, result.confidence), 700);
    } else {
      setStatus('error');
      setErrorMsg('Could not identify this food. Try adding a description or a clearer photo.');
    }
  };

  const canAnalyze = !!(photo || notes.trim());

  if (status === 'analyzing' || status === 'done') {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center px-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all duration-500
          ${status === 'done' ? 'bg-blue-600/20' : 'bg-neutral-900'}`}>
          {status === 'done'
            ? <Check size={36} className="text-blue-400" />
            : <Loader2 size={36} className="text-blue-400 animate-spin" />
          }
        </div>
        <p className="text-white font-bold text-xl mb-2">
          {status === 'done' ? 'Food identified!' : 'Analyzing your photo...'}
        </p>
        <p className="text-sm text-neutral-400 text-center max-w-xs">
          {status === 'done'
            ? 'Nutritional values have been filled in automatically.'
            : 'AI is identifying the food and extracting nutritional data.'}
        </p>
        {status === 'analyzing' && (
          <div className="mt-8 w-48">
            <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '65%' }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-white">AI Photo Analysis</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Identify food from a photo</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        {/* Photo area */}
        {photo ? (
          <div className="relative rounded-2xl overflow-hidden mb-4 shadow-lg">
            <img src={photo.preview} alt="Food to analyze" className="w-full max-h-72 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            <button
              onClick={() => { URL.revokeObjectURL(photo.preview); setPhoto(null); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 transition-colors"
            >
              <X size={14} />
            </button>
            <div className="absolute bottom-3 left-3 flex gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 transition-colors"
              >
                <Camera size={12} />
                Retake
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 transition-colors"
              >
                <ImagePlus size={12} />
                Change
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 flex items-center justify-center group-hover:bg-blue-600/20 transition-colors">
                <Camera size={24} className="text-neutral-500 group-hover:text-blue-400 transition-colors" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-neutral-200 group-hover:text-white transition-colors">Take a photo</p>
                <p className="text-xs text-neutral-500">Use your camera</p>
              </div>
            </button>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/50 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center">
                <ImagePlus size={20} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-neutral-400 group-hover:text-neutral-200 transition-colors">Pick from gallery</p>
                <p className="text-xs text-neutral-600">Choose an existing photo</p>
              </div>
            </button>
          </div>
        )}

        {/* Notes field */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-neutral-400 mb-1.5">
            Description <span className="text-neutral-600">(optional — helps AI accuracy)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. 'Greek yogurt with granola', '200g chicken breast grilled', 'homemade pasta bolognese'..."
            rows={3}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/10 resize-none transition-colors"
          />
          <p className="text-[11px] text-neutral-600 mt-1.5">
            Works with packaged foods, fresh produce, cooked meals, and restaurant dishes.
          </p>
        </div>

        {status === 'error' && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5">
            <AlertCircle size={15} className="text-rose-400 mt-0.5 shrink-0" />
            <p className="text-sm text-rose-300">{errorMsg}</p>
          </div>
        )}

        <Button
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="w-full"
          size="lg"
        >
          <Sparkles size={16} />
          Identify with AI
        </Button>

        {!canAnalyze && (
          <p className="text-center text-xs text-neutral-600 mt-3">
            Add a photo or description to get started
          </p>
        )}
      </div>
    </div>
  );
}
