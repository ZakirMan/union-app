import React, { useState } from 'react';
import { X, Plane, Users, Plus, Minus, RotateCcw, ArrowLeft, Baby } from 'lucide-react';

interface Aircraft {
  id: string;
  name: string;
  business: number;
  economy: number;
}

const AIRCRAFTS: Aircraft[] = [
  { id: 'b767', name: 'Boeing 767', business: 30, economy: 193 },
  { id: 'a320', name: 'Airbus A320', business: 16, economy: 132 },
  { id: 'a321neo', name: 'Airbus A321NEO', business: 28, economy: 151 },
  { id: 'a321lr', name: 'Airbus A321LR', business: 16, economy: 150 },
  { id: 'a321sh', name: 'Airbus A321SH', business: 28, economy: 156 },
  { id: 'a321', name: 'Airbus A321', business: 28, economy: 141 },
];

export default function PaxCalculatorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  
  // State for free seats and infants
  const [freeBusiness, setFreeBusiness] = useState(0);
  const [freeEconomy, setFreeEconomy] = useState(0);
  const [infants, setInfants] = useState(0);

  if (!isOpen) return null;

  const handleSelectAircraft = (aircraft: Aircraft) => {
    setSelectedAircraft(aircraft);
    setFreeBusiness(0);
    setFreeEconomy(0);
    setInfants(0);
  };

  const handleReset = () => {
    setFreeBusiness(0);
    setFreeEconomy(0);
    setInfants(0);
  };

  const handleBack = () => {
    setSelectedAircraft(null);
  };

  if (!selectedAircraft) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
        <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-6 text-white relative">
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 rounded-xl">
                <Plane className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold">Выберите борт</h2>
            </div>
            <p className="text-blue-100 text-sm">Калькулятор пассажиров</p>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1 space-y-3">
            {AIRCRAFTS.map(aircraft => (
              <button
                key={aircraft.id}
                onClick={() => handleSelectAircraft(aircraft)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 flex flex-col hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
              >
                <div className="flex justify-between items-center w-full mb-2">
                  <span className="font-bold text-gray-800 text-lg group-hover:text-blue-600 transition-colors">{aircraft.name}</span>
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-lg">
                    {aircraft.business + aircraft.economy} мест
                  </span>
                </div>
                <div className="text-sm text-gray-500 flex gap-4">
                  <span>Бизнес: <strong className="text-gray-700">{aircraft.business}</strong></span>
                  <span>Эконом: <strong className="text-gray-700">{aircraft.economy}</strong></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const initialTotal = selectedAircraft.business + selectedAircraft.economy;
  const currentTotal = initialTotal - freeBusiness - freeEconomy + infants;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-gray-50 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="bg-white p-4 flex items-center justify-between border-b border-gray-100">
          <button onClick={handleBack} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="text-center">
            <h2 className="font-bold text-gray-800">{selectedAircraft.name}</h2>
            <p className="text-xs text-gray-400 font-medium">Вместимость: {initialTotal}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
          
          {/* Main Counter Card */}
          <div className="bg-gradient-to-br from-blue-600 to-cyan-500 rounded-3xl p-6 text-white text-center shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-white/5 pointer-events-none"></div>
            <p className="text-blue-100 font-medium mb-1 relative z-10 text-sm uppercase tracking-wide">Пассажиров на борту</p>
            <div className="text-6xl font-black mb-4 relative z-10">{currentTotal}</div>
            
            <div className="flex justify-between items-center bg-white/10 rounded-2xl p-3 relative z-10 text-sm">
              <div className="text-center flex-1 border-r border-white/20">
                <div className="text-blue-100 text-[10px] uppercase">Бизнес</div>
                <div className="font-bold">{selectedAircraft.business - freeBusiness}</div>
              </div>
              <div className="text-center flex-1 border-r border-white/20">
                <div className="text-blue-100 text-[10px] uppercase">Эконом</div>
                <div className="font-bold">{selectedAircraft.economy - freeEconomy}</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-blue-100 text-[10px] uppercase">Младенцы</div>
                <div className="font-bold">{infants}</div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Economy Free Seats Control */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-col items-center">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Свободно Эконом</span>
              <div className="text-3xl font-black text-gray-800 mb-3">{freeEconomy}</div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => setFreeEconomy(Math.max(0, freeEconomy - 1))}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-2xl flex justify-center items-center transition-colors"
                >
                  <Minus className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setFreeEconomy(Math.min(selectedAircraft.economy, freeEconomy + 1))}
                  className="flex-1 bg-red-100 hover:bg-red-200 text-red-600 py-3 rounded-2xl flex justify-center items-center transition-colors"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">Кнопка (+) уменьшает итог</p>
            </div>

            {/* Business Free Seats Control */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-col items-center">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Свободно Бизнес</span>
              <div className="text-3xl font-black text-gray-800 mb-3">{freeBusiness}</div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => setFreeBusiness(Math.max(0, freeBusiness - 1))}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-2xl flex justify-center items-center transition-colors"
                >
                  <Minus className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setFreeBusiness(Math.min(selectedAircraft.business, freeBusiness + 1))}
                  className="flex-1 bg-orange-100 hover:bg-orange-200 text-orange-600 py-3 rounded-2xl flex justify-center items-center transition-colors"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {/* Infants Control - Full Width */}
            <div className="col-span-2 bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-3 rounded-2xl">
                  <Baby className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-gray-800">Младенцы (INF)</span>
                  <span className="block text-[10px] text-gray-500 uppercase tracking-wider">Без места</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setInfants(Math.max(0, infants - 1))}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 w-12 h-12 rounded-full flex justify-center items-center transition-colors"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <div className="text-2xl font-black text-gray-800 w-8 text-center">{infants}</div>
                <button 
                  onClick={() => setInfants(infants + 1)}
                  className="bg-green-100 hover:bg-green-200 text-green-600 w-12 h-12 rounded-full flex justify-center items-center transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-gray-100">
          <button 
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            Сбросить подсчет
          </button>
        </div>
      </div>
    </div>
  );
}
