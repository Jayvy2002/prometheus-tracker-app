import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, X, Search, AlertCircle, ArrowLeft, ScanLine, Loader2, Image as ImageIcon } from 'lucide-react';
import { detectBarcodes } from '../../lib/barcodeScanner';
import { useNutritionStore } from '../../stores/nutritionStore';
import { MEAL_CATEGORIES } from '../../lib/constants';
import { todayStr } from '../../lib/utils';
import type { FoodProduct } from '../../lib/types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Card from '../ui/Card';
import FoodForm from '../nutrition/FoodForm';
import CreateProductForm from './CreateProductForm';
import FullPageLayout from '../layout/FullPageLayout';

type ScannerState = 'idle' | 'scanning' | 'searching' | 'not_found' | 'food_form' | 'create_form';

export default function ScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { findByBarcode, createProduct } = useNutritionStore();

  const [state, setState] = useState<ScannerState>('idle');
  const [manualCode, setManualCode] = useState('');
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [error, setError] = useState('');
  const [scannedCode, setScannedCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    searchParams.get('category') ?? 'snack'
  );
  const [selectedDate] = useState<string>(
    searchParams.get('date') ?? todayStr()
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const foundRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopScanning();
    };
  }, [stopScanning]);

  const lookupProduct = useCallback(async (code: string) => {
    if (!mountedRef.current) return;
    setState('searching');

    const found = await findByBarcode(code.trim());
    if (!mountedRef.current) return;
    if (found) {
      setProduct(found);
      setState('food_form');
      return;
    }

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code.trim()}.json`);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.status === 1 && data.product) {
        const p = data.product;
        const nutrients = p.nutriments || {};
        const productData = {
          barcode: code.trim(),
          name: p.product_name || 'Unknown product',
          brand: p.brands || null,
          calories_per_100g: nutrients['energy-kcal_100g'] || 0,
          protein_per_100g: nutrients.proteins_100g || 0,
          carbs_per_100g: nutrients.carbohydrates_100g || 0,
          fat_per_100g: nutrients.fat_100g || 0,
          serving_size: +(p.serving_quantity || 100),
          serving_unit: 'g',
          created_by: null,
          data_source: null,
        };
        const saved = await createProduct(productData);
        const offProduct: FoodProduct = saved ?? { id: '', created_at: '', ...productData };
        if (!mountedRef.current) return;
        setProduct(offProduct);
        setState('food_form');
        return;
      }
    } catch { /* fallthrough */ }

    if (mountedRef.current) setState('not_found');
  }, [findByBarcode, createProduct]);

  const startCamera = async () => {
    setError('');
    foundRef.current = false;
    setState('scanning');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      if (!videoRef.current) {
        setState('idle');
        setError('Internal error: video element not found.');
        return;
      }

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
              stopScanning();
              setScannedCode(code);
              lookupProduct(code);
            }
          }
        } catch {
          // detection frame error
        }
      }, 200);
    } catch {
      setState('idle');
      setError('Unable to access camera. Check permissions or enter the barcode manually.');
    }
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setState('searching');

    try {
      const bitmap = await createImageBitmap(file);
      const barcodes = await detectBarcodes(bitmap);
      bitmap.close();

      if (!mountedRef.current) return;

      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        setScannedCode(code);
        lookupProduct(code);
      } else {
        setError('No barcode detected in the image. Try again or enter the code manually.');
        setState('idle');
      }
    } catch {
      if (mountedRef.current) {
        setError('Error analyzing the image. Try again or enter the code manually.');
        setState('idle');
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualLookup = async () => {
    if (!manualCode.trim()) return;
    stopScanning();
    setScannedCode(manualCode.trim());
    await lookupProduct(manualCode.trim());
  };

  const handleReset = () => {
    stopScanning();
    setState('idle');
    setProduct(null);
    setScannedCode('');
    setManualCode('');
    foundRef.current = false;
  };

  if (state === 'food_form' && product) {
    return (
      <FullPageLayout>
        <FoodForm
          category={selectedCategory}
          date={selectedDate}
          onClose={() => navigate('/nutrition')}
          prefill={product}
        />
      </FullPageLayout>
    );
  }

  if (state === 'create_form') {
    return (
      <FullPageLayout>
        <CreateProductForm
          barcode={scannedCode || manualCode}
          onClose={handleReset}
          onCreated={(p) => { setProduct(p); setState('food_form'); }}
        />
      </FullPageLayout>
    );
  }

  return (
    <FullPageLayout>
    <div className="px-4 pt-6 pb-24">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageCapture}
        className="hidden"
      />

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { stopScanning(); navigate('/nutrition'); }}
          className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Barcode Scanner</h1>
      </div>

      {state === 'idle' && (
        <div className="space-y-4">
          <Card className="animate-fade-in-scale">
            <p className="text-sm font-medium text-neutral-300 mb-3">Add to meal</p>
            <Select
              label=""
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              options={MEAL_CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
            />
          </Card>

          <Card className="text-center py-10 animate-fade-in-scale">
            <div className="w-20 h-20 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
              <ScanLine className="text-blue-400" size={36} />
            </div>
            <p className="text-neutral-300 font-medium mb-1">Scan a product</p>
            <p className="text-neutral-500 text-sm mb-6">
              Point the camera at a barcode or take a photo to identify it automatically
            </p>
            <div className="flex flex-col gap-3 items-center">
              <Button onClick={startCamera} size="lg">
                <Camera size={16} /> Scan live
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="lg"
                variant="secondary"
              >
                <ImageIcon size={16} /> Take a photo
              </Button>
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-900" />
            <span className="text-neutral-600 text-xs">or</span>
            <div className="flex-1 h-px bg-neutral-900" />
          </div>

          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Enter barcode manually..."
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
            />
            <Button onClick={handleManualLookup} variant="secondary">
              <Search size={16} />
            </Button>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {(state === 'scanning' || (state === 'searching' && cameraActive)) && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl aspect-[4/3]">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />

            {flashActive && (
              <div className="absolute inset-0 bg-white/30 pointer-events-none transition-opacity duration-200" />
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {!cameraActive && state === 'scanning' && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={28} className="text-blue-400 animate-spin" />
                  <p className="text-white/70 text-sm">Starting camera...</p>
                </div>
              )}

              {cameraActive && state === 'scanning' && (
                <>
                  <div className="relative w-64 h-44">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-blue-400 rounded-br-lg" />

                    <div className="absolute inset-x-2 top-0 bottom-0 overflow-hidden">
                      <div className="h-0.5 bg-blue-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-scan-line" />
                    </div>
                  </div>

                  <p className="mt-4 text-white/90 text-sm font-medium bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">
                    Place the barcode in the frame
                  </p>
                </>
              )}
            </div>

            {state === 'searching' && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="text-blue-400 animate-spin" />
                  <p className="text-white font-medium">Searching...</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Enter barcode manually..."
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
            />
            <Button onClick={handleManualLookup} variant="secondary">Go</Button>
          </div>

          <Button variant="ghost" onClick={handleReset} className="w-full">
            <X size={16} /> Cancel
          </Button>
        </div>
      )}

      {state === 'searching' && !cameraActive && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={32} className="text-blue-400 animate-spin mb-3" />
          <p className="text-white font-medium">Searching...</p>
        </div>
      )}

      {state === 'not_found' && (
        <div className="space-y-4 animate-fade-in-up">
          {scannedCode && (
            <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-3 text-sm text-neutral-400 flex items-center gap-2">
              <ScanLine size={14} className="text-neutral-500" />
              Code: <span className="text-white font-mono">{scannedCode}</span>
            </div>
          )}

          <Card className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="text-amber-400" size={28} />
            </div>
            <p className="text-neutral-200 font-medium mb-1">Product not found</p>
            <p className="text-neutral-500 text-sm mb-6">
              This product is not in the database.
              <br />
              Would you like to add it? Take photos and the AI will extract the nutritional info.
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => setState('create_form')} className="w-full">
                Add this product with AI
              </Button>
              <Button variant="ghost" onClick={handleReset} className="w-full">
                <Camera size={16} /> Scan another product
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
    </FullPageLayout>
  );
}
