'use client';

import { useState, useEffect } from 'react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if device is iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    
    if (isIosDevice && !isStandalone) {
      setIsIOS(true);
      setShowPrompt(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleClose = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 z-50 animate-in slide-in-from-bottom-full duration-500">
      <div className="bg-white rounded-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border border-gray-100 flex flex-col gap-4 max-w-md mx-auto relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-[80px] opacity-20 -mr-10 -mt-10"></div>
        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold p-2 z-10">✕</button>
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg shadow-blue-200">
            <span className="text-white text-2xl font-black">П</span>
          </div>
          <div>
            <h3 className="font-black text-lg text-gray-900 leading-tight">Установите приложение</h3>
            <p className="text-sm font-medium text-gray-500 mt-1">Для быстрого доступа и удобства</p>
          </div>
        </div>
        
        {isIOS && !deferredPrompt ? (
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 relative z-10 mt-2">
            <p className="text-sm font-bold text-gray-700">Нажмите <span className="inline-block bg-white shadow-sm rounded-lg px-2 py-1 mx-1 border border-gray-200">⎋ Поделиться</span> в меню Safari, а затем <span className="font-black text-blue-600">«На экран Домой»</span></p>
          </div>
        ) : (
          <button 
            onClick={handleInstallClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200/50 transition active:scale-95 relative z-10 mt-2"
          >
            Установить сейчас
          </button>
        )}
      </div>
    </div>
  );
}
