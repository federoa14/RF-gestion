import React, { useState } from 'react';
import {
  Sparkles,
  Video,
  Image as ImageIcon,
  Upload,
  Download,
  Share2,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  MessageCircle,
} from 'lucide-react';
import {
  MarketingAsset,
  loadMarketingAssets,
  saveMarketingAssets,
} from '../utils/storage';
import { DistributorConfig } from '../types';
import { createWhatsAppUrl } from '../utils/whatsapp';

interface MarketingStudioProps {
  config: DistributorConfig;
}

export const MarketingStudio: React.FC<MarketingStudioProps> = ({ config }) => {
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');

  // Image Generation States
  const [imagePrompt, setImagePrompt] = useState(
    'Promoción mayorista de bebidas y comestibles para almacenes y supermercados, estilo fotografía publicitaria profesional con iluminación comercial brillante.'
  );
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('1:1');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Video Animation States
  const [uploadedPhotoBase64, setUploadedPhotoBase64] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState(
    'Smooth camera rotation showing the product with commercial studio lighting and gentle floating particle accents.'
  );
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Gallery of assets
  const [gallery, setGallery] = useState<MarketingAsset[]>(loadMarketingAssets);

  // Preset prompts for distributor business
  const distributorPresets = [
    'Oferta mayorista de bebidas gaseosas, jugos y aguas minerales en pack cerrado con logo de distribuidora.',
    'Promoción especial de harinas, aceites y alimentos secos con etiqueta de descuento por pago contado.',
    'Flyer publicitario de productos de limpieza e higiene para almacenes y minimarkets.',
    'Banner de catálogo de ofertas del mes para enviar a clientes por WhatsApp.',
  ];

  // 1. Image Generation Handler
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;
    setIsGeneratingImage(true);
    setImageError(null);

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          aspectRatio: imageAspectRatio,
          imageSize: imageSize, // 1K, 2K, or 4K affordance
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        throw new Error(data.error || 'Error al generar la imagen con gemini-3-pro-image-preview.');
      }

      setGeneratedImageUrl(data.imageUrl);

      const newAsset: MarketingAsset = {
        id: `img-${Date.now()}`,
        type: 'image',
        url: data.imageUrl,
        title: imagePrompt.slice(0, 40) + '...',
        prompt: imagePrompt,
        aspectRatio: imageAspectRatio,
        resolution: imageSize,
        createdAt: new Date().toISOString(),
      };

      const updated = [newAsset, ...gallery];
      setGallery(updated);
      saveMarketingAssets(updated);
    } catch (err: any) {
      console.error(err);
      setImageError(err.message || 'Error de conexión con el servicio de imagen.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 2. Video Animation Handler
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedPhotoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnimateVideo = async () => {
    if (!uploadedPhotoBase64) {
      setVideoError('Por favor sube una fotografía del producto para animar.');
      return;
    }

    setIsGeneratingVideo(true);
    setVideoError(null);

    try {
      const res = await fetch('/api/animate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadedPhotoBase64,
          mimeType: 'image/png',
          prompt: videoPrompt,
          aspectRatio: videoAspectRatio, // '16:9' or '9:16'
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.videoUrl) {
        throw new Error(data.error || 'Error al generar video con gemini-omni-1.1-flash.');
      }

      setGeneratedVideoUrl(data.videoUrl);

      const newAsset: MarketingAsset = {
        id: `vid-${Date.now()}`,
        type: 'video',
        url: data.videoUrl,
        title: 'Video Animación de Producto',
        prompt: videoPrompt,
        aspectRatio: videoAspectRatio,
        createdAt: new Date().toISOString(),
      };

      const updated = [newAsset, ...gallery];
      setGallery(updated);
      saveMarketingAssets(updated);
    } catch (err: any) {
      console.error(err);
      setVideoError(err.message || 'Error al procesar la animación del video.');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Estudio de Marketing & Promociones para Clientes
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Crea banners publicitarios en alta definición (1K, 2K, 4K) y anima fotos de productos a video (16:9 y 9:16) para compartir por WhatsApp con comercios y vendedores
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('image')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'image'
              ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Generar Imagen de Alta Calidad (1K, 2K, 4K)</span>
        </button>

        <button
          onClick={() => setActiveTab('video')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'video'
              ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Animar Foto a Video (16:9 / 9:16)</span>
        </button>
      </div>

      {/* Tab 1: High Quality Image Generation */}
      {activeTab === 'image' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Descripción de la Promoción o Flyer del Producto:
              </label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={4}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Describe el producto o banner promocional..."
              />
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                Ideas rápidas de catálogo mayorista:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {distributorPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setImagePrompt(preset)}
                    className="text-[10px] text-left p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    💡 {preset.slice(0, 42)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution Selector: 1K, 2K, 4K affordance */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1.5">
                <span>Resolución de Imagen (Affordance):</span>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
                  Modelo: gemini-3-pro-image-preview
                </span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['1K', '2K', '4K'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setImageSize(size)}
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                      imageSize === size
                        ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shadow-xs ring-1 ring-purple-500'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {size} Resolution
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                Relación de Aspecto:
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: '1:1', label: '1:1 Cuadrado (Catálogo/Post)' },
                  { id: '4:3', label: '4:3 Estándar' },
                  { id: '16:9', label: '16:9 Horizontal' },
                  { id: '9:16', label: '9:16 Vertical (Estado WhatsApp)' },
                ].map((ar) => (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => setImageAspectRatio(ar.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      imageAspectRatio === ar.id
                        ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {ar.label}
                  </button>
                ))}
              </div>
            </div>

            {imageError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{imageError}</span>
              </div>
            )}

            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || !imagePrompt.trim()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-900/20 flex items-center justify-center gap-2 transition-transform active:scale-98"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generando Imagen {imageSize} en Alta Definición...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generar Imagen Publicitaria ({imageSize})</span>
                </>
              )}
            </button>
          </div>

          {/* Image Preview Box */}
          <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/30 min-h-[350px]">
            {generatedImageUrl ? (
              <div className="space-y-3 w-full flex flex-col items-center">
                <div className="max-h-[360px] rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700">
                  <img
                    src={generatedImageUrl}
                    alt="Generado por IA"
                    className="max-h-[360px] object-contain rounded-xl"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={generatedImageUrl}
                    download={`Promo_Distribuidora_${imageSize}.png`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Imagen</span>
                  </a>
                  <a
                    href={createWhatsAppUrl('', `¡Mirá la nueva promoción mayorista de ${config.distributorName}!`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Compartir por WhatsApp</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 space-y-2">
                <ImageIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-medium">La imagen generada aparecerá aquí.</p>
                <p className="text-[11px] text-slate-400">
                  Ideal para promocionar combos a clientes o incluir en remitos.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Image to Video Animation (gemini-omni-1.1-flash via Interactions API) */}
      {activeTab === 'video' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-4">
            {/* Upload Product Photo */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                1. Subir fotografía del producto o promoción:
              </label>
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <Upload className="w-6 h-6 text-purple-600 mb-1" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {uploadedPhotoBase64 ? 'Foto cargada (Click para cambiar)' : 'Click para seleccionar foto de producto'}
                </span>
                <span className="text-[10px] text-slate-400">PNG, JPG o WEBP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              {uploadedPhotoBase64 && (
                <div className="mt-2 flex items-center gap-2">
                  <img
                    src={uploadedPhotoBase64}
                    alt="Preview"
                    className="w-12 h-12 rounded-lg object-cover border"
                  />
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Fotografía lista para animar</span>
                  </span>
                </div>
              )}
            </div>

            {/* Video Aspect Ratio: 16:9 or 9:16 */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1.5">
                <span>2. Formato de Video:</span>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
                  Modelo: gemini-omni-1.1-flash
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVideoAspectRatio('16:9')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    videoAspectRatio === '16:9'
                      ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-sm">16:9 Horizontal</span>
                  <span className="text-[10px] font-normal text-slate-400">Pantallas, PC y catálogos web</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVideoAspectRatio('9:16')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    videoAspectRatio === '9:16'
                      ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-sm">9:16 Vertical</span>
                  <span className="text-[10px] font-normal text-slate-400">Estados de WhatsApp & Reels</span>
                </button>
              </div>
            </div>

            {/* Motion Prompt */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                3. Instrucción de animación de movimiento:
              </label>
              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Ej. Animate product with smooth camera rotation and subtle lighting glow..."
              />
            </div>

            {videoError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{videoError}</span>
              </div>
            )}

            <button
              onClick={handleAnimateVideo}
              disabled={isGeneratingVideo || !uploadedPhotoBase64}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-900/20 flex items-center justify-center gap-2 transition-transform active:scale-98"
            >
              {isGeneratingVideo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Animando video con gemini-omni-1.1-flash (Interactions API)...</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>Generar Video Animado ({videoAspectRatio})</span>
                </>
              )}
            </button>
          </div>

          {/* Video Preview Box */}
          <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/30 min-h-[350px]">
            {generatedVideoUrl ? (
              <div className="space-y-3 w-full flex flex-col items-center">
                <div
                  className={`rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-black flex items-center justify-center ${
                    videoAspectRatio === '9:16' ? 'max-w-[240px] aspect-[9/16]' : 'w-full max-w-[420px] aspect-video'
                  }`}
                >
                  <video
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={generatedVideoUrl}
                    download={`Video_Distribuidora_${videoAspectRatio}.mp4`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Video MP4</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 space-y-2">
                <Video className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-medium">El video animado se reproducirá aquí.</p>
                <p className="text-[11px] text-slate-400">
                  Sube una foto y presiona generar para ver la animación en acción.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset Gallery */}
      {gallery.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            Galería de Promociones Generadas ({gallery.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {gallery.map((asset) => (
              <div
                key={asset.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-2xs group relative"
              >
                {asset.type === 'image' ? (
                  <img
                    src={asset.url}
                    alt={asset.title}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <video
                    src={asset.url}
                    className="w-full h-32 object-cover bg-black"
                  />
                )}
                <div className="p-2 text-[10px] space-y-0.5">
                  <span className="font-bold block truncate text-slate-800 dark:text-slate-200">
                    {asset.type === 'image' ? `🖼️ Imagen (${asset.resolution || '1K'})` : '🎬 Video Animado'}
                  </span>
                  <span className="text-slate-400 block truncate">{asset.prompt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
