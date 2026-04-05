import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera, X, ScanLine, Loader2, Sparkles,
  AlertCircle, Image as ImageIcon, Clock, Search as SearchIcon,
  ChevronRight, ArrowLeft,
} from 'lucide-react';
import { detectBarcodes } from '../../lib/barcodeScanner';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useAuthStore } from '../../stores/authStore';
import type { FoodProduct } from '../../lib/types';
import Button from '../ui/Button';
import Input from '../ui/Input';

type Phase = 'idle' | 'scanning' | 'searching' | 'ai_capture' | 'ai_analyzing';

interface Props {
  /** Called with the identified product (+ optional AI confidence 0-100) */
  onResult: (product: FoodProduct, confidence?: number) => void;
  /** Called when user wants to close without a result */
  onClose: () => void;
  /** Show recently-logged items in idle state (default: true) */
  showRecent?: boolean;
}

/**
 * Unified scanner — the single entry point for adding food.
 *
 * Flow A (barcode):
 *   idle → scanning (camera) → barcode detected → searching (DB + OFD)
 *     ↳ found     → onResult(product)
 *     ↳ not found → ai_capture (photos + notes + AI)
 *
 * Flow B (no barcode / fresh food / meal):
 *   idle → ai_capture → ai_analyzing → onResult(product, confidence)
 *
 * Used as a modal overlay from FoodForm or as a standalone page via ScannerPage.
 */
export default function UnifiedScanner({ onResult, onClose, showRecent = true }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const {
    findByBarcode, createProduct, recentProducts, fetchRecentProducts,
    uploadProductImage, createProductRequest, analyzeProductRequest, searchProducts,
  } = useNutritionStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [scannedCode, setScannedCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [aiPhoto, setAiPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [aiNotes, setAiNotes] = useState('');
  const [aiError, setAiError] = useState('');
  const [fallbackResults, setFallbackResults] = useState<FoodProduct[]>([]);
  const [isFallbackSearching, setIsFallbackSearching] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const foundRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (user && showRecent) fetchRecentProducts(user.id);
    return () => { mountedRef.current = false; stopCamera(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------
  // Barcode lookup: DB → OpenFoodFacts → AI capture
  // -------------------------------------------------------------------
  const lookupBarcode = useCallback(async (code: string) => {
    stopCamera();
    setScannedCode(code);
    setPhase('searching');

    // 1. Local database
    const dbProduct = await findByBarcode(code.trim());
    if (!mountedRef.current) return;
    if (dbProduct) { onResult(dbProduct); return; }

    // 2. Open Food Facts
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code.trim()}.json`);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = (p.nutriments ?? {}) as Record<string, number>;
        const productData = {
          barcode: code.trim(),
          name: (p.product_name || p.product_name_fr || p.product_name_en || 'Unknown product') as string,
          brand: (p.brands as string) || null,
          calories_per_100g: n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0,
          protein_per_100g: n.proteins_100g ?? n.proteins ?? 0,
          carbs_per_100g: n.carbohydrates_100g ?? n.carbohydrates ?? 0,
          fat_per_100g: n.fat_100g ?? n.fat ?? 0,
          serving_size: +(p.serving_quantity || 100),
          serving_unit: ((p.serving_size as string) ?? '').includes('ml') ? 'ml' : 'g',
          created_by: user?.id ?? null,
          data_source: 'openfoodfacts' as const,
        };
        const saved = await createProduct(productData);
        const finalProduct: FoodProduct = saved ?? { id: '', created_at: '', ...productData };
        if (!mountedRef.current) return;
        onResult(finalProduct);
        return;
      }
    } catch { /* fallthrough to AI */ }

    // 3. Not found anywhere → AI identification
    if (mountedRef.current) setPhase('ai_capture');
  }, [findByBarcode, createProduct, user?.id, onResult, stopCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------
  // Live camera scanner
  // -------------------------------------------------------------------
  const startCamera = async () => {
    setError('');
    foundRef.current = false;
    setPhase('scanning');

    // Try progressive constraints: rear camera → any camera → minimal
    const constraintsList = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: { ideal: 'environment' } } },
      { video: true },
    ];

    let stream: MediaStream | null = null;
    let lastErr: unknown;
    for (const constraints of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!stream) {
      setPhase('idle');
      const err = lastErr as { name?: string };
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setError(t('scanner.cameraPermissionDenied'));
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setError(t('scanner.noCameraFound'));
      } else {
        setError(t('scanner.cameraInaccessible'));
      }
      return;
    }

    if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
    streamRef.current = stream;
    if (!videoRef.current) { setPhase('idle'); return; }
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setCameraActive(true);

    scanIntervalRef.current = window.setInterval(async () => {
      if (foundRef.current || !mountedRef.current || !videoRef.current) return;
      if (videoRef.current.readyState < 2) return;
      try {
        const barcodes = await detectBarcodes(videoRef.current);
        if (barcodes.length > 0 && !foundRef.current && mountedRef.current) {
          const code = barcodes[0].rawValue;
          if (code) {
            foundRef.current = true;
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 300);
            lookupBarcode(code);
          }
        }
      } catch { /* ignore frame errors */ }
    }, 200);
  };

  // -------------------------------------------------------------------
  // AI photo identification
  // -------------------------------------------------------------------
  const handleAiPhotoFile = (file: File) => {
    if (aiPhoto?.preview) URL.revokeObjectURL(aiPhoto.preview);
    setAiPhoto({ file, preview: URL.createObjectURL(file) });
    setAiError('');
  };

  const handleAiSubmit = async () => {
    if (!user || (!aiPhoto && !aiNotes.trim() && !scannedCode)) return;
    setPhase('ai_analyzing');
    setAiError('');
    setFallbackResults([]);

    let imagePath = '';
    if (aiPhoto) {
      const path = await uploadProductImage(user.id, aiPhoto.file, 'front');
      if (path) imagePath = path;
    }

    const request = await createProductRequest({
      user_id: user.id,
      barcode: scannedCode || '',
      notes: aiNotes.trim(),
      image_front: imagePath,
      image_back: '',
      image_nutrition: '',
      status: 'pending',
    });

    if (!request) {
      if (mountedRef.current) { setPhase('ai_capture'); setAiError(t('scanner.aiStartError')); }
      return;
    }

    const result = await analyzeProductRequest(request.id);
    if (!mountedRef.current) return;

    if ('product' in result) {
      onResult(result.product, result.confidence);
    } else {
      // AI failed — show actual error and try text search as fallback
      setPhase('ai_capture');
      setAiError(t(result.error as Parameters<typeof t>[0]));

      const query = aiNotes.trim();
      if (query) {
        setIsFallbackSearching(true);
        try {
          const found = await searchProducts(query);
          if (mountedRef.current) setFallbackResults(found.slice(0, 5));
        } catch { /* ignore */ } finally {
          if (mountedRef.current) setIsFallbackSearching(false);
        }
      }
    }
  };

  const reset = () => {
    stopCamera();
    setPhase('idle');
    setScannedCode('');
    setManualCode('');
    setAiPhoto(null);
    setAiNotes('');
    setAiError('');
    setError('');
    setFallbackResults([]);
    setIsFallbackSearching(false);
    foundRef.current = false;
  };

  // ===================================================================
  // RENDER — each phase
  // ===================================================================

  if (phase === 'searching') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mb-5">
          <Loader2 size={28} className="text-blue-400 animate-spin" />
        </div>
        {scannedCode && <p className="text-[11px] text-neutral-600 font-mono mb-3">{scannedCode}</p>}
        <p className="text-white font-semibold mb-1">{t('scanner.lookingUp')}</p>
        <p className="text-sm text-neutral-500 text-center">{t('scanner.checkingDb')}</p>
      </div>
    );
  }

  if (phase === 'ai_analyzing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center mb-6">
          <Loader2 size={32} className="text-blue-400 animate-spin" />
        </div>
        <p className="text-white font-bold text-xl mb-2">{t('scanner.aiAnalyzing')}</p>
        <p className="text-sm text-neutral-400 text-center max-w-xs">
          {t('scanner.aiAnalyzingDesc')}
        </p>
        <div className="mt-8 w-48">
          <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '65%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'scanning') {
    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <button
            onClick={() => { stopCamera(); setPhase('idle'); }}
            className="p-2 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-semibold text-white">{t('scanner.scanBarcode')}</h2>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="p-2 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative mx-4 rounded-2xl overflow-hidden bg-black flex-1 min-h-64">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay playsInline muted
          />
          {flashActive && <div className="absolute inset-0 bg-white/30 pointer-events-none" />}

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {!cameraActive ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="text-blue-400 animate-spin" />
                <p className="text-white/70 text-sm">{t('scanner.startingCamera')}</p>
              </div>
            ) : (
              <>
                <div className="relative w-64 h-44">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-blue-400 rounded-br-lg" />
                  <div className="absolute inset-x-2 top-0 bottom-0 overflow-hidden">
                    <div className="h-0.5 bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.9)] animate-scan-line" />
                  </div>
                </div>
                <p className="mt-4 text-white/90 text-sm font-medium bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">
                  {t('scanner.pointAtBarcode')}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="px-4 py-4">
          <button
            onClick={() => { stopCamera(); setScannedCode(''); setPhase('ai_capture'); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
          >
            <Sparkles size={15} className="text-violet-400" />
            {t('scanner.noBarcodeUseAi')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'ai_capture') {
    const canAnalyze = !!(aiPhoto || aiNotes.trim() || scannedCode);
    return (
      <div className="px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">{t('scanner.aiIdentification')}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {scannedCode
                ? t('scanner.barcodeNotInDb', { code: scannedCode })
                : t('scanner.identifyFromPhoto')}
            </p>
          </div>
          <button onClick={reset} className="p-2 text-neutral-400 hover:text-white rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {scannedCode && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              {t('scanner.codeUnknown', { code: scannedCode })}
            </p>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleAiPhotoFile(f); e.target.value = ''; }}
        />
        <input
          ref={galleryFileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleAiPhotoFile(f); e.target.value = ''; }}
        />

        {/* Photo area */}
        {aiPhoto ? (
          <div className="relative rounded-2xl overflow-hidden mb-4 shadow-lg">
            <img src={aiPhoto.preview} alt="Food" className="w-full max-h-56 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            <button
              onClick={() => { URL.revokeObjectURL(aiPhoto.preview); setAiPhoto(null); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 transition-colors"
            >
              <X size={14} />
            </button>
            <div className="absolute bottom-3 left-3 flex gap-2">
              <button
                onClick={() => cameraFileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 transition-colors"
              >
                <Camera size={11} /> {t('scanner.retake')}
              </button>
              <button
                onClick={() => galleryFileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 transition-colors"
              >
                <ImageIcon size={11} /> {t('scanner.change')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            <button
              onClick={() => cameraFileRef.current?.click()}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 flex items-center justify-center group-hover:bg-blue-600/20 transition-colors shrink-0">
                <Camera size={22} className="text-neutral-500 group-hover:text-blue-400 transition-colors" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-neutral-200">{t('scanner.takePhoto')}</p>
                <p className="text-xs text-neutral-500">
                  {scannedCode ? t('scanner.frontOfPackage') : t('scanner.photoOfFood')}
                </p>
              </div>
            </button>
            <button
              onClick={() => galleryFileRef.current?.click()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center shrink-0">
                <ImageIcon size={18} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
              </div>
              <p className="text-sm text-neutral-400 group-hover:text-neutral-200 transition-colors">{t('scanner.pickFromGallery')}</p>
            </button>
          </div>
        )}

        {/* Notes */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-neutral-400 mb-1.5">
            {t('scanner.descriptionLabel')} <span className="text-neutral-600">{t('scanner.descriptionOptional')}</span>
          </label>
          <textarea
            value={aiNotes}
            onChange={e => setAiNotes(e.target.value)}
            placeholder={
              scannedCode
                ? t('scanner.descriptionPlaceholderBarcode')
                : t('scanner.descriptionPlaceholderPhoto')
            }
            rows={3}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        {aiError && (
          <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
            <AlertCircle size={14} className="text-rose-400 mt-0.5 shrink-0" />
            <p className="text-sm text-rose-300">{aiError}</p>
          </div>
        )}

        {/* Fallback: text search results when AI fails */}
        {isFallbackSearching && (
          <div className="mb-3 flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 size={13} className="animate-spin shrink-0" />
            {t('scanner.searchingDb')}
          </div>
        )}
        {!isFallbackSearching && fallbackResults.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-neutral-500 mb-2 flex items-center gap-1.5">
              <SearchIcon size={11} />
              {t('scanner.matchesFound')}
            </p>
            <div className="space-y-1.5">
              {fallbackResults.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onResult(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    <p className="text-xs text-neutral-500">
                      {p.calories_per_100g} kcal · P:{p.protein_per_100g}g · C:{p.carbs_per_100g}g · F:{p.fat_per_100g}g / 100g
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-neutral-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handleAiSubmit} disabled={!canAnalyze} className="w-full" size="lg">
          <Sparkles size={16} /> {t('scanner.identifyWithAi')}
        </Button>
        <p className="text-center text-xs text-neutral-600 mt-2.5">
          {t('scanner.aiDisclaimer')}
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // IDLE — default screen
  // -------------------------------------------------------------------
  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-white">{t('scanner.title')}</h1>
      </div>

      {/* Primary actions */}
      <div className="flex flex-col gap-3 mb-6">
        <button
          onClick={startCamera}
          className="flex items-center gap-4 p-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/50 flex items-center justify-center shrink-0">
            <ScanLine size={24} className="text-white" />
          </div>
          <div className="text-left flex-1">
            <p className="text-base font-bold text-white">{t('scanner.scanBarcode')}</p>
            <p className="text-sm text-blue-100">{t('scanner.scanBarcodeDesc')}</p>
          </div>
          <ChevronRight size={20} className="text-blue-200 shrink-0" />
        </button>

        <button
          onClick={() => { setScannedCode(''); setPhase('ai_capture'); }}
          className="flex items-center gap-4 p-5 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-violet-500/40 hover:bg-violet-600/5 active:scale-[0.98] transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-violet-600/15 flex items-center justify-center shrink-0">
            <Sparkles size={22} className="text-violet-400" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-white">{t('scanner.identifyWithPhoto')}</p>
            <p className="text-xs text-neutral-500">{t('scanner.identifyWithPhotoDesc')}</p>
          </div>
          <ChevronRight size={18} className="text-neutral-600 shrink-0" />
        </button>
      </div>

      {/* Manual barcode entry */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-neutral-800" />
        <span className="text-xs text-neutral-600">{t('scanner.orEnterManually')}</span>
        <div className="flex-1 h-px bg-neutral-800" />
      </div>

      <div className="flex gap-2 mb-5">
        <Input
          value={manualCode}
          onChange={e => setManualCode(e.target.value)}
          placeholder={t('scanner.typeBarcode')}
          className="flex-1"
          onKeyDown={e => { if (e.key === 'Enter' && manualCode.trim()) lookupBarcode(manualCode.trim()); }}
        />
        <Button
          onClick={() => { if (manualCode.trim()) lookupBarcode(manualCode.trim()); }}
          variant="secondary"
          disabled={!manualCode.trim()}
        >
          <SearchIcon size={16} />
        </Button>
      </div>

      {error && (
        <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400 flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Recently logged */}
      {showRecent && recentProducts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-2.5 flex items-center gap-1.5">
            <Clock size={11} />
            {t('scanner.recentlyLogged')}
          </p>
          <div className="space-y-1.5">
            {recentProducts.slice(0, 5).map((p, i) => (
              <button
                key={i}
                onClick={() => onResult(p)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.name}</p>
                  <p className="text-xs text-neutral-500">
                    {p.calories_per_100g} kcal · P:{p.protein_per_100g}g · C:{p.carbs_per_100g}g · F:{p.fat_per_100g}g / 100g
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
