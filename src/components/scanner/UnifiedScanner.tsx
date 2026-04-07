import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera, X, ScanLine, Loader2, Sparkles,
  AlertCircle, Image as ImageIcon, Clock, Search as SearchIcon,
  ChevronRight, ArrowLeft, Check,
} from 'lucide-react';
import { detectBarcodes } from '../../lib/barcodeScanner';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { FoodProduct } from '../../lib/types';
import Button from '../ui/Button';
import Input from '../ui/Input';

type Phase = 'idle' | 'scanning' | 'searching' | 'ai_capture' | 'ai_analyzing';
type PhotoState = { file: File; preview: string } | null;
type PhotoSetter = (v: PhotoState) => void;

/**
 * Resize + re-encode any image (including HEIC from iOS camera) to JPEG via Canvas.
 * Reduces large camera photos (5-12 MB) to a web-friendly size before upload.
 */
function compressImage(file: File, maxPx = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

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
  const [searchingStep, setSearchingStep] = useState<'db' | 'off'>('db');
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [photoFront, setPhotoFront] = useState<{ file: File; preview: string } | null>(null);
  const [photoBack, setPhotoBack] = useState<{ file: File; preview: string } | null>(null);
  const [photoNutrition, setPhotoNutrition] = useState<{ file: File; preview: string } | null>(null);
  const [aiNotes, setAiNotes] = useState('');
  const [aiError, setAiError] = useState('');
  const [fallbackResults, setFallbackResults] = useState<FoodProduct[]>([]);
  const [isFallbackSearching, setIsFallbackSearching] = useState(false);
  // In-app camera overlay for photo capture (avoids OS camera launch that drops connections)
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false);
  const [photoCaptureTarget, setPhotoCaptureTarget] = useState<{ setter: PhotoSetter; current: PhotoState; label: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const photoCaptureVideoRef = useRef<HTMLVideoElement>(null);
  const photoCaptureStreamRef = useRef<MediaStream | null>(null);
  const galleryFrontRef = useRef<HTMLInputElement>(null);
  const galleryBackRef = useRef<HTMLInputElement>(null);
  const galleryNutritionRef = useRef<HTMLInputElement>(null);
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

  // In-app camera overlay — start/stop stream as overlay opens/closes
  const [photoCaptureCameraActive, setPhotoCaptureCameraActive] = useState(false);

  useEffect(() => {
    if (!photoCameraOpen) return;
    setPhotoCaptureCameraActive(false);
    let localStream: MediaStream | null = null;
    const constraintsList = [
      { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: { facingMode: { ideal: 'environment' } } },
      { video: true },
    ];
    const start = async () => {
      for (const c of constraintsList) {
        try { localStream = await navigator.mediaDevices.getUserMedia(c); break; } catch { /* try next */ }
      }
      if (!mountedRef.current) { localStream?.getTracks().forEach(t => t.stop()); return; }
      if (!localStream) { setPhotoCameraOpen(false); return; }
      photoCaptureStreamRef.current = localStream;
      if (photoCaptureVideoRef.current) {
        photoCaptureVideoRef.current.srcObject = localStream;
        await photoCaptureVideoRef.current.play().catch(() => {});
        if (mountedRef.current) setPhotoCaptureCameraActive(true);
      }
    };
    start();
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
      photoCaptureStreamRef.current = null;
      setPhotoCaptureCameraActive(false);
    };
  }, [photoCameraOpen]);

  const openPhotoCamera = (setter: PhotoSetter, current: PhotoState, label: string) => {
    setPhotoCaptureTarget({ setter, current, label });
    setPhotoCameraOpen(true);
  };

  const closePhotoCamera = useCallback(() => {
    photoCaptureStreamRef.current?.getTracks().forEach(t => t.stop());
    photoCaptureStreamRef.current = null;
    setPhotoCameraOpen(false);
    setPhotoCaptureTarget(null);
  }, []);

  const capturePhoto = () => {
    const video = photoCaptureVideoRef.current;
    if (!video || !photoCaptureTarget || !photoCaptureCameraActive) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob || !mountedRef.current) return;
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      closePhotoCamera();
      await handlePhotoFile(file, photoCaptureTarget.setter, photoCaptureTarget.current);
    }, 'image/jpeg', 0.92);
  };

  // -------------------------------------------------------------------
  // Barcode lookup: DB → OpenFoodFacts → AI capture
  // -------------------------------------------------------------------
  const lookupBarcode = useCallback(async (code: string) => {
    stopCamera();
    setScannedCode(code);
    setSearchingStep('db');
    setPhase('searching');

    try {
      // 1. Local database
      const dbProduct = await findByBarcode(code.trim());
      if (!mountedRef.current) return;
      if (dbProduct) { onResult(dbProduct); return; }

      // 2. Open Food Facts (v2, with 6-second timeout)
      if (mountedRef.current) setSearchingStep('off');
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${code.trim()}` +
          `?fields=product_name,product_name_fr,product_name_en,brands,nutriments,serving_quantity,serving_size`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
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
      } catch { /* timeout or network error → fallthrough to AI */ }

      // 3. Not found anywhere → AI identification
      if (mountedRef.current) setPhase('ai_capture');
    } catch {
      // Unexpected error → still bring user to AI capture rather than leaving stuck
      if (mountedRef.current) setPhase('ai_capture');
    }
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
  const handlePhotoFile = async (file: File, setter: PhotoSetter, current: PhotoState) => {
    if (current?.preview) URL.revokeObjectURL(current.preview);
    const compressed = await compressImage(file);
    if (!mountedRef.current) return;
    setter({ file: compressed, preview: URL.createObjectURL(compressed) });
    setAiError('');
  };

  const handleAiSubmit = async () => {
    const hasPhoto = photoFront || photoBack || photoNutrition;
    if (!user || (!hasPhoto && !aiNotes.trim() && !scannedCode)) return;
    setPhase('ai_analyzing');
    setAiError('');
    setFallbackResults([]);

    try {
      // Refresh session before network calls — the camera app (launched by capture="environment")
      // suspends the PWA on both Android and iOS, which can drop Supabase connections.
      await supabase.auth.getSession();

      // Upload all 3 photos in parallel (skip nulls)
      const upload = async (photo: PhotoState, slot: string): Promise<string> => {
        if (!photo) return '';
        const path = await uploadProductImage(user.id, photo.file, slot);
        return path ?? '';
      };
      const [frontPath, backPath, nutritionPath] = await Promise.all([
        upload(photoFront, 'front'),
        upload(photoBack, 'back'),
        upload(photoNutrition, 'nutrition'),
      ]);

      const request = await createProductRequest({
        user_id: user.id,
        barcode: scannedCode || '',
        notes: aiNotes.trim(),
        image_front: frontPath,
        image_back: backPath,
        image_nutrition: nutritionPath,
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
    } catch (err) {
      console.error('[handleAiSubmit] Unexpected error:', err);
      if (mountedRef.current) {
        setPhase('ai_capture');
        setAiError(t('scanner.aiStartError'));
      }
    }
  };

  const reset = () => {
    stopCamera();
    setPhase('idle');
    setScannedCode('');
    setManualCode('');
    setSearchingStep('db');
    if (photoFront?.preview) URL.revokeObjectURL(photoFront.preview);
    if (photoBack?.preview) URL.revokeObjectURL(photoBack.preview);
    if (photoNutrition?.preview) URL.revokeObjectURL(photoNutrition.preview);
    setPhotoFront(null);
    setPhotoBack(null);
    setPhotoNutrition(null);
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

  // In-app camera overlay MUST be checked first — it can be open while phase === 'ai_capture'
  if (photoCameraOpen) {
    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <button
            onClick={closePhotoCamera}
            className="p-2 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-semibold text-white">
            {photoCaptureTarget?.label ?? t('scanner.photoFront')}
          </h2>
          <button
            onClick={closePhotoCamera}
            className="p-2 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative mx-4 rounded-2xl overflow-hidden bg-black flex-1 min-h-64">
          <video
            ref={photoCaptureVideoRef}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay playsInline muted
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {!photoCaptureCameraActive ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="text-blue-400 animate-spin" />
                <p className="text-white/70 text-sm">{t('scanner.startingCamera')}</p>
              </div>
            ) : (
              <p className="text-white/90 text-sm font-medium bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">
                {photoCaptureTarget?.label}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center py-8">
          <button
            onClick={capturePhoto}
            disabled={!photoCaptureCameraActive}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-all disabled:opacity-40"
          >
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'searching') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mb-5">
          <Loader2 size={28} className="text-blue-400 animate-spin" />
        </div>
        {scannedCode && (
          <p className="text-[11px] font-mono mb-4 bg-neutral-900 border border-neutral-800 text-neutral-400 px-3 py-1.5 rounded-lg tracking-widest">
            {scannedCode}
          </p>
        )}
        <p className="text-white font-semibold mb-5">{t('scanner.lookingUp')}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {/* Step 1 — local DB */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              {searchingStep === 'db'
                ? <Loader2 size={16} className="animate-spin text-blue-400" />
                : <Check size={16} className="text-emerald-400" />
              }
            </div>
            <p className={`text-sm ${searchingStep === 'db' ? 'text-white' : 'text-neutral-500'}`}>
              {t('scanner.checkingDb')}
            </p>
          </div>
          {/* Step 2 — Open Food Facts */}
          <div className={`flex items-center gap-3 transition-opacity ${searchingStep === 'off' ? 'opacity-100' : 'opacity-35'}`}>
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              {searchingStep === 'off' && <Loader2 size={16} className="animate-spin text-blue-400" />}
            </div>
            <p className={`text-sm ${searchingStep === 'off' ? 'text-white' : 'text-neutral-500'}`}>
              {t('scanner.checkingOff')}
            </p>
          </div>
        </div>
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
    const hasPhoto = !!(photoFront || photoBack || photoNutrition);
    const canAnalyze = !!(hasPhoto || aiNotes.trim() || scannedCode);

    // Photo slot config
    const photoSlots = [
      {
        key: 'front',
        label: t('scanner.photoFront'),
        photo: photoFront,
        galleryRef: galleryFrontRef,
        onRemove: () => { if (photoFront?.preview) URL.revokeObjectURL(photoFront.preview); setPhotoFront(null); },
        onFile: (f: File) => handlePhotoFile(f, setPhotoFront, photoFront),
        onOpenCamera: () => openPhotoCamera(setPhotoFront, photoFront, t('scanner.photoFront')),
      },
      {
        key: 'back',
        label: t('scanner.photoBack'),
        photo: photoBack,
        galleryRef: galleryBackRef,
        onRemove: () => { if (photoBack?.preview) URL.revokeObjectURL(photoBack.preview); setPhotoBack(null); },
        onFile: (f: File) => handlePhotoFile(f, setPhotoBack, photoBack),
        onOpenCamera: () => openPhotoCamera(setPhotoBack, photoBack, t('scanner.photoBack')),
      },
      {
        key: 'nutrition',
        label: t('scanner.photoNutrition'),
        photo: photoNutrition,
        galleryRef: galleryNutritionRef,
        onRemove: () => { if (photoNutrition?.preview) URL.revokeObjectURL(photoNutrition.preview); setPhotoNutrition(null); },
        onFile: (f: File) => handlePhotoFile(f, setPhotoNutrition, photoNutrition),
        onOpenCamera: () => openPhotoCamera(setPhotoNutrition, photoNutrition, t('scanner.photoNutrition')),
      },
    ];

    return (
      <div className="px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-4">
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

        {/* Hidden gallery file inputs — camera uses in-app getUserMedia overlay */}
        {photoSlots.map(slot => (
          <input
            key={slot.key}
            ref={slot.galleryRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) slot.onFile(f); e.target.value = ''; }}
          />
        ))}

        {/* 3 photo slots */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {photoSlots.map(slot => (
            <div key={slot.key} className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-neutral-400 text-center uppercase tracking-wide truncate">
                {slot.label}
              </p>
              {slot.photo ? (
                <div className="relative rounded-xl overflow-hidden aspect-square bg-neutral-900">
                  <img src={slot.photo.preview} alt={slot.label} className="w-full h-full object-cover" />
                  <button
                    onClick={slot.onRemove}
                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/70 text-white hover:bg-rose-500/80 transition-colors"
                  >
                    <X size={10} />
                  </button>
                  {/* Retake buttons */}
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1">
                    <button
                      onClick={slot.onOpenCamera}
                      className="flex-1 flex items-center justify-center py-1 rounded-md bg-black/70 hover:bg-black/90 transition-colors"
                    >
                      <Camera size={10} className="text-white" />
                    </button>
                    <button
                      onClick={() => slot.galleryRef.current?.click()}
                      className="flex-1 flex items-center justify-center py-1 rounded-md bg-black/70 hover:bg-black/90 transition-colors"
                    >
                      <ImageIcon size={10} className="text-white" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {/* Main area → in-app camera */}
                  <button
                    onClick={slot.onOpenCamera}
                    className="w-full aspect-square rounded-xl border-2 border-dashed border-neutral-700 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all flex items-center justify-center bg-neutral-900/50"
                  >
                    <Camera size={20} className="text-neutral-600" />
                  </button>
                  {/* Sub-row: camera + gallery */}
                  <div className="flex gap-1">
                    <button
                      onClick={slot.onOpenCamera}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors"
                    >
                      <Camera size={10} className="text-neutral-500" />
                    </button>
                    <button
                      onClick={() => slot.galleryRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors"
                    >
                      <ImageIcon size={10} className="text-neutral-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

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
