import { useState, useRef } from 'react';
import { Camera, ImagePlus, X, Loader2, Sparkles, FileText, AlertCircle, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import type { FoodProduct } from '../../lib/types';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  barcode: string;
  onClose: () => void;
  onCreated: (product: FoodProduct) => void;
}

type ImageSlot = 'front' | 'back' | 'nutrition';

interface ImageState {
  file: File | null;
  preview: string | null;
}

const SLOT_CONFIG: { key: ImageSlot; label: string; description: string }[] = [
  { key: 'front', label: 'Front', description: 'Front of the package' },
  { key: 'back', label: 'Back', description: 'Back of the package' },
  { key: 'nutrition', label: 'Nutrition Facts', description: 'Nutrition label' },
];

export default function CreateProductForm({ barcode, onClose, onCreated }: Props) {
  const { user } = useAuthStore();
  const { uploadProductImage, createProductRequest, analyzeProductRequest } = useNutritionStore();
  const [images, setImages] = useState<Record<ImageSlot, ImageState>>({
    front: { file: null, preview: null },
    back: { file: null, preview: null },
    nutrition: { file: null, preview: null },
  });
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lowConfidence, setLowConfidence] = useState(false);
  const fileInputRefs = useRef<Record<ImageSlot, HTMLInputElement | null>>({
    front: null,
    back: null,
    nutrition: null,
  });

  const hasAnyImage = Object.values(images).some(i => i.file !== null);
  const hasAnyData = hasAnyImage || notes.trim().length > 0 || barcode.trim().length > 0;

  const handleFileSelect = (slot: ImageSlot, file: File) => {
    const url = URL.createObjectURL(file);
    setImages(prev => ({
      ...prev,
      [slot]: { file, preview: url },
    }));
  };

  const removeImage = (slot: ImageSlot) => {
    if (images[slot].preview) URL.revokeObjectURL(images[slot].preview!);
    setImages(prev => ({
      ...prev,
      [slot]: { file: null, preview: null },
    }));
  };

  const handleSubmit = async () => {
    if (!user || !hasAnyData) return;
    setStatus('uploading');
    setProgress('Uploading images...');
    setErrorMsg('');

    let imageFront = '';
    let imageBack = '';
    let imageNutrition = '';

    if (images.front.file) {
      const path = await uploadProductImage(user.id, images.front.file, 'front');
      if (path) imageFront = path;
    }
    if (images.back.file) {
      const path = await uploadProductImage(user.id, images.back.file, 'back');
      if (path) imageBack = path;
    }
    if (images.nutrition.file) {
      const path = await uploadProductImage(user.id, images.nutrition.file, 'nutrition');
      if (path) imageNutrition = path;
    }

    setProgress('Creating request...');
    const request = await createProductRequest({
      user_id: user.id,
      barcode: barcode || '',
      notes,
      image_front: imageFront,
      image_back: imageBack,
      image_nutrition: imageNutrition,
      status: 'pending',
    });

    if (!request) {
      setStatus('error');
      setErrorMsg('Failed to create product request');
      return;
    }

    setStatus('analyzing');
    setProgress('AI is analyzing your product...');

    const result = await analyzeProductRequest(request.id);

    if (result) {
      const { product, confidence } = result;
      setLowConfidence(confidence < 70);
      setStatus('done');
      setProgress('Product identified!');
      setTimeout(() => onCreated(product), 1200);
    } else {
      setStatus('error');
      setErrorMsg('AI could not identify this product. Try adding clearer photos or more details in notes.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Add New Product</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm">Cancel</button>
        </div>

        {barcode && (
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl p-3 text-sm text-neutral-400 mb-4 flex items-center gap-2">
            <FileText size={14} className="text-neutral-500" />
            Barcode: <span className="text-white font-mono">{barcode}</span>
          </div>
        )}

        {status === 'idle' || status === 'error' ? (
          <>
            <p className="text-sm text-neutral-400 mb-4">
              Take photos of the product and our AI will automatically extract the nutritional information.
            </p>

            <div className="space-y-3 mb-6">
              {SLOT_CONFIG.map(({ key, label, description }) => (
                <div key={key}>
                  <input
                    ref={el => { fileInputRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(key, f);
                      e.target.value = '';
                    }}
                  />

                  {images[key].preview ? (
                    <div className="relative rounded-xl overflow-hidden border border-neutral-800/50 group">
                      <img
                        src={images[key].preview!}
                        alt={label}
                        className="w-full h-40 object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <Check size={14} className="text-blue-400" />
                        <span className="text-sm font-medium text-white">{label}</span>
                      </div>
                      <button
                        onClick={() => removeImage(key)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-rose-500/80 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRefs.current[key]?.click()}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-dashed border-neutral-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center group-hover:bg-blue-600/20 transition-colors">
                        {key === 'nutrition' ? (
                          <FileText size={20} className="text-neutral-500 group-hover:text-blue-400 transition-colors" />
                        ) : (
                          <Camera size={20} className="text-neutral-500 group-hover:text-blue-400 transition-colors" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">{label}</p>
                        <p className="text-xs text-neutral-500">{description}</p>
                      </div>
                      <ImagePlus size={16} className="text-neutral-600 ml-auto" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Notes <span className="text-neutral-600">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any extra info: product name, brand, flavour, where you bought it..."
                rows={3}
                className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none"
              />
            </div>

            {status === 'error' && (
              <Card className="mb-4 !bg-rose-500/10 !border-rose-500/30">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-rose-300 font-medium">Analysis failed</p>
                    <p className="text-xs text-rose-400/80 mt-1">{errorMsg}</p>
                  </div>
                </div>
              </Card>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!hasAnyData}
              className="w-full"
              size="lg"
            >
              <Sparkles size={16} />
              Analyze with AI
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            {status === 'done' ? (
              <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mb-4 animate-pulse">
                <Check size={28} className="text-blue-400" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mb-4">
                <Loader2 size={28} className="text-blue-400 animate-spin" />
              </div>
            )}
            <p className="text-white font-medium mb-1">
              {status === 'uploading' && 'Uploading...'}
              {status === 'analyzing' && 'Analyzing product...'}
              {status === 'done' && 'Product found!'}
            </p>
            <p className="text-sm text-neutral-400">{progress}</p>
            {status === 'done' && lowConfidence && (
              <div className="mt-4 w-full max-w-xs bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">Low confidence — please verify the nutritional values before saving.</p>
              </div>
            )}

            {status === 'analyzing' && (
              <div className="mt-6 w-full max-w-xs">
                <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
