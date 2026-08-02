import React, { useState } from 'react';
import { X, Wine, Coffee, Package, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Bottle {
  id: string;
  opened: boolean;
  value: number; // 0.1 to 1.0
}

const BAR_CATEGORIES = ['Виски', 'Водка', 'Коньяк', 'Джин'];

export default function CateringCalculatorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'bar' | 'drinks' | 'dry'>('bar');

  // State for Bar
  const [barItems, setBarItems] = useState<Record<string, Bottle[]>>({
    'Виски': [],
    'Водка': [],
    'Коньяк': [],
    'Джин': []
  });

  // Expand/collapse state for bar categories
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Виски': true,
    'Водка': true,
    'Коньяк': true,
    'Джин': true
  });

  if (!isOpen) return null;

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const addBottle = (category: string) => {
    setBarItems(prev => {
      const current = prev[category] || [];
      if (current.length >= 8) return prev; // Max 8
      
      const newBottle: Bottle = {
        id: Math.random().toString(36).substr(2, 9),
        opened: false,
        value: 1.0
      };
      return { ...prev, [category]: [...current, newBottle] };
    });
  };

  const removeBottle = (category: string, id: string) => {
    setBarItems(prev => ({
      ...prev,
      [category]: prev[category].filter(b => b.id !== id)
    }));
  };

  const toggleOpened = (category: string, id: string) => {
    setBarItems(prev => ({
      ...prev,
      [category]: prev[category].map(b => 
        b.id === id 
          ? { ...b, opened: !b.opened, value: !b.opened ? 0.5 : 1.0 } 
          : b
      )
    }));
  };

  const updateBottleValue = (category: string, id: string, value: number) => {
    setBarItems(prev => ({
      ...prev,
      [category]: prev[category].map(b => 
        b.id === id ? { ...b, value } : b
      )
    }));
  };

  const calculateTotal = (category: string) => {
    const items = barItems[category] || [];
    const total = items.reduce((sum, b) => sum + b.value, 0);
    // Округляем до 1 знака после запятой (чтобы избежать 0.300000000004)
    return Math.round(total * 10) / 10;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-gray-50 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2 mt-2">
            <div className="p-2 bg-white/20 rounded-xl">
              <Package className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold">Провизия</h2>
          </div>
          <p className="text-orange-100 text-sm">Учет алкоголя, напитков и продуктов</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10 shadow-sm">
          <button
            onClick={() => setActiveTab('bar')}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'bar' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Wine className="w-5 h-5" />
            Бар
          </button>
          <button
            onClick={() => setActiveTab('drinks')}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'drinks' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Coffee className="w-5 h-5" />
            Напитки
          </button>
          <button
            onClick={() => setActiveTab('dry')}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'dry' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Package className="w-5 h-5" />
            Сухие
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'bar' && (
            <>
              {BAR_CATEGORIES.map(category => {
                const bottles = barItems[category] || [];
                const total = calculateTotal(category);
                const isExpanded = expandedCategories[category];

                return (
                  <div key={category} className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                    {/* Category Header */}
                    <div 
                      onClick={() => toggleCategory(category)}
                      className="p-4 flex items-center justify-between bg-gray-50/50 cursor-pointer select-none active:bg-gray-100 transition-colors"
                    >
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">{category}</h3>
                        <p className="text-xs text-gray-500 font-medium">Итого: <strong className="text-orange-600 text-sm">{total}</strong></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-lg font-bold">{bottles.length}/8</span>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>

                    {/* Bottles List */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 border-t border-gray-50">
                        {bottles.length === 0 ? (
                          <div className="text-center text-sm text-gray-400 py-2">Нет добавленных бутылок</div>
                        ) : (
                          bottles.map((bottle, index) => (
                            <div key={bottle.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex flex-col gap-3 transition-all">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-700 text-sm">Бутылка {index + 1}</span>
                                
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleOpened(category, bottle.id)}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${bottle.opened ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-green-100 text-green-700 border border-green-200'}`}
                                  >
                                    {bottle.opened ? 'Вскрыта' : 'Целая'}
                                  </button>
                                  <button 
                                    onClick={() => removeBottle(category, bottle.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {bottle.opened && (
                                <div className="flex flex-col gap-1 pt-2 border-t border-gray-200">
                                  <div className="flex justify-between items-center text-xs text-gray-500 font-medium mb-1">
                                    <span>Остаток:</span>
                                    <span className="text-orange-600 font-bold text-base">{bottle.value}</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="0.1" 
                                    max="0.9" 
                                    step="0.1" 
                                    value={bottle.value}
                                    onChange={(e) => updateBottleValue(category, bottle.id, parseFloat(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                  />
                                  <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1 font-medium">
                                    <span>0.1 (Мало)</span>
                                    <span>0.5 (Половина)</span>
                                    <span>0.9 (Почти полная)</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        )}

                        {bottles.length < 8 && (
                          <button 
                            onClick={() => addBottle(category)}
                            className="w-full py-3 mt-2 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold text-sm flex justify-center items-center gap-2 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Добавить бутылку
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {activeTab === 'drinks' && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3 pt-10">
              <Coffee className="w-16 h-16 opacity-20" />
              <p className="font-medium text-center">Раздел "Напитки" в разработке</p>
            </div>
          )}

          {activeTab === 'dry' && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3 pt-10">
              <Package className="w-16 h-16 opacity-20" />
              <p className="font-medium text-center">Раздел "Сухие продукты" в разработке</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
