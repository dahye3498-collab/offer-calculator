"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { parseOfferText, normalizeProductName } from '../lib/parser';
import { calculateCosts, formatKrw } from '../lib/calculator';
import { CalculationResult, DutyMap, ParseResult, OfferItem, AIAnalysisResult, ParsingError } from '../lib/types';

const INITIAL_OFFER_TEXT = `FEBUARY / MARCH SHIPMENT
Brand: PREMIUM BEEF CO.
Offers subject to final confirmation

1x40FCL frozen BEEF STRIPLOINS *S* @ $8.50
2x40FCL frozen BEEF CUBE ROLLS A @ $9.20
1x40FCL chilled BEEF CHUCK EYE ROLLS @ $7.80
1x20FCL frozen PORK COLLAR AF @ $4.50
1x40FCL frozen BEEF TENDERS *S* @ $12.00

Terms: CIF Busan, 30 days credit.`;

const INITIAL_DUTY_MAP: DutyMap = {
    'beef_striploin': 40,
    'beef_cube_roll': 40,
    'beef_chuck_eye_roll': 40,
    'pork_collar': 22.5,
    'beef_tender': 40,
};

export default function OfferCalculator() {
    const [offerText, setOfferText] = useState(INITIAL_OFFER_TEXT);
    const [fxRate, setFxRate] = useState(1320.5);
    const [currency, setCurrency] = useState('USD');
    const [miscCost, setMiscCost] = useState(100);
    const [dutyMap, setDutyMap] = useState<DutyMap>(INITIAL_DUTY_MAP);
    const [shouldRound, setShouldRound] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [isFxLoading, setIsFxLoading] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [originCountry, setOriginCountry] = useState('미국');
    const [searchTerm, setSearchTerm] = useState('');
    const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [dutyRefText, setDutyRefText] = useState(''); // 사용자 제공 관세 참조 자료

    const updateItem = (id: string, field: keyof OfferItem, value: any) => {
        if (!parseResult) return;
        const updatedItems = parseResult.items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        );
        setParseResult({ ...parseResult, items: updatedItems });
    };

    const fetchFxRate = async (targetCurrency = currency) => {
        setIsFxLoading(true);
        try {
            const res = await fetch(`/api/fx?currency=${targetCurrency}`);
            const data = await res.json();
            if (data.rate) setFxRate(data.rate);
        } catch (err: any) {
            console.error('FX fetch error:', err);
        } finally {
            setIsFxLoading(false);
        }
    };

    const handleAiAnalysis = async () => {
        if (!parseResult || parseResult.items.length === 0) return;
        setIsAiLoading(true);
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: parseResult.items, originCountry, dutyRefText }),
            });
            const data = await res.json();
            if (data.results) {
                const newDutyMap = { ...dutyMap };
                const updatedItems = parseResult.items.map((item: OfferItem) => {
                    const aiRes = data.results.find((r: AIAnalysisResult) => r.product_name === item.product_name);
                    let updatedItem = { ...item };
                    if (aiRes) {
                        updatedItem.korean_name = aiRes.korean_name;
                        updatedItem.hs_code = aiRes.hs_code;
                        updatedItem.manual_duty_rate = aiRes.suggested_duty_rate;
                        const key = aiRes.product_name.replace(/\s+/g, '_').toLowerCase();
                        if (newDutyMap[key] === undefined) newDutyMap[key] = aiRes.suggested_duty_rate;
                    }
                    return updatedItem;
                });
                const finalItems = await Promise.all(updatedItems.map(async (item) => {
                    if (item.hs_code) {
                        try {
                            const dutyRes = await fetch(`/api/duty?hs_code=${item.hs_code}`);
                            const dutyData = await dutyRes.json();
                            if (dutyData.rate !== undefined) return { ...item, manual_duty_rate: dutyData.rate };
                        } catch (e) { console.error(`Duty fetch error for HS ${item.hs_code}`, e); }
                    }
                    return item;
                }));
                setParseResult({ ...parseResult, items: finalItems });
                setDutyMap(newDutyMap);
                alert('AI 분석 및 관세 조회가 완료되었습니다.');
            }
        } catch (err: any) {
            console.error('AI analysis error:', err);
            alert('AI 분석 중 오류가 발생했습니다.');
        } finally {
            setIsAiLoading(false);
        }
    };

    const fetchDutyMap = async () => {
        try {
            const res = await fetch('/api/duty');
            const data = await res.json();
            if (data.dutyMap) setDutyMap(data.dutyMap);
        } catch (err: any) { console.error('Duty fetch error:', err); }
    };

    const handleParse = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: offerText }),
            });
            const data = await res.json();
            setParseResult(data);
        } catch (err: any) {
            console.error('Parse error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFxRate('USD');
        fetchDutyMap();
        handleParse();
    }, []);

    const calculations = useMemo(() => {
        if (!parseResult) return [];
        return calculateCosts(parseResult.items, dutyMap, fxRate, miscCost, shouldRound);
    }, [parseResult, dutyMap, fxRate, miscCost, shouldRound]);

    const filteredResults = useMemo(() => {
        let results = [...calculations];
        if (searchTerm) {
            results = results.filter((r: CalculationResult) =>
                r.item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.item.korean_name && r.item.korean_name.includes(searchTerm))
            );
        }
        if (showUnmatchedOnly) results = results.filter((r: CalculationResult) => !r.has_duty_match);
        if (sortConfig) {
            results.sort((a, b) => {
                let aVal: string | number = sortConfig.key === 'usd_per_kg' ? a.item.usd_per_kg : a.total_krw_per_kg;
                let bVal: string | number = sortConfig.key === 'usd_per_kg' ? b.item.usd_per_kg : b.total_krw_per_kg;
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return results;
    }, [calculations, searchTerm, showUnmatchedOnly, sortConfig]);

    const downloadCSV = () => {
        const headers = ['Line', 'Container', 'Status', 'Grade', 'Korean Name', 'Product Name', 'Spec', 'USD/kg', 'FX', 'Base KRW/kg', 'Duty%', 'Duty KRW/kg', 'Misc KRW/kg', 'Total KRW/kg'];
        const rows = filteredResults.map((r: CalculationResult) => [
            r.item.line_no, `${r.item.container_count}x${r.item.container_size_ft}`, r.item.status,
            r.item.grade_mark, r.item.korean_name || '', r.item.product_name,
            `${r.item.weight_spec} ${r.item.ratio_spec} ${r.item.pack_spec}`,
            r.item.usd_per_kg, fxRate, r.krw_per_kg_base, r.duty_rate, r.duty_krw_per_kg, r.misc_krw_per_kg, r.total_krw_per_kg
        ]);
        const csvContent = [headers, ...rows].map((e: (string | number)[]) => e.join(",")).join("\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "offer_calculation.csv");
        link.click();
    };

    const copyJSON = () => {
        navigator.clipboard.writeText(JSON.stringify(parseResult, null, 2));
        alert('JSON 결과가 클립보드에 복사되었습니다.');
    };

    const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '' : 'A$';

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-indigo-500/30">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/10 blur-[120px] rounded-full"></div>
            </div>
            <div className="relative z-10 max-w-[1600px] mx-auto p-4 md:p-8">
                <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <span className="text-white font-black text-xl italic tracking-tighter">FV</span>
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                                OFFER CALCULATOR <span className="text-indigo-400">PRO</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Global Trading Intelligence System v2.0</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={downloadCSV} className="bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 group">
                            <span className="text-slate-400 group-hover:text-emerald-400 transition-colors"></span> CSV Export
                        </button>
                        <button onClick={copyJSON} className="bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95">
                            JSON Dataset
                        </button>
                    </div>
                </header>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <aside className="lg:col-span-4 space-y-6">
                        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl group-hover:bg-indigo-500/10 transition-all"></div>
                            <h2 className="text-sm font-black text-slate-300 mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span> RAW OFFER DATA
                            </h2>
                            <textarea
                                className="w-full h-[380px] bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-sm font-mono focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-300 resize-none outline-none"
                                placeholder="Paste offer text here..."
                                value={offerText}
                                onChange={(e) => setOfferText(e.target.value)}
                            />
                            <div className="flex flex-col gap-3 mt-5">
                                <button onClick={handleParse} disabled={isLoading} className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-600 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-[0_8px_25px_rgba(99,102,241,0.2)] hover:shadow-[0_8px_35px_rgba(99,102,241,0.4)] flex items-center justify-center gap-2">
                                    {isLoading ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>BUILDING...</>) : '1. Build Dataset '}
                                </button>
                                <button onClick={handleAiAnalysis} disabled={isAiLoading || !parseResult} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all disabled:opacity-30 active:scale-95 flex items-center justify-center gap-2">
                                    {isAiLoading ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>AI ANALYZING...</>) : '2.  AI Smart Match (Duty & HS)'}
                                </button>
                            </div>
                        </section>
                        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                            <h2 className="text-sm font-black text-slate-300 mb-5 flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-violet-500 rounded-full"></span> GLOBAL INDICATORS
                            </h2>
                            <div className="space-y-4">
                                <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Origin Country</label>
                                    <select className="w-full bg-transparent text-xl font-black text-white outline-none appearance-none cursor-pointer" value={originCountry} onChange={(e) => setOriginCountry(e.target.value)}>
                                        <option value="미국" className="bg-slate-900 text-white">미국 (USA)</option>
                                        <option value="호주" className="bg-slate-900 text-white">호주 (Australia)</option>
                                        <option value="뉴질랜드" className="bg-slate-900 text-white">뉴질랜드 (New Zealand)</option>
                                        <option value="유럽" className="bg-slate-900 text-white">유럽 (Europe)</option>
                                        <option value="남미" className="bg-slate-900 text-white">남미 (South America)</option>
                                        <option value="기타" className="bg-slate-900 text-white">기타 (Others)</option>
                                    </select>
                                </div>
                                <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Exchange Rate</label>
                                            <select className="bg-transparent text-[10px] font-black text-indigo-400 outline-none cursor-pointer border-none p-0" value={currency} onChange={(e) => { const c = e.target.value; setCurrency(c); fetchFxRate(c); }}>
                                                <option value="USD" className="bg-slate-900">USD</option>
                                                <option value="EUR" className="bg-slate-900">EUR</option>
                                                <option value="AUD" className="bg-slate-900">AUD</option>
                                            </select>
                                        </div>
                                        <button onClick={() => fetchFxRate(currency)} disabled={isFxLoading} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                                            <span className={isFxLoading ? 'animate-spin' : ''}></span> SYNC
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-bold text-slate-500">{currencySymbol}</span>
                                        <input type="number" className="w-full bg-transparent text-2xl font-black text-white outline-none" value={fxRate} step="0.1" onChange={(e) => setFxRate(parseFloat(e.target.value))} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase block mb-2">Misc Expenses (KRW/kg)</label>
                                    <div className="relative">
                                        <input type="number" className="w-full bg-slate-900/50 border border-white/5 rounded-2xl py-3 px-4 text-lg font-mono font-bold text-white outline-none focus:border-violet-500/50 transition-all" value={miscCost} onChange={(e) => setMiscCost(parseFloat(e.target.value))} />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs uppercase">KRW</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between bg-slate-900/30 p-4 rounded-2xl border border-white/5">
                                    <label htmlFor="round-toggle" className="text-sm font-bold text-slate-300">Intelligent Rounding</label>
                                    <div className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" id="round-toggle" checked={shouldRound} onChange={(e) => setShouldRound(e.target.checked)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </div>
                                </div>
                            </div>
                        </section>
                        {/* 관세 참조 자료 입력 */}
                        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                            <h2 className="text-sm font-black text-slate-300 mb-3 flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span> DUTY REFERENCE DATA
                                <span className="ml-auto text-[10px] font-bold text-amber-500/70 uppercase tracking-wider">Optional</span>
                            </h2>
                            <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">관세 자료를 붙여넣으면 AI Smart Match 시 더 정확한 관세율을 계산합니다.</p>
                            <textarea
                                className="w-full h-[120px] bg-slate-900/50 border border-white/5 rounded-2xl p-3 text-xs font-mono focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/20 transition-all text-slate-400 resize-none outline-none placeholder:text-slate-700"
                                placeholder={"예시:\nHS 0202.30 냉동 쇠고기 채끝 → 미국: 0%, 호주: 10.7%\nHS 0203.19 냉동 돼지 목살 → 미국: 0%"}
                                value={dutyRefText}
                                onChange={(e) => setDutyRefText(e.target.value)}
                            />
                        </section>
                    </aside>
                    <main className="lg:col-span-8 space-y-8">
                        <section className="bg-slate-900/40 border border-white/10 rounded-3xl p-6 overflow-hidden">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1 h-3 bg-emerald-500 rounded-full"></span> Active Duty Mappings
                                </h3>
                                <button onClick={() => { const k = prompt('New Key (e.g., beef_striploin)'); const r = prompt('Rate (%)'); if (k && r) setDutyMap({ ...dutyMap, [k]: parseFloat(r) }); }} className="bg-white/5 hover:bg-white/10 px-3 py-1 rounded-lg text-[10px] font-black text-indigo-400 border border-indigo-500/20">
                                    + ADD OVERRIDE
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto pr-2 custom-scrollbar">
                                {Object.entries(dutyMap).map(([key, rate]) => (
                                    <div key={key} className="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl flex items-center gap-2 group translate-y-0 hover:-translate-y-0.5 transition-all">
                                        <span className="text-[10px] font-mono font-bold text-indigo-400 lowercase">{key}</span>
                                        <span className="h-3 w-[1px] bg-indigo-500/30"></span>
                                        <input type="number" className="bg-transparent w-8 text-[11px] font-black text-white outline-none" value={rate} onChange={(e) => setDutyMap({ ...dutyMap, [key]: parseFloat(e.target.value) })} />
                                        <button onClick={() => { const m = { ...dutyMap }; delete m[key]; setDutyMap(m); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-rose-500"></button>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] overflow-hidden shadow-2xl">
                            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.02]">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 italic text-xs">Search</span>
                                        <input type="text" className="bg-slate-900/50 border border-white/10 rounded-2xl py-2.5 pl-14 pr-4 text-sm font-bold text-white outline-none focus:border-indigo-500/50 transition-all w-64" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="mismatch-toggle" checked={showUnmatchedOnly} onChange={(e) => setShowUnmatchedOnly(e.target.checked)} className="w-4 h-4 rounded border-white/10 bg-slate-900 checked:bg-indigo-500 transition-all" />
                                        <label htmlFor="mismatch-toggle" className="text-[11px] font-bold text-slate-400 uppercase tracking-tight cursor-pointer">Unmatched Only</label>
                                    </div>
                                </div>
                                <div className="px-4 py-2 bg-slate-900/60 rounded-xl border border-white/5 border-dashed">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase mr-2">Results Matrix</span>
                                    <span className="text-white font-black text-sm">{filteredResults.length} Units</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-white/[0.03] text-slate-500 text-[10px] font-black uppercase tracking-[0.15em]">
                                            <th className="p-5 w-12 text-center">#</th>
                                            <th className="p-5">Structure</th>
                                            <th className="p-5">Type/Status</th>
                                            <th className="py-5 px-4">Origin</th>
                                            <th className="py-5 px-4">Product (KR/EN)</th>
                                            <th className="py-5 px-4 cursor-pointer" onClick={() => setSortConfig({ key: 'usd_per_kg', direction: sortConfig?.direction === 'asc' ? 'desc' : 'asc' })}>Price </th>
                                            <th className="py-5 px-4">Duty%</th>
                                            <th className="py-5 px-4 text-right text-indigo-400 relative group cursor-pointer" onClick={() => setSortConfig({ key: 'total_krw_per_kg', direction: sortConfig?.direction === 'asc' ? 'desc' : 'asc' })}>
                                                Final Landing Cost
                                                <div className="absolute bottom-0 left-0 h-[2px] bg-indigo-500 w-full scale-x-0 group-hover:scale-x-100 transition-transform"></div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                        {filteredResults.map((res) => (
                                            <tr key={res.item.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="p-5 text-center text-[10px] font-mono text-slate-600">{res.item.line_no}</td>
                                                <td className="p-5 whitespace-nowrap">
                                                    <div className="text-sm font-black text-white">{res.item.container_count}x{res.item.container_size_ft}</div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Container Unit</div>
                                                </td>
                                                <td className="p-5">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest inline-block shadow-sm ${res.item.status === 'frozen' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : res.item.status === 'chilled' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-violet-500/10 text-violet-400 border border-violet-500/20'}`}>
                                                        {res.item.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 min-w-[90px]">
                                                    <input type="text" className="w-full bg-white/5 border border-white/5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-300 outline-none focus:border-indigo-500/50 transition-all" value={res.item.origin || originCountry} onChange={(e) => updateItem(res.item.id, 'origin', e.target.value)} placeholder="Origin" />
                                                </td>
                                                <td className="py-4 px-4 min-w-[200px]">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-transparent text-sm font-black text-white outline-none focus:bg-white/5 rounded px-1 border-b border-transparent focus:border-indigo-500/40 transition-all placeholder:text-slate-700"
                                                        value={res.item.korean_name || ''}
                                                        onChange={(e) => updateItem(res.item.id, 'korean_name', e.target.value)}
                                                        placeholder="품명(국문) 입력"
                                                    />
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-0.5 truncate">{res.item.product_name}</div>
                                                    <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-1.5">
                                                        <span className="px-1.5 py-0.5 bg-slate-800/80 rounded text-slate-400 font-bold text-[9px]">{res.item.grade_mark || 'NO GRADE'}</span>
                                                        <span className="opacity-30">|</span>
                                                        <span className="truncate max-w-[100px]">{res.item.weight_spec} {res.item.ratio_spec}</span>
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="text-sm font-mono font-bold text-sky-400 cursor-help" title={`1 ${currency} = ${fxRate}`}>{currencySymbol}{res.item.usd_per_kg.toFixed(2)}</div>
                                                    <div className="text-[10px] font-mono text-slate-600">{Math.round(res.krw_per_kg_base).toLocaleString()}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1">
                                                            <input type="number" className="w-[60px] bg-white/5 border border-white/5 rounded-lg px-2 py-1.5 text-[11px] font-mono font-black text-white outline-none focus:border-indigo-500/50 transition-all" value={res.item.manual_duty_rate ?? res.duty_rate} onChange={(e) => updateItem(res.item.id, 'manual_duty_rate', parseFloat(e.target.value))} />
                                                            <span className="text-[10px] font-bold text-slate-500">%</span>
                                                        </div>
                                                        <span className="text-[10px] font-mono text-slate-600 leading-none">+{Math.round(res.duty_krw_per_kg).toLocaleString()}</span>
                                                    </div>
                                                </td>
                                                <td className="p-5 text-right">
                                                    <div className="text-lg font-mono font-black text-indigo-400 group-hover:scale-105 transition-transform origin-right">{formatKrw(res.total_krw_per_kg, shouldRound)}</div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 italic">Net Price / kg</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                            {parseResult?.errors && parseResult.errors.length > 0 && (
                                <section className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-6">
                                    <h3 className="text-xs font-black text-rose-400 uppercase tracking-[0.2em] mb-4">Parsing Exceptions ({parseResult.errors.length})</h3>
                                    <div className="space-y-3 max-h-[120px] overflow-y-auto custom-scrollbar pr-2">
                                        {parseResult.errors.map((err, i) => (
                                            <div key={i} className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/10">
                                                <div className="text-[10px] text-rose-300 font-bold mb-1 opacity-70">LINE ERROR {err.line_no}</div>
                                                <p className="text-xs text-rose-200 leading-relaxed italic opacity-80">"{err.original_text}"</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                            <section className="bg-slate-900/40 border border-white/10 rounded-3xl p-6">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Contextual Metadata</h3>
                                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto custom-scrollbar">
                                    {parseResult?.meta.map((m, i) => (<span key={i} className="bg-white/5 border border-white/5 py-1 px-3 rounded-lg text-[10px] font-medium text-slate-400">{m}</span>))}
                                </div>
                            </section>
                        </div>
                    </main>
                </div>
            </div>
            <footer className="fixed bottom-0 left-0 w-full py-4 bg-[#0f172a]/80 backdrop-blur-md border-t border-white/5 text-center z-50">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">Developed by FV Intelligence Core   2026 Enterprise Edition</p>
            </footer>
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}</style>
        </div>
    );
}