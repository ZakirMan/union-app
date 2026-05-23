'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SalaryCalculatorPage() {
    const [baseSalary, setBaseSalary] = useState<number>(500000);
    const [positionIndex, setPositionIndex] = useState<number>(0);
    const [daysInMonth, setDaysInMonth] = useState<number>(30);
    const [flightHours, setFlightHours] = useState<number>(70);
    const [flightMinutes, setFlightMinutes] = useState<number>(0);
    const [flightCount, setFlightCount] = useState<number>(16);
    const [holidayHours, setHolidayHours] = useState<number>(0);
    const [passengerHours, setPassengerHours] = useState<number>(0);
    const [absenceDays, setAbsenceDays] = useState<number>(0);
    const [isLaborUnionMember, setIsLaborUnionMember] = useState<boolean>(false);

    const [result, setResult] = useState<{
        total: number;
        ins: number;
        pension: number;
        tax: number;
        flightBonus: number;
        holidayBonus: number;
        passengerBonus: number;
        countBonus: number;
        transport: number;
    } | null>(null);

    const calculateSalary = () => {
        // Updated rates based on request
        // 0: IN (4800)
        // 1: IS (4300)
        // 2: PU (3800)
        // 3: FY-FJ (3100)
        const rates = [4800, 4300, 3800, 3100];
        const flightHoursRate = rates[positionIndex] || 0;

        let currentBaseSalary = baseSalary;
        const totalFlightHours = flightHours + (flightMinutes / 60);

        const absenceDeduction = (baseSalary / daysInMonth) * absenceDays;
        currentBaseSalary -= absenceDeduction;

        let flightBonus = 0;
        if (totalFlightHours > 80) {
            flightBonus = (60 * flightHoursRate) + (20 * flightHoursRate * 2) + ((totalFlightHours - 80) * flightHoursRate * 2.5);
        } else if (totalFlightHours > 60) {
            flightBonus = (60 * flightHoursRate) + ((totalFlightHours - 60) * flightHoursRate * 2);
        } else {
            flightBonus = totalFlightHours * flightHoursRate;
        }
        flightBonus += (totalFlightHours * flightHoursRate * 0.25);

        const holidayBonus = holidayHours * flightHoursRate * 0.5;
        const passengerBonus = passengerHours * flightHoursRate * 0.5;

        let countBonus = 0;
        const fc = flightCount;
        if (fc > 15) {
            if (fc <= 19) countBonus = (fc - 15) * flightHoursRate * 3;
            else if (fc <= 24) countBonus = (4 * flightHoursRate * 3) + ((fc - 19) * flightHoursRate * 4);
            else countBonus = (4 * flightHoursRate * 3) + (5 * flightHoursRate * 4) + ((fc - 24) * flightHoursRate * 5);
        }

        let transport = 78000 - ((78000 / daysInMonth) * absenceDays);
        if (transport < 0) transport = 0;

        let gross = currentBaseSalary + flightBonus + holidayBonus + passengerBonus + countBonus + transport;

        const ins = Math.min(gross * 0.02, 17000);
        const union = isLaborUnionMember ? (gross - ins) * 0.005 : 0;
        const pension = (gross - ins - union) * 0.10;
        const tax = (gross - ins - union - pension) * 0.10;

        setResult({
            total: Math.round(gross - ins - union - pension - tax),
            ins: Math.round(ins),
            pension: Math.round(pension),
            tax: Math.round(tax),
            flightBonus: Math.round(flightBonus),
            holidayBonus: Math.round(holidayBonus),
            passengerBonus: Math.round(passengerBonus),
            countBonus: Math.round(countBonus),
            transport: Math.round(transport)
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12">
            <div className="max-w-lg mx-auto bg-white min-h-screen shadow-2xl relative flex flex-col">

                {/* Header / Result Card */}
                <div
                    className="relative z-10 p-8 pt-12 pb-10 rounded-b-[2.5rem] shadow-2xl text-white overflow-hidden shrink-0"
                    style={{ background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' }}
                >
                    {/* Background Elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full blur-[100px] opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500 rounded-full blur-[80px] opacity-20 -ml-10 -mb-10 pointer-events-none"></div>

                    <div className="relative z-20">
                        <div className="flex justify-between items-start mb-6">
                            <Link href="/dashboard" className="p-2 -ml-2 text-blue-200 hover:text-white transition-colors bg-white/10 rounded-full backdrop-blur-md">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m15 18-6-6 6-6" />
                                </svg>
                            </Link>
                            <span className="text-xs font-bold tracking-widest uppercase bg-white/10 px-3 py-1 rounded-full text-blue-100 backdrop-blur-sm border border-white/5">
                                Калькулятор
                            </span>
                        </div>

                        <div className="text-center">
                            <h1 className="text-blue-200 text-xs uppercase tracking-[0.2em] font-bold mb-2">Итого к выплате</h1>
                            <div className="text-6xl font-black tracking-tight drop-shadow-sm">
                                {result ? result.total.toLocaleString() : '0'}
                                <span className="text-2xl text-blue-300 ml-1 font-medium">₸</span>
                            </div>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="mt-8 grid grid-cols-2 gap-3">
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/5">
                                <span className="block text-[10px] uppercase text-blue-200 font-bold mb-1">Налет</span>
                                <span className="block text-xl font-bold text-emerald-300">
                                    {result ? `+${result.flightBonus.toLocaleString()}` : '0'}
                                </span>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/5">
                                <span className="block text-[10px] uppercase text-blue-200 font-bold mb-1">Рейсы</span>
                                <span className="block text-xl font-bold text-amber-300">
                                    {result ? `+${result.countBonus.toLocaleString()}` : '0'}
                                </span>
                            </div>
                        </div>

                        {(result && (result.holidayBonus > 0 || result.passengerBonus > 0)) && (
                            <div className="mt-2 flex gap-2">
                                {result.holidayBonus > 0 && (
                                    <div className="flex-1 bg-purple-500/20 backdrop-blur-md rounded-xl p-2 border border-purple-500/20 text-center">
                                        <span className="text-[10px] text-purple-200 font-bold">ПРАЗДНИЧНЫЕ</span>
                                        <div className="text-sm font-bold text-purple-100">+{result.holidayBonus.toLocaleString()}</div>
                                    </div>
                                )}
                                {result.passengerBonus > 0 && (
                                    <div className="flex-1 bg-cyan-500/20 backdrop-blur-md rounded-xl p-2 border border-cyan-500/20 text-center">
                                        <span className="text-[10px] text-cyan-200 font-bold">ПАССАЖИРОМ</span>
                                        <div className="text-sm font-bold text-cyan-100">+{result.passengerBonus.toLocaleString()}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-6 space-y-8 bg-white overflow-y-auto">

                    {/* Section 1: Base Info */}
                    <div className="space-y-6">
                        <div className="relative group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 block ml-1">Должность</label>
                            <div className="relative">
                                <select
                                    value={positionIndex}
                                    onChange={(e) => setPositionIndex(Number(e.target.value))}
                                    className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-5 text-slate-800 font-bold appearance-none hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="0">IN (4800)</option>
                                    <option value="1">IS (4300)</option>
                                    <option value="2">PU (3800)</option>
                                    <option value="3">FY-FJ (3100)</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-7 gap-4">
                            <div className="col-span-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 block ml-1">Оклад</label>
                                <input
                                    type="number"
                                    value={baseSalary}
                                    onChange={(e) => setBaseSalary(Number(e.target.value))}
                                    className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-5 text-slate-800 font-bold text-lg hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-300"
                                />
                            </div>
                            <div className="col-span-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 block ml-1">Дней</label>
                                <div className="relative">
                                    <select
                                        value={daysInMonth}
                                        onChange={(e) => setDaysInMonth(Number(e.target.value))}
                                        className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-5 text-slate-800 font-bold appearance-none hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="30">30</option>
                                        <option value="31">31</option>
                                        <option value="28">28</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Flight Data */}
                    <div className="bg-slate-50 p-6 rounded-[2rem] space-y-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            Данные о полетах
                            <div className="h-px bg-slate-200 flex-1"></div>
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Часы</label>
                                <input
                                    type="number"
                                    value={flightHours}
                                    onChange={(e) => setFlightHours(Number(e.target.value))}
                                    className="w-full bg-white rounded-xl py-3 px-4 font-bold text-slate-800 shadow-sm border border-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                />
                            </div>
                            <div className="relative">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Минуты</label>
                                <input
                                    type="number"
                                    value={flightMinutes}
                                    onChange={(e) => setFlightMinutes(Number(e.target.value))}
                                    max="59"
                                    className="w-full bg-white rounded-xl py-3 px-4 font-bold text-slate-800 shadow-sm border border-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Кол-во рейсов</label>
                            <input
                                type="number"
                                value={flightCount}
                                onChange={(e) => setFlightCount(Number(e.target.value))}
                                className="w-full bg-white rounded-xl py-3 px-4 font-bold text-slate-800 shadow-sm border border-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Праздничные</label>
                                <input
                                    type="number"
                                    value={holidayHours}
                                    onChange={(e) => setHolidayHours(Number(e.target.value))}
                                    className="w-full bg-white rounded-xl py-2 px-3 text-sm font-bold text-slate-800 shadow-sm border border-slate-100 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all placeholder-slate-200"
                                    placeholder="Часы"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Пассажиром</label>
                                <input
                                    type="number"
                                    value={passengerHours}
                                    onChange={(e) => setPassengerHours(Number(e.target.value))}
                                    className="w-full bg-white rounded-xl py-2 px-3 text-sm font-bold text-slate-800 shadow-sm border border-slate-100 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition-all placeholder-slate-200"
                                    placeholder="Часы"
                                />
                            </div>
                        </div>
                    </div>


                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-200 transition-colors cursor-pointer" onClick={() => setIsLaborUnionMember(!isLaborUnionMember)}>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-700">Профсоюз</span>
                                <span className="text-[10px] text-slate-400 font-medium">Взнос 0.5%</span>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isLaborUnionMember ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                                {isLaborUnionMember && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12" /></svg>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Дни отсутствия</label>
                            <input
                                type="number"
                                value={absenceDays}
                                onChange={(e) => setAbsenceDays(Number(e.target.value))}
                                className="w-full bg-white rounded-xl py-3 px-4 font-bold text-slate-800 shadow-sm border border-slate-100 outline-none transition-all"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <button
                        onClick={calculateSalary}
                        className="w-full group relative overflow-hidden bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 active:scale-[0.98] transition-transform"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="relative z-10 flex items-center justify-center gap-2">
                            РАССЧИТАТЬ
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
                        </span>
                    </button>

                    <div className="border-t border-dashed border-slate-200 pt-6">
                        <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest text-center mb-4">Детализация</h3>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 font-medium">Пенсионные</span>
                                <span className="text-red-500 font-bold">{result ? `-${result.pension.toLocaleString()}` : '0'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 font-medium">Подоходный</span>
                                <span className="text-red-500 font-bold">{result ? `-${result.tax.toLocaleString()}` : '0'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 font-medium">Мед. страховка</span>
                                <span className="text-red-500 font-bold">{result ? `-${result.ins.toLocaleString()}` : '0'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 font-medium">Транспортные</span>
                                <span className="text-emerald-500 font-bold">{result ? `+${result.transport.toLocaleString()}` : '0'}</span>
                            </div>
                        </div>

                        <div className="mt-6 text-center">
                            <p className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-[80%] mx-auto">
                                ⚠ Данный расчет является приблизительным и не может быть использован в качестве официального документа или аргумента в спорах. Суммы указаны справочно.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
