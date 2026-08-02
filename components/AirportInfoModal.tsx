'use client';

import React, { useState, useEffect } from 'react';
import { X, MapPin, Clock, Cloud, Edit2, Plane, Save } from 'lucide-react';
import airportsData from '@/data/airports.json';

interface Airport {
  name: string;
  city: string;
  country: string;
  iata: string;
  tz: string;
  latitude: string | number;
  longitude: string | number;
}

const defaultPaText = `Құрметті ханымдар мен мырзалар! ___ халықаралық әуежайына қош келдіңіздер!

Дамы и господа! Добро пожаловать в международный аэропорт ___! Желаем вам прекрасного пребывания!

Ladies and gentlemen! Welcome to the international airport ___! We wish you a wonderful stay!`;

export default function AirportInfoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [iataInput, setIataInput] = useState('');
  const [airport, setAirport] = useState<Airport | null>(null);
  const [localTime, setLocalTime] = useState<string>('');
  const [weather, setWeather] = useState<string | null>(null);
  
  const [paText, setPaText] = useState(defaultPaText);
  const [isEditingPa, setIsEditingPa] = useState(false);

  // Load saved PA text
  useEffect(() => {
    if (isOpen) {
      const savedText = localStorage.getItem('union-pa-text');
      if (savedText) {
        setPaText(savedText);
      }
    }
  }, [isOpen]);

  // Update clock every minute if airport is found
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (airport && airport.tz) {
      const updateClock = () => {
        try {
          const timeString = new Date().toLocaleTimeString('ru-RU', { 
            timeZone: airport.tz, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          setLocalTime(timeString);
        } catch (e) {
          setLocalTime('--:--');
        }
      };
      updateClock();
      interval = setInterval(updateClock, 60000);
    }
    return () => clearInterval(interval);
  }, [airport]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    const code = iataInput.trim().toUpperCase();
    if (code.length !== 3) return;

    // Find locally
    const found = (airportsData as Airport[]).find(a => a.iata === code);
    if (found) {
      setAirport(found);
      setWeather(null); // reset weather while fetching
      
      // Try to fetch weather
      if (found.latitude && found.longitude) {
        try {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${found.latitude}&longitude=${found.longitude}&current_weather=true`);
          if (res.ok) {
            const data = await res.json();
            if (data.current_weather && data.current_weather.temperature !== undefined) {
              setWeather(`${data.current_weather.temperature > 0 ? '+' : ''}${data.current_weather.temperature}°C`);
            }
          }
        } catch (e) {
          console.log('Offline or weather API failed');
          setWeather(null);
        }
      }
    } else {
      alert('Аэропорт не найден в базе.');
      setAirport(null);
    }
  };

  const handleSavePaText = () => {
    localStorage.setItem('union-pa-text', paText);
    setIsEditingPa(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-gray-50 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center text-white shrink-0">
          <div>
            <h3 className="font-black text-xl leading-tight">Аэропорты</h3>
            <p className="text-blue-100 text-xs mt-1 font-medium">Справочник для PA</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white bg-black/20 hover:bg-black/30 w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95">
            <X size={18} strokeWidth={3} />
          </button>
        </div>

        {/* Fixed Top Section (Search & Compact Info) */}
        <div className="p-4 space-y-3 bg-gray-50 border-b border-gray-200 shrink-0 z-10 shadow-sm relative">
          {/* Search */}
          <div className="bg-white rounded-xl p-2 shadow-sm border border-gray-100 flex gap-2">
            <input 
              type="text" 
              placeholder="Код IATA (напр. ALA)"
              maxLength={3}
              value={iataInput}
              onChange={(e) => setIataInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-gray-50 border border-transparent rounded-lg px-3 py-2 outline-none focus:border-blue-500 font-black text-gray-700 uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:font-medium text-sm"
            />
            <button 
              onClick={handleSearch}
              disabled={iataInput.length !== 3}
              className="bg-blue-600 text-white px-4 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-blue-700 active:scale-95 transition-colors"
            >
              Искать
            </button>
          </div>

          {/* Airport Info Card (Compact) */}
          {airport && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden animate-fade-in-up">
              <div className="p-3 bg-blue-50/50 flex items-center justify-between">
                <div className="overflow-hidden pr-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-blue-900 text-base">{airport.iata}</h4>
                    <span className="text-xs font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-md whitespace-nowrap">{airport.city}</span>
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 mt-1 leading-tight truncate">{airport.name}</p>
                </div>
                <div className="flex gap-3 text-right shrink-0">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Время</span>
                    <span className="font-black text-sm text-gray-800">{localTime}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Погода</span>
                    <span className="font-black text-sm text-gray-800">{weather ? weather : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">

          {/* PA Text Block */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative group">
            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex justify-between items-center">
              <h3 className="font-bold text-indigo-800 text-sm">Текст приветствия (PA)</h3>
              {!isEditingPa && (
                <button 
                  onClick={() => setIsEditingPa(true)}
                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-bold transition-colors"
                >
                  <Edit2 className="w-3 h-3" /> Редактировать
                </button>
              )}
            </div>
            <div className="p-4">
              {isEditingPa ? (
                <div className="space-y-3">
                  <textarea 
                    value={paText}
                    onChange={(e) => setPaText(e.target.value)}
                    className="w-full h-64 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium text-gray-800 outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setPaText(localStorage.getItem('union-pa-text') || defaultPaText);
                        setIsEditingPa(false);
                      }}
                      className="flex-1 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Отмена
                    </button>
                    <button 
                      onClick={handleSavePaText}
                      className="flex-1 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" /> Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => setIsEditingPa(true)}
                  className="cursor-text group-hover:bg-gray-50 transition-colors rounded-xl p-2 -m-2"
                >
                  <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap leading-relaxed">{paText}</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
