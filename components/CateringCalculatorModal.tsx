import React, { useState, useEffect } from 'react';
import { X, Wine, Coffee, Package, Plus, Trash2, ChevronDown, ChevronUp, Settings, Save, Minus, ClipboardList } from 'lucide-react';

interface Bottle {
  id: string;
  opened: boolean;
  value: number; // 0.1 to 1.0 (representing fraction of a bottle)
}

interface Category {
  id: string;
  name: string;
  volume: number; // in liters, e.g., 0.5, 0.7, 1.0
}

interface LightCategory {
  id: string;
  name: string;
}

interface DryCategory {
  id: string;
  name: string;
  type: 'simple' | 'pack';
  packCapacity: number;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_whiskey', name: 'Виски', volume: 0.7 },
  { id: 'cat_vodka', name: 'Водка', volume: 0.5 },
  { id: 'cat_cognac', name: 'Коньяк', volume: 0.5 },
  { id: 'cat_gin', name: 'Джин', volume: 0.5 },
];

const DEFAULT_LIGHT_CATEGORIES: LightCategory[] = [
  { id: 'light_beer', name: 'Пиво' },
  { id: 'light_whitewine', name: 'Вино белое' },
  { id: 'light_redwine', name: 'Вино красное' },
  { id: 'light_tonic', name: 'Тоник' },
];

const DEFAULT_DRINK_CATEGORIES: LightCategory[] = [
  { id: 'drink_water', name: 'Вода' },
  { id: 'drink_sparkling', name: 'Вода с газом' },
  { id: 'drink_lemonade', name: 'Лимонад' },
  { id: 'drink_cola', name: 'Кола' },
  { id: 'drink_colazero', name: 'Кола без сахара' },
  { id: 'drink_orange', name: 'Апельсиновый сок' },
  { id: 'drink_apple', name: 'Яблочный сок' },
  { id: 'drink_tomato', name: 'Томатный сок' },
  { id: 'drink_milk', name: 'Молоко' },
];

const DEFAULT_DRY_CATEGORIES: DryCategory[] = [
  { id: 'dry_coffee', name: 'Кофе', type: 'simple', packCapacity: 1 },
  { id: 'dry_napkins', name: 'Салфетки', type: 'simple', packCapacity: 1 },
  { id: 'dry_baby', name: 'Детское питание', type: 'simple', packCapacity: 1 },
  { id: 'dry_tea', name: 'Чай', type: 'pack', packCapacity: 25 },
  { id: 'dry_cups_paper', name: 'Стаканы бум.', type: 'pack', packCapacity: 50 },
  { id: 'dry_cups_plastic', name: 'Стаканы пласт.', type: 'pack', packCapacity: 100 },
];

export default function CateringCalculatorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'bar' | 'drinks' | 'dry' | 'summary'>('bar');
  
  // Dynamic categories
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [lightCategories, setLightCategories] = useState<LightCategory[]>(DEFAULT_LIGHT_CATEGORIES);
  const [drinkCategories, setDrinkCategories] = useState<LightCategory[]>(DEFAULT_DRINK_CATEGORIES);
  const [dryCategories, setDryCategories] = useState<DryCategory[]>(DEFAULT_DRY_CATEGORIES);
  
  // Edit modes for tabs
  const [isEditModeBar, setIsEditModeBar] = useState(false);
  const [isEditModeDrinks, setIsEditModeDrinks] = useState(false);
  const [isEditModeDry, setIsEditModeDry] = useState(false);

  // State
  const [barItems, setBarItems] = useState<Record<string, Bottle[]>>({});
  const [lightItems, setLightItems] = useState<Record<string, number>>({});
  const [drinkItems, setDrinkItems] = useState<Record<string, number>>({});
  const [dryItems, setDryItems] = useState<Record<string, { full: number, loose: number }>>({});

  // Expand/collapse state for bar categories
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Load categories from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const load = (key: string, setter: any) => {
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) setter(parsed);
          } catch (e) { console.error(e); }
        }
      };

      load('union-bar-categories', setCategories);
      load('union-bar-light-categories', setLightCategories);
      load('union-drinks-categories', setDrinkCategories);
      load('union-dry-categories', setDryCategories);
    }
  }, []);

  // Save categories to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('union-bar-categories', JSON.stringify(categories));
    }
    const newExpanded = { ...expandedCategories };
    categories.forEach(c => {
      if (newExpanded[c.id] === undefined) newExpanded[c.id] = true;
    });
    setExpandedCategories(newExpanded);
  }, [categories]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('union-bar-light-categories', JSON.stringify(lightCategories));
  }, [lightCategories]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('union-drinks-categories', JSON.stringify(drinkCategories));
  }, [drinkCategories]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('union-dry-categories', JSON.stringify(dryCategories));
  }, [dryCategories]);

  if (!isOpen) return null;

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  // --- Strong Alcohol Handlers ---
  const addBottle = (categoryId: string) => {
    setBarItems(prev => {
      const current = prev[categoryId] || [];
      if (current.length >= 8) return prev; // Max 8
      const newBottle: Bottle = { id: Math.random().toString(36).substr(2, 9), opened: false, value: 1.0 };
      return { ...prev, [categoryId]: [...current, newBottle] };
    });
  };

  const removeBottle = (categoryId: string, id: string) => {
    setBarItems(prev => ({ ...prev, [categoryId]: prev[categoryId].filter(b => b.id !== id) }));
  };

  const toggleOpened = (categoryId: string, id: string) => {
    setBarItems(prev => ({
      ...prev,
      [categoryId]: prev[categoryId].map(b => b.id === id ? { ...b, opened: !b.opened, value: !b.opened ? 0.5 : 1.0 } : b)
    }));
  };

  const updateBottleValue = (categoryId: string, id: string, value: number) => {
    setBarItems(prev => ({
      ...prev,
      [categoryId]: prev[categoryId].map(b => b.id === id ? { ...b, value } : b)
    }));
  };

  const formatNumber = (num: number) => Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');

  const getCategoryTotalData = (category: Category) => {
    const items = barItems[category.id] || [];
    if (items.length === 0) return { total: 0, formula: '0 л' };
    const terms = items.map(b => formatNumber(b.value * category.volume));
    const total = items.reduce((sum, b) => sum + (b.value * category.volume), 0);
    const formula = `${terms.join(' + ')} = ${formatNumber(total)} л`;
    return { total, formula };
  };

  const handleAddCategory = () => {
    setCategories(prev => [...prev, { id: `cat_${Math.random().toString(36).substr(2, 9)}`, name: 'Новый напиток', volume: 0.5 }]);
  };
  const handleUpdateCategory = (id: string, field: 'name' | 'volume', value: string | number) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  const handleRemoveCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    setBarItems(prev => { const newItems = { ...prev }; delete newItems[id]; return newItems; });
  };

  // --- Light Alcohol Handlers ---
  const updateLightItem = (id: string, delta: number) => {
    setLightItems(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };
  const handleAddLightCategory = () => {
    setLightCategories(prev => [...prev, { id: `light_${Math.random().toString(36).substr(2, 9)}`, name: 'Новый напиток' }]);
  };
  const handleUpdateLightCategory = (id: string, name: string) => {
    setLightCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  };
  const handleRemoveLightCategory = (id: string) => {
    setLightCategories(prev => prev.filter(c => c.id !== id));
    setLightItems(prev => { const newItems = { ...prev }; delete newItems[id]; return newItems; });
  };

  // --- Drinks Handlers ---
  const updateDrinkItem = (id: string, delta: number) => {
    setDrinkItems(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };
  const handleAddDrinkCategory = () => {
    setDrinkCategories(prev => [...prev, { id: `drink_${Math.random().toString(36).substr(2, 9)}`, name: 'Новый напиток' }]);
  };
  const handleUpdateDrinkCategory = (id: string, name: string) => {
    setDrinkCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  };
  const handleRemoveDrinkCategory = (id: string) => {
    setDrinkCategories(prev => prev.filter(c => c.id !== id));
    setDrinkItems(prev => { const newItems = { ...prev }; delete newItems[id]; return newItems; });
  };

  // --- Dry Goods Handlers ---
  const updateDryItem = (id: string, field: 'full' | 'loose', delta: number) => {
    setDryItems(prev => {
      const current = prev[id] || { full: 0, loose: 0 };
      const nextVal = Math.max(0, current[field] + delta);
      return { ...prev, [id]: { ...current, [field]: nextVal } };
    });
  };

  const setDryItemValue = (id: string, field: 'full' | 'loose', value: number) => {
    setDryItems(prev => {
      const current = prev[id] || { full: 0, loose: 0 };
      const nextVal = Math.max(0, isNaN(value) ? 0 : value);
      return { ...prev, [id]: { ...current, [field]: nextVal } };
    });
  };

  const handleAddDryCategory = () => {
    setDryCategories(prev => [...prev, { id: `dry_${Math.random().toString(36).substr(2, 9)}`, name: 'Новый продукт', type: 'simple', packCapacity: 1 }]);
  };
  const handleUpdateDryCategory = (id: string, field: keyof DryCategory, value: string | number) => {
    setDryCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  const handleRemoveDryCategory = (id: string) => {
    setDryCategories(prev => prev.filter(c => c.id !== id));
    setDryItems(prev => { const newItems = { ...prev }; delete newItems[id]; return newItems; });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-gray-50 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white relative shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
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
        <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10 shadow-sm shrink-0">
          <button onClick={() => setActiveTab('bar')} className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'bar' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Wine className="w-5 h-5" /> Бар
          </button>
          <button onClick={() => setActiveTab('drinks')} className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'drinks' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Coffee className="w-5 h-5" /> Напитки
          </button>
          <button onClick={() => setActiveTab('dry')} className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'dry' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Package className="w-5 h-5" /> Сухие
          </button>
          <button onClick={() => setActiveTab('summary')} className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-colors ${activeTab === 'summary' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <ClipboardList className="w-5 h-5" /> Итог
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {activeTab === 'bar' && (
            <>
              {/* Settings Toggle */}
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setIsEditModeBar(!isEditModeBar)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isEditModeBar ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                  {isEditModeBar ? <Save className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  {isEditModeBar ? 'Сохранить' : 'Настроить бар'}
                </button>
              </div>

              {isEditModeBar ? (
                // Edit Mode UI
                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-gray-800 mb-3 border-b border-gray-200 pb-2">Крепкие напитки</h3>
                    <div className="space-y-3">
                      {categories.map(category => (
                        <div key={category.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-gray-500 uppercase">Название напитка</label>
                            <button onClick={() => handleRemoveCategory(category.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-md">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <input type="text" value={category.name} onChange={(e) => handleUpdateCategory(category.id, 'name', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-orange-500 font-bold text-gray-700" />
                          <label className="text-xs font-bold text-gray-500 uppercase mt-1">Объем (Литры)</label>
                          <input type="number" step="0.05" min="0.1" value={category.volume} onChange={(e) => handleUpdateCategory(category.id, 'volume', parseFloat(e.target.value) || 0)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-orange-500 font-bold text-gray-700" />
                        </div>
                      ))}
                      <button onClick={handleAddCategory} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold flex justify-center items-center gap-2 hover:bg-gray-100 transition-colors">
                        <Plus className="w-5 h-5" /> Добавить крепкий напиток
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-800 mb-3 border-b border-gray-200 pb-2">Слабоалкогольные</h3>
                    <div className="space-y-3">
                      {lightCategories.map(category => (
                        <div key={category.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-gray-500 uppercase">Название напитка</label>
                            <button onClick={() => handleRemoveLightCategory(category.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-md">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <input type="text" value={category.name} onChange={(e) => handleUpdateLightCategory(category.id, e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-orange-500 font-bold text-gray-700" />
                        </div>
                      ))}
                      <button onClick={handleAddLightCategory} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold flex justify-center items-center gap-2 hover:bg-gray-100 transition-colors">
                        <Plus className="w-5 h-5" /> Добавить слабоалкогольный
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // View Mode UI
                <div className="space-y-6">
                  {/* Hard Liquor Section */}
                  <div className="space-y-3">
                    <h3 className="font-black text-gray-400 uppercase text-xs tracking-wider px-2">Крепкие напитки</h3>
                    {categories.map(category => {
                      const bottles = barItems[category.id] || [];
                      const { total, formula } = getCategoryTotalData(category);
                      const isExpanded = expandedCategories[category.id];

                      return (
                        <div key={category.id} className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                          <div onClick={() => toggleCategory(category.id)} className="p-4 flex items-center justify-between bg-gray-50/50 cursor-pointer select-none active:bg-gray-100 transition-colors">
                            <div className="flex-1 pr-4">
                              <h3 className="font-bold text-gray-800 text-lg">{category.name}</h3>
                              <p className="text-xs text-gray-500 font-medium">Объем бутылки: {category.volume} л</p>
                              <p className="text-sm font-bold text-orange-600 mt-1 break-words leading-tight">{formula}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-lg font-bold">{bottles.length}/8 шт</span>
                              {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                            </div>
                          </div>

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
                                        <button onClick={() => toggleOpened(category.id, bottle.id)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${bottle.opened ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                                          {bottle.opened ? 'Вскрыта' : 'Целая'}
                                        </button>
                                        <button onClick={() => removeBottle(category.id, bottle.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                    {bottle.opened && (
                                      <div className="flex flex-col gap-1 pt-2 border-t border-gray-200">
                                        <div className="flex justify-between items-center text-xs text-gray-500 font-medium mb-1">
                                          <span>Остаток:</span>
                                          <span className="text-orange-600 font-bold text-base">{formatNumber(bottle.value * category.volume)} л</span>
                                        </div>
                                        <input type="range" min="0.1" max="0.9" step="0.1" value={bottle.value} onChange={(e) => updateBottleValue(category.id, bottle.id, parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500" />
                                        <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1 font-medium">
                                          <span>На дне</span>
                                          <span>Половина</span>
                                          <span>Почти полная</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                              {bottles.length < 8 && (
                                <button onClick={() => addBottle(category.id)} className="w-full py-3 mt-2 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold text-sm flex justify-center items-center gap-2 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 transition-colors">
                                  <Plus className="w-4 h-4" /> Добавить бутылку
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Light Liquor Section */}
                  <div className="space-y-3 pt-2">
                    <h3 className="font-black text-gray-400 uppercase text-xs tracking-wider px-2">Слабоалкогольные (целые)</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {lightCategories.map(category => {
                        const count = lightItems[category.id] || 0;
                        return (
                          <div key={category.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex flex-col gap-3">
                            <h4 className="font-bold text-gray-800 text-sm leading-tight">{category.name}</h4>
                            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1 border border-gray-100">
                              <button onClick={() => updateLightItem(category.id, -1)} className="w-8 h-8 flex justify-center items-center text-gray-500 hover:bg-gray-200 rounded-lg transition-colors active:scale-95 disabled:opacity-30" disabled={count === 0}>
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="font-black text-lg text-gray-800 w-8 text-center">{count}</span>
                              <button onClick={() => updateLightItem(category.id, 1)} className="w-8 h-8 flex justify-center items-center text-orange-600 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors active:scale-95">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'drinks' && (
            <>
              {/* Settings Toggle */}
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setIsEditModeDrinks(!isEditModeDrinks)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isEditModeDrinks ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                  {isEditModeDrinks ? <Save className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  {isEditModeDrinks ? 'Сохранить' : 'Настроить напитки'}
                </button>
              </div>

              {isEditModeDrinks ? (
                // Edit Mode UI
                <div className="space-y-3">
                  {drinkCategories.map(category => (
                    <div key={category.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-gray-500 uppercase">Название напитка</label>
                        <button onClick={() => handleRemoveDrinkCategory(category.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-md">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input type="text" value={category.name} onChange={(e) => handleUpdateDrinkCategory(category.id, e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 font-bold text-gray-700" />
                    </div>
                  ))}
                  <button onClick={handleAddDrinkCategory} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold flex justify-center items-center gap-2 hover:bg-gray-100 transition-colors">
                    <Plus className="w-5 h-5" /> Добавить напиток
                  </button>
                </div>
              ) : (
                // View Mode UI
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {drinkCategories.map(category => {
                      const count = drinkItems[category.id] || 0;
                      return (
                        <div key={category.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex flex-col gap-3">
                          <h4 className="font-bold text-gray-800 text-sm leading-tight">{category.name}</h4>
                          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1 border border-gray-100">
                            <button onClick={() => updateDrinkItem(category.id, -1)} className="w-8 h-8 flex justify-center items-center text-gray-500 hover:bg-gray-200 rounded-lg transition-colors active:scale-95 disabled:opacity-30" disabled={count === 0}>
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="font-black text-lg text-gray-800 w-8 text-center">{count}</span>
                            <button onClick={() => updateDrinkItem(category.id, 1)} className="w-8 h-8 flex justify-center items-center text-blue-600 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors active:scale-95">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'dry' && (
            <>
              {/* Settings Toggle */}
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setIsEditModeDry(!isEditModeDry)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isEditModeDry ? 'bg-green-100 text-green-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                  {isEditModeDry ? <Save className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  {isEditModeDry ? 'Сохранить' : 'Настроить продукты'}
                </button>
              </div>

              {isEditModeDry ? (
                // Edit Mode UI
                <div className="space-y-4">
                  {dryCategories.map(category => (
                    <div key={category.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-gray-500 uppercase">Название продукта</label>
                        <button onClick={() => handleRemoveDryCategory(category.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-md">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input type="text" value={category.name} onChange={(e) => handleUpdateDryCategory(category.id, 'name', e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-green-500 font-bold text-gray-700" />
                      
                      <label className="text-xs font-bold text-gray-500 uppercase mt-1">Метод подсчета</label>
                      <select 
                        value={category.type} 
                        onChange={(e) => handleUpdateDryCategory(category.id, 'type', e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-green-500 font-bold text-gray-700 appearance-none"
                      >
                        <option value="simple">Обычный (поштучно)</option>
                        <option value="pack">Сборная упаковка</option>
                      </select>

                      {category.type === 'pack' && (
                        <>
                          <label className="text-xs font-bold text-gray-500 uppercase mt-1">Вместимость упаковки (шт)</label>
                          <input type="number" min="1" value={category.packCapacity} onChange={(e) => handleUpdateDryCategory(category.id, 'packCapacity', parseInt(e.target.value) || 1)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-green-500 font-bold text-gray-700" />
                        </>
                      )}
                    </div>
                  ))}
                  <button onClick={handleAddDryCategory} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold flex justify-center items-center gap-2 hover:bg-gray-100 transition-colors">
                    <Plus className="w-5 h-5" /> Добавить продукт
                  </button>
                </div>
              ) : (
                // View Mode UI
                <div className="space-y-4">
                  {dryCategories.map(category => {
                    const items = dryItems[category.id] || { full: 0, loose: 0 };
                    
                    if (category.type === 'simple') {
                      return (
                        <div key={category.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                          <h4 className="font-bold text-gray-800 text-base leading-tight">{category.name}</h4>
                          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1 border border-gray-100 w-32">
                            <button onClick={() => updateDryItem(category.id, 'full', -1)} className="w-8 h-8 flex justify-center items-center text-gray-500 hover:bg-gray-200 rounded-lg transition-colors active:scale-95 disabled:opacity-30" disabled={items.full === 0}>
                              <Minus className="w-4 h-4" />
                            </button>
                            <input 
                              type="number"
                              value={items.full === 0 ? '' : items.full}
                              placeholder="0"
                              onChange={(e) => setDryItemValue(category.id, 'full', parseInt(e.target.value))}
                              className="font-black text-lg text-gray-800 w-10 text-center bg-transparent outline-none appearance-none"
                              style={{ MozAppearance: 'textfield' }}
                            />
                            <button onClick={() => updateDryItem(category.id, 'full', 1)} className="w-8 h-8 flex justify-center items-center text-green-600 bg-green-100 hover:bg-green-200 rounded-lg transition-colors active:scale-95">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // Pack type
                    const total = (items.full * category.packCapacity) + items.loose;
                    const isExpanded = expandedCategories[category.id];

                    return (
                      <div key={category.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div 
                          className="p-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center cursor-pointer select-none active:bg-gray-100 transition-colors"
                          onClick={() => toggleCategory(category.id)}
                        >
                          <div>
                            <h4 className="font-bold text-gray-800 text-base leading-tight">{category.name}</h4>
                            <p className="text-xs text-gray-500 mt-1">В уп.: {category.packCapacity} шт</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="bg-green-50 px-3 py-1.5 rounded-xl border border-green-100 text-right">
                              <span className="text-[10px] text-green-600 font-bold uppercase block leading-none mb-1">Итого</span>
                              <span className="text-xl font-black text-green-700 leading-none">{total} <span className="text-xs">шт</span></span>
                            </div>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                          </div>
                        </div>
                        
                        {isExpanded && (
                        <div className="p-4 space-y-3">
                          {/* Целые упаковки */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-600">Целые уп.</span>
                            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1 border border-gray-100 w-32">
                              <button onClick={() => updateDryItem(category.id, 'full', -1)} className="w-8 h-8 flex justify-center items-center text-gray-500 hover:bg-gray-200 rounded-lg transition-colors active:scale-95 disabled:opacity-30" disabled={items.full === 0}>
                                <Minus className="w-4 h-4" />
                              </button>
                              <input 
                                type="number"
                                value={items.full === 0 ? '' : items.full}
                                placeholder="0"
                                onChange={(e) => setDryItemValue(category.id, 'full', parseInt(e.target.value))}
                                className="font-black text-lg text-gray-800 w-10 text-center bg-transparent outline-none appearance-none"
                                style={{ MozAppearance: 'textfield' }}
                              />
                              <button onClick={() => updateDryItem(category.id, 'full', 1)} className="w-8 h-8 flex justify-center items-center text-green-600 bg-green-100 hover:bg-green-200 rounded-lg transition-colors active:scale-95">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {/* Рассыпной остаток */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-600">Рассыпной остаток</span>
                            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1 border border-gray-100 w-32">
                              <button onClick={() => updateDryItem(category.id, 'loose', -1)} className="w-8 h-8 flex justify-center items-center text-gray-500 hover:bg-gray-200 rounded-lg transition-colors active:scale-95 disabled:opacity-30" disabled={items.loose === 0}>
                                <Minus className="w-4 h-4" />
                              </button>
                              <input 
                                type="number"
                                value={items.loose === 0 ? '' : items.loose}
                                placeholder="0"
                                onChange={(e) => setDryItemValue(category.id, 'loose', parseInt(e.target.value))}
                                className="font-black text-lg text-gray-800 w-10 text-center bg-transparent outline-none appearance-none"
                                style={{ MozAppearance: 'textfield' }}
                              />
                              <button onClick={() => updateDryItem(category.id, 'loose', 1)} className="w-8 h-8 flex justify-center items-center text-green-600 bg-green-100 hover:bg-green-200 rounded-lg transition-colors active:scale-95">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'summary' && (
            <div className="space-y-4 pb-6">
              
              {/* Hard Liquor */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 border-b border-orange-100">
                  <h3 className="font-bold text-orange-800 text-sm uppercase tracking-wider">Крепкие напитки</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {categories.map(c => {
                    const { total } = getCategoryTotalData(c);
                    if (total === 0) return null;
                    return (
                      <div key={c.id} className="px-4 py-2.5 flex justify-between items-center">
                        <span className="font-medium text-gray-700">{c.name}</span>
                        <span className="font-bold text-gray-900">{formatNumber(total)} л</span>
                      </div>
                    );
                  })}
                  {categories.every(c => getCategoryTotalData(c).total === 0) && (
                    <div className="px-4 py-3 text-sm text-gray-400 italic">Пусто</div>
                  )}
                </div>
              </div>

              {/* Light Liquor */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 border-b border-orange-100">
                  <h3 className="font-bold text-orange-800 text-sm uppercase tracking-wider">Слабоалкогольные</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {lightCategories.map(c => {
                    const count = lightItems[c.id] || 0;
                    if (count === 0) return null;
                    return (
                      <div key={c.id} className="px-4 py-2.5 flex justify-between items-center">
                        <span className="font-medium text-gray-700">{c.name}</span>
                        <span className="font-bold text-gray-900">{count} шт</span>
                      </div>
                    );
                  })}
                  {lightCategories.every(c => (lightItems[c.id] || 0) === 0) && (
                    <div className="px-4 py-3 text-sm text-gray-400 italic">Пусто</div>
                  )}
                </div>
              </div>

              {/* Drinks */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                  <h3 className="font-bold text-blue-800 text-sm uppercase tracking-wider">Напитки</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {drinkCategories.map(c => {
                    const count = drinkItems[c.id] || 0;
                    if (count === 0) return null;
                    return (
                      <div key={c.id} className="px-4 py-2.5 flex justify-between items-center">
                        <span className="font-medium text-gray-700">{c.name}</span>
                        <span className="font-bold text-gray-900">{count} шт</span>
                      </div>
                    );
                  })}
                  {drinkCategories.every(c => (drinkItems[c.id] || 0) === 0) && (
                    <div className="px-4 py-3 text-sm text-gray-400 italic">Пусто</div>
                  )}
                </div>
              </div>

              {/* Dry Goods */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-green-50 px-4 py-2 border-b border-green-100">
                  <h3 className="font-bold text-green-800 text-sm uppercase tracking-wider">Сухие продукты</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {dryCategories.map(c => {
                    const items = dryItems[c.id] || { full: 0, loose: 0 };
                    let total = 0;
                    if (c.type === 'simple') total = items.full;
                    else total = (items.full * c.packCapacity) + items.loose;
                    
                    if (total === 0) return null;
                    return (
                      <div key={c.id} className="px-4 py-2.5 flex justify-between items-center">
                        <span className="font-medium text-gray-700">{c.name}</span>
                        <span className="font-bold text-gray-900">{total} шт</span>
                      </div>
                    );
                  })}
                  {dryCategories.every(c => {
                    const items = dryItems[c.id] || { full: 0, loose: 0 };
                    return (c.type === 'simple' ? items.full : (items.full * c.packCapacity + items.loose)) === 0;
                  }) && (
                    <div className="px-4 py-3 text-sm text-gray-400 italic">Пусто</div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
