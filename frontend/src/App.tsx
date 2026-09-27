import React, { useState, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Upload, Image as ImageIcon, MousePointerClick, Download, RefreshCw, XCircle } from 'lucide-react';

type Point = {
  x: number;
  y: number;
  label: number;
};

// Replace these with your actual Modal deployment URLs after `modal deploy backend/main.py`
const AUTO_REMOVE_API = import.meta.env.VITE_API_AUTO_REMOVE || 'https://YOUR_WORKSPACE_NAME--bg-remover-autoremover-process.modal.run';
const SAM_SEGMENT_API = import.meta.env.VITE_API_SEGMENT || 'https://YOUR_WORKSPACE_NAME--bg-remover-samsegmenter-process.modal.run';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'auto' | 'interactive'>('auto');
  
  // Interactive mode state
  const [points, setPoints] = useState<Point[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setOriginalImageUrl(url);
      setResultUrl(null);
      setPoints([]);
    }
  };

  const clearAll = () => {
    setFile(null);
    setOriginalImageUrl(null);
    setResultUrl(null);
    setPoints([]);
  };

  const handleAutoRemove = async () => {
    if (!file) return;
    
    setIsLoading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(AUTO_REMOVE_API, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to process image');

      const blob = await response.blob();
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error removing background. Ensure API URL is correct and backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imgRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Calculate click coordinates relative to the original image dimensions
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    // Left click = foreground (1), Right click (or shift+click) = background (0)
    // For simplicity, we'll just do foreground clicks here.
    const isBackground = e.shiftKey; 

    setPoints([...points, { x, y, label: isBackground ? 0 : 1 }]);
  };

  const handleSamSegment = async () => {
    if (!file || points.length === 0) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('points', JSON.stringify(points));

    try {
      const response = await fetch(SAM_SEGMENT_API, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to segment image');

      const blob = await response.blob();
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert('Error segmenting image. Ensure API URL is correct and backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">BG Remover</h1>
        <p className="text-gray-500">Serverless Background Removal using RMBG 2.0 & SAM 2</p>
      </header>

      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden p-6">
        
        {/* Upload Section */}
        {!originalImageUrl && (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
            <input 
              type="file" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              accept="image/*"
              onChange={handleFileChange}
            />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Upload an Image</h3>
            <p className="text-gray-500 mt-1">Drag and drop or click to select</p>
          </div>
        )}

        {/* Editor Section */}
        {originalImageUrl && (
          <div className="flex flex-col space-y-6">
            
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-4">
              <div className="flex space-x-2">
                <button 
                  onClick={() => setMode('auto')}
                  className={`px-4 py-2 rounded-lg font-medium flex items-center space-x-2 ${mode === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <ImageIcon size={18} />
                  <span>Auto Remove</span>
                </button>
                <button 
                  onClick={() => setMode('interactive')}
                  className={`px-4 py-2 rounded-lg font-medium flex items-center space-x-2 ${mode === 'interactive' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <MousePointerClick size={18} />
                  <span>Select Subject</span>
                </button>
              </div>
              <button 
                onClick={clearAll}
                className="text-gray-500 hover:text-red-500 flex items-center space-x-1"
              >
                <XCircle size={18} />
                <span>Clear</span>
              </button>
            </div>

            {/* Workspace */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left side: Original / Interactive */}
              <div className="flex flex-col space-y-4">
                <h3 className="font-medium text-gray-700 text-center">Original</h3>
                
                <div className="relative border rounded-lg overflow-hidden bg-gray-100 aspect-square flex items-center justify-center group">
                  <img 
                    ref={imgRef}
                    src={originalImageUrl} 
                    alt="Original" 
                    className="max-w-full max-h-full object-contain"
                  />
                  
                  {mode === 'interactive' && (
                    <canvas 
                      ref={canvasRef}
                      onClick={handleCanvasClick}
                      className="absolute inset-0 w-full h-full cursor-crosshair"
                      width={imgRef.current?.naturalWidth || 0}
                      height={imgRef.current?.naturalHeight || 0}
                      style={{ 
                        width: '100%', 
                        height: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  )}
                  
                  {/* Interactive markers overlay */}
                  {mode === 'interactive' && points.length > 0 && (
                    <div className="absolute inset-0 pointer-events-none">
                       {/* Real app would map points to absolute DOM coordinates over the image based on scale. For simplicity in this demo, the points are collected but not visually rendered back onto the UI */}
                       <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                         {points.length} point(s) selected
                       </div>
                    </div>
                  )}
                  
                  {/* Instructions overlay */}
                  {mode === 'interactive' && points.length === 0 && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <p className="text-white font-medium">Click on the subject to select it</p>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-center">
                  {mode === 'auto' ? (
                     <button 
                       onClick={handleAutoRemove}
                       disabled={isLoading}
                       className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
                     >
                       {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <ImageIcon size={20} />}
                       <span>{isLoading ? 'Processing...' : 'Remove Background'}</span>
                     </button>
                  ) : (
                    <div className="w-full flex space-x-2">
                       <button 
                         onClick={() => setPoints([])}
                         className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-medium"
                       >
                         Clear Points
                       </button>
                       <button 
                         onClick={handleSamSegment}
                         disabled={isLoading || points.length === 0}
                         className="flex-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
                       >
                         {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <MousePointerClick size={20} />}
                         <span>{isLoading ? 'Processing...' : 'Segment Subject'}</span>
                       </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right side: Result */}
              <div className="flex flex-col space-y-4">
                <h3 className="font-medium text-gray-700 text-center">Result</h3>
                
                <div className="relative border rounded-lg overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iI2ZmZiIgLz4KPHBhdGggZD0iTTAgMGgxMHYxMEgwem0xMCAxMGgxMHYxMEgxMHoiIGZpbGw9IiNlNWU3ZWIiIC8+Cjwvc3ZnPg==')] aspect-square flex items-center justify-center">
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10">
                      <RefreshCw className="animate-spin text-blue-600 mb-2" size={32} />
                      <p className="text-gray-600 font-medium">Running model on Modal GPU...</p>
                      <p className="text-gray-400 text-sm">(May take 20s if cold starting)</p>
                    </div>
                  )}
                  
                  {resultUrl ? (
                    <img 
                      src={resultUrl} 
                      alt="Result" 
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-gray-400 text-center p-6">
                      <ImageIcon size={48} className="mx-auto mb-2 opacity-50" />
                      <p>Result will appear here</p>
                    </div>
                  )}
                </div>

                {resultUrl && (
                  <a 
                    href={resultUrl} 
                    download="bg-removed.png"
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2"
                  >
                    <Download size={20} />
                    <span>Download Image</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
