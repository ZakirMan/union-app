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
  latitude: number;
  longitude: number;
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Search */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-2">
            <input 
              type="text" 
              placeholder="Код IATA (напр. ALA)"
              maxLength={3}
              value={iataInput}
              onChange={(e) => setIataInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-black text-gray-700 uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:font-medium"
            />
            <button 
              onClick={handleSearch}
              disabled={iataInput.length !== 3}
              className="bg-blue-600 text-white px-5 rounded-xl font-bold disabled:opacity-50 hover:bg-blue-700 active:scale-95 transition-colors"
            >
              Искать
            </button>
          </div>

          {/* Airport Info Card */}
          {airport && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
              <div className="p-5 flex gap-4 items-center border-b border-gray-50 bg-blue-50/30">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                  <Plane className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 text-lg">{airport.iata}</h4>
                  <p className="text-sm font-bold text-gray-600">{airport.city}, {airport.country}</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Полное название</span>
                  <p className="font-bold text-gray-800 leading-tight mt-1">{airport.name}</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase font-bold tracking-wider">Местное время</span>
                    </div>
                    <span className="font-black text-xl text-gray-900">{localTime}</span>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl p-3 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <Cloud className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase font-bold tracking-wider">Погода</span>
                    </div>
                    <span className="font-black text-xl text-gray-900">{weather ? weather : <span className="text-gray-400 font-medium text-sm">—</span>}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

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
