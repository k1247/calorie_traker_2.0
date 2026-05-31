'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

declare global {
  interface Window {
    Telegram?: any;
  }
}

interface FoodItem {
  id: number;
  name: string;
  weight: number;
  cal: number;
  protein: number;
  fat: number;
  carbs: number;
  color: string;
}

interface HistoryItem {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface DayStat {
  dateStr: string;
  label: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface PeriodStat {
  label: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  hasData: boolean;
}

export default function Home() {
  // 1. СТЕЙТИ
  const [currentScreen, setCurrentScreen] = useState<'home' | 'add' | 'stats' | 'goals'>('home');
  const [activeTab, setActiveTab] = useState<'manual' | 'history' | 'scanner'>('manual');
  const [statsMode, setStatsMode] = useState<'days' | 'weeks' | 'months'>('days');

  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  const [userGoals, setUserGoals] = useState({
    calories: 2000,
    protein: 120,
    fat: 80,
    carbs: 250,
  });
  const [goalsInput, setGoalsInput] = useState({ ...userGoals });

  const [foodList, setFoodList] = useState<FoodItem[]>([]);
  const [historyDatabase, setHistoryDatabase] = useState<HistoryItem[]>([]);
  
  const [dailyStats, setDailyStats] = useState<DayStat[]>([]);
  const [weeklyStatsData, setWeeklyStatsData] = useState<PeriodStat[]>([]);
  const [monthlyStatsData, setMonthlyStatsData] = useState<PeriodStat[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight: '',
  });

  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [availableCameras, setAvailableCameras] = useState<any[]>([]);
  const [currentCamIdx, setCurrentCamIdx] = useState(0);
  const codeReaderRef = useRef<any>(null);

  // 2. УТИЛІТИ 
  const getTodayDateString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    return localISOTime;
  };

  // 3. ГОЛОВНА ФУНКЦІЯ ЗАВАНТАЖЕННЯ ДАНИХ
  const fetchUserData = async () => {
    try {
      const todayStr = getTodayDateString();

      const { data: goalsData } = await supabase.from('user_goals').select('*').eq('user_id', 'default_user').maybeSingle();
      if (goalsData) {
        setUserGoals(goalsData);
        setGoalsInput(goalsData);
      }

      const { data: diaryData } = await supabase.from('food_diary').select('*').eq('user_id', 'default_user').eq('date', todayStr).order('created_at', { ascending: false });
      if (diaryData) {
        setFoodList(diaryData.map((item) => ({
          id: item.id, name: item.name, weight: item.weight, cal: item.calories,
          protein: item.protein || 0, fat: item.fat || 0, carbs: item.carbs || 0, color: item.color,
        })));
      }

      const { data: allDiaryRecords } = await supabase.from('food_diary').select('*').eq('user_id', 'default_user');

      const daysLog: DayStat[] = [];
      const weekdayLabels = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const tzoffset = d.getTimezoneOffset() * 60000;
        daysLog.push({
          dateStr: new Date(d.getTime() - tzoffset).toISOString().slice(0, 10),
          label: i === 0 ? 'Сьогодні' : weekdayLabels[d.getDay()],
          calories: 0, protein: 0, fat: 0, carbs: 0
        });
      }

      const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
      const weeksRaw = [{ label: 'Т1', calories: 0, protein: 0, fat: 0, carbs: 0 }, { label: 'Т2', calories: 0, protein: 0, fat: 0, carbs: 0 }, { label: 'Т3', calories: 0, protein: 0, fat: 0, carbs: 0 }];
      const weekDaysSet = [new Set<string>(), new Set<string>(), new Set<string>()];

      const monthNames = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
      const getMonthName = (offset: number) => { let m = todayDate.getMonth() - offset; if (m < 0) m += 12; return monthNames[m]; };
      const monthsRaw = [{ label: getMonthName(2), calories: 0, protein: 0, fat: 0, carbs: 0 }, { label: getMonthName(1), calories: 0, protein: 0, fat: 0, carbs: 0 }, { label: getMonthName(0), calories: 0, protein: 0, fat: 0, carbs: 0 }];
      const monthDaysSet = [new Set<string>(), new Set<string>(), new Set<string>()];

      const uniqueProducts: { [key: string]: HistoryItem } = {};
      
      if (allDiaryRecords) {
        allDiaryRecords.forEach((record) => {
          if (!record.date) return;
          if (record.name && !uniqueProducts[record.name] && record.weight) {
            uniqueProducts[record.name] = {
              name: record.name, calories: Math.round((record.calories / record.weight) * 100) || 0,
              protein: Math.round(((record.protein || 0) / record.weight) * 100) || 0,
              fat: Math.round(((record.fat || 0) / record.weight) * 100) || 0, carbs: Math.round(((record.carbs || 0) / record.weight) * 100) || 0,
            };
          }
          const targetDay = daysLog.find(day => day.dateStr === record.date);
          if (targetDay) {
            targetDay.calories += record.calories || 0; targetDay.protein += record.protein || 0;
            targetDay.fat += record.fat || 0; targetDay.carbs += record.carbs || 0;
          }
          const [y, m, d] = record.date.split('-').map(Number);
          const recordDate = new Date(y, m - 1, d);
          const diffDays = Math.floor((todayDate.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 20) {
            let wIndex = 2; if (diffDays > 6 && diffDays <= 13) wIndex = 1; if (diffDays > 13) wIndex = 0;
            weeksRaw[wIndex].calories += record.calories || 0; weeksRaw[wIndex].protein += record.protein || 0;
            weeksRaw[wIndex].fat += record.fat || 0; weeksRaw[wIndex].carbs += record.carbs || 0; weekDaysSet[wIndex].add(record.date);
          }
          const mDiff = (todayDate.getFullYear() - recordDate.getFullYear()) * 12 + (todayDate.getMonth() - recordDate.getMonth());
          if (mDiff >= 0 && mDiff <= 2) {
            let mIndex = 2 - mDiff; monthsRaw[mIndex].calories += record.calories || 0; monthsRaw[mIndex].protein += record.protein || 0;
            monthsRaw[mIndex].fat += record.fat || 0; monthsRaw[mIndex].carbs += record.carbs || 0; monthDaysSet[mIndex].add(record.date);
          }
        });
      }

      const calculateAverage = (rawStats: typeof weeksRaw, daysSets: Set<string>[]) => {
        return rawStats.map((stat, idx) => {
          const count = Math.max(1, daysSets[idx].size);
          return { label: stat.label, calories: Math.round(stat.calories / count), protein: Math.round(stat.protein / count), fat: Math.round(stat.fat / count), carbs: Math.round(stat.carbs / count), hasData: daysSets[idx].size > 0 };
        });
      };

      setDailyStats(daysLog);
      setWeeklyStatsData(calculateAverage(weeksRaw, weekDaysSet));
      setMonthlyStatsData(calculateAverage(monthsRaw, monthDaysSet));
      setHistoryDatabase(Object.values(uniqueProducts));

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 4. ЕФЕКТИ
  useEffect(() => {
    const allowedIds = [495727332, 549440234, "495727332", "549440234"];

    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
      const webApp = window.Telegram.WebApp;
      webApp.ready();
      webApp.expand();
      
      const tgUser = webApp.initDataUnsafe?.user;
      
      if (tgUser && tgUser.id) {
        const tgId = tgUser.id;
        
        if (allowedIds.includes(tgId) || allowedIds.includes(tgId.toString())) {
          setIsAuthorized(true);
          setUserId(tgId.toString());
          setUserName(tgUser.first_name || 'Користувач');
          fetchUserData();
          return;
        }
      }
    }

    const timeout = setTimeout(() => {
      if (isAuthorized === null) {
        setIsAuthorized(false);
        setLoading(false);
      }
    }, 1200);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab !== 'scanner') {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
        codeReaderRef.current = null;
      }
      setIsScanning(false);
      setScanMessage('');
    }
  }, [activeTab]);

  // 5. ДОПОМІЖНІ ФУНКЦІЇ ТА ОБРОБНИКИ
  const totalCalories = foodList.reduce((sum, item) => sum + item.cal, 0);
  const totalProtein = foodList.reduce((sum, item) => sum + item.protein, 0);
  const totalFat = foodList.reduce((sum, item) => sum + item.fat, 0);
  const totalCarbs = foodList.reduce((sum, item) => sum + item.carbs, 0);

  const filteredHistory = historyDatabase.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const totalGrams = Number(goalsInput.protein) + Number(goalsInput.fat) + Number(goalsInput.carbs);
  const pPct = totalGrams ? Math.round((Number(goalsInput.protein) / totalGrams) * 100) : 0;
  const fPct = totalGrams ? Math.round((Number(goalsInput.fat) / totalGrams) * 100) : 0;
  const cPct = totalGrams ? 100 - pPct - fPct : 0;

  const handleSelectFromHistory = (item: HistoryItem) => {
    setFormData({ name: item.name, calories: item.calories.toString(), protein: item.protein.toString(), fat: item.fat.toString(), carbs: item.carbs.toString(), weight: '' });
    setActiveTab('manual');
  };

  const handleDeleteFoodItem = async (id: number, name: string) => {
    if (!confirm(`Видалити "${name}" зі списку за сьогодні?`)) return;
    await supabase.from('food_diary').delete().eq('id', id);
    setFoodList(foodList.filter(item => item.id !== id));
    fetchUserData();
  };

  const handleDeleteFromHistory = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Видалити "${name}" з історії пошуку?`)) return;
    await supabase.from('food_diary').delete().eq('user_id', 'default_user').eq('name', name);
    setHistoryDatabase(historyDatabase.filter(item => item.name !== name));
  };

  const lookupProduct = async (barcode: string) => {
    setScanMessage('Шукаю в базі: ' + barcode);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await res.json();

      if (data.status === 1) {
        const p = data.product.nutriments;
        setFormData({
          ...formData,
          name: data.product.product_name || 'Невідомий продукт',
          calories: (p['energy-kcal_100g'] || 0).toString(),
          protein: (p['proteins_100g'] || 0).toString(),
          fat: (p['fat_100g'] || 0).toString(),
          carbs: (p['carbohydrates_100g'] || 0).toString(),
        });
        setActiveTab('manual');
        setScanMessage('');
      } else {
        setScanMessage('❌ Продукт не знайдено — введи вручну.');
      }
    } catch (e) {
      console.error(e);
      setScanMessage('Помилка мережі при пошуку.');
    }
  };

  // ════ РОЗУМНИЙ СКАНЕР КАМЕРИ ════
  const startScanning = async (overrideCamIndex: number | null = null) => {
    setIsScanning(true);
    setScanMessage('Запуск камери...');
    try {
      const ZXing = await import('@zxing/library');
      const codeReader = new ZXing.BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;
      
      const isAndroid = typeof navigator !== 'undefined' && /android/i.test((navigator as any).userAgent || (navigator as any).vendor || '');

      let constraints: any = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          advanced: [{ focusMode: 'continuous' }]
        }
      };

      if (isAndroid) {
        const devices = await codeReader.listVideoInputDevices();
        
        // Шукаємо тільки задні камери, відкидаючи фронталки
        const backCams = devices.filter(d => 
          !d.label.toLowerCase().includes('front') && 
          !d.label.toLowerCase().includes('фронт') && 
          (d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('задня'))
        );
        
        // Якщо за 'back' не знайшли, беремо всі, крім фронталки
        const targetCams = backCams.length > 0 ? backCams : devices.filter(d => !d.label.toLowerCase().includes('front'));
        const finalCams = targetCams.length > 0 ? targetCams : devices;
        
        setAvailableCameras(finalCams);

        let selectedDeviceId: string | null = null;
        
        if (finalCams.length > 0) {
          if (overrideCamIndex !== null) {
            // Клік по кнопці "Змінити"
            const safeIndex = overrideCamIndex % finalCams.length;
            setCurrentCamIdx(safeIndex);
            selectedDeviceId = finalCams[safeIndex].deviceId;
            localStorage.setItem('vibe_tracker_preferred_cam', selectedDeviceId);
          } else {
            // Запуск вперше — перевіряємо пам'ять
            const savedCamId = localStorage.getItem('vibe_tracker_preferred_cam');
            const savedIdx = finalCams.findIndex(c => c.deviceId === savedCamId);
            
            if (savedIdx !== -1) {
              // Знайшли збережену ідеальну камеру
              setCurrentCamIdx(savedIdx);
              selectedDeviceId = savedCamId;
            } else {
              // За замовчуванням беремо останню камеру (на Android це найчастіше найкраща лінза)
              const defaultIdx = finalCams.length - 1;
              setCurrentCamIdx(defaultIdx);
              selectedDeviceId = finalCams[defaultIdx].deviceId;
            }
          }

          constraints = {
            video: {
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1920, min: 640 },
              height: { ideal: 1080, min: 480 },
              advanced: [{ focusMode: 'continuous' }]
            }
          };
        }
      }

      codeReader.decodeFromConstraints(constraints, 'video-preview', (result: any) => {
        if (result) {
          const barcode = result.getText();
          stopScanning();
          lookupProduct(barcode);
        }
      });
    } catch (err) {
      console.error(err);
      setScanMessage('Помилка доступу до камери.');
    }
  };

  const switchCamera = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    startScanning(currentCamIdx + 1);
  };

  const stopScanning = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    setIsScanning(false);
    setScanMessage('');
  };

  const handleAddFood = async () => {
    if (!formData.name || !formData.calories || !formData.weight) return;
    const weightRatio = Number(formData.weight) / 100;
    
    await supabase.from('food_diary').insert([{
      user_id: 'default_user', name: formData.name, weight: Number(formData.weight),
      calories: Math.round(Number(formData.calories) * weightRatio),
      protein: Math.round(Number(formData.protein) * weightRatio),
      fat: Math.round(Number(formData.fat) * weightRatio),
      carbs: Math.round(Number(formData.carbs) * weightRatio),
      color: '#FF6EB4', date: getTodayDateString()
    }]);

    setFormData({ name: '', calories: '', protein: '', fat: '', carbs: '', weight: '' });
    fetchUserData();
    setCurrentScreen('home');
  };

  const handleSaveGoals = async () => {
    await supabase.from('user_goals').upsert({ user_id: 'default_user', ...goalsInput }, { onConflict: 'user_id' });
    setUserGoals({ ...goalsInput });
    setCurrentScreen('home');
  };

  // 6. ВІЗУАЛІЗАЦІЯ
  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-center p-5">
        <div className="bg-slate-800 rounded-[30px] p-8 text-center shadow-2xl border border-slate-700 w-full max-w-[320px]">
          <div className="text-5xl mb-4">⛔️</div>
          <h1 className="text-xl font-bold text-white mb-2">Доступ закрито</h1>
          <p className="text-xs text-gray-400 mb-4">Цей щоденник є приватним.</p>
          <div className="bg-slate-950 p-3 rounded-xl text-left font-mono text-[10px] text-pink-400 border border-slate-800">
            <p>ℹ️ ДІАГНОСТИКА:</p>
            <p>• Твій ТГ ID: <span className="text-white font-bold">{userId || 'НЕ ЗНАЙДЕНО'}</span></p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || isAuthorized === null) {
    return (
      <div className="min-h-screen bg-slate-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6EB4]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-[#2D2D2D] p-4 flex justify-center items-center">
      <div className="w-[360px] h-[740px] bg-white rounded-[40px] border border-[#FF85B2]/20 overflow-hidden shadow-xl relative flex flex-col justify-between">
        
        {/* Хедер додатку */}
        <div className="h-6 w-full flex items-center justify-center bg-white flex-shrink-0">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-2"></div>
        </div>

        {/* ═══ ЕКРАН 1: СЬОГОДНІ ═══ */}
        {currentScreen === 'home' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white pb-20">
            <div className="flex justify-between items-center my-4">
              <div>
                <h1 className="text-xl font-bold text-[#2D2D2D]">Привіт, {userName}! 👋</h1>
                <p className="text-xs text-gray-400 capitalize">{new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
              <div className="w-8 h-8 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center justify-center text-sm">🔥</div>
            </div>

            <div className="flex justify-center my-6">
              <div className="w-36 h-36 rounded-full border-8 border-pink-50/50 flex flex-col items-center justify-center shadow-sm">
                <span className="text-3xl font-black text-[#FF6EB4]">{totalCalories}</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">ккал</span>
                <span className="text-[9px] text-gray-400 mt-0.5">з {userGoals.calories}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="bg-pink-50/10 border border-pink-100/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-gray-400 font-bold mb-0.5">Білки</p>
                <p className="text-xs font-bold text-[#FF9ED6]">{totalProtein}г</p>
                <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-[#FF9ED6]" style={{ width: `${Math.min((totalProtein / userGoals.protein) * 100, 100)}%` }}></div></div>
              </div>
              <div className="bg-pink-50/10 border border-pink-100/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-gray-400 font-bold mb-0.5">Жири</p>
                <p className="text-xs font-bold text-[#C96EFF]">{totalFat}г</p>
                <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-[#C96EFF]" style={{ width: `${Math.min((totalFat / userGoals.fat) * 100, 100)}%` }}></div></div>
              </div>
              <div className="bg-pink-50/10 border border-pink-100/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-gray-400 font-bold mb-0.5">Вугл.</p>
                <p className="text-xs font-bold text-[#FF6EB4]">{totalCarbs}г</p>
                <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-[#FF6EB4]" style={{ width: `${Math.min((totalCarbs / userGoals.carbs) * 100, 100)}%` }}></div></div>
              </div>
            </div>

            <p className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2">Прийоми їжі</p>
            <div className="flex flex-col gap-2">
              {foodList.length === 0 ? <p className="text-center text-xs text-gray-300 py-6">Сьогодні ще нічого не додано</p> : 
                foodList.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-pink-50/10 border border-pink-100/20 rounded-xl p-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <div className="flex-grow">
                      <p className="text-xs font-semibold text-gray-700">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.weight}г · Б:{item.protein} Ж:{item.fat} В:{item.carbs}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#FF6EB4]">{item.cal}</span>
                      <button onClick={() => handleDeleteFoodItem(item.id, item.name)} className="text-gray-300 hover:text-red-400 text-xs p-1">🗑️</button>
                    </div>
                  </div>
              ))}
            </div>
            <button onClick={() => setCurrentScreen('add')} className="absolute bottom-20 right-5 w-12 h-12 rounded-2xl bg-[#FF6EB4] flex items-center justify-center text-white font-bold text-2xl shadow-lg active:scale-95">+</button>
          </div>
        )}

        {/* ═══ ЕКРАН 2: ДОДАВАННЯ ЇЖІ ═══ */}
        {currentScreen === 'add' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white flex flex-col">
            <div className="my-4">
              <h1 className="text-xl font-bold text-[#2D2D2D]">Додати їжу</h1>
            </div>

            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl mb-4 flex-shrink-0">
              <button onClick={() => setActiveTab('manual')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${activeTab === 'manual' ? 'bg-white text-[#FF6EB4] shadow-sm' : 'text-gray-400'}`}>✏️ Ввід</button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${activeTab === 'history' ? 'bg-white text-[#FF6EB4] shadow-sm' : 'text-gray-400'}`}>🕐 Історія</button>
              <button onClick={() => setActiveTab('scanner')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${activeTab === 'scanner' ? 'bg-white text-[#FF6EB4] shadow-sm' : 'text-gray-400'}`}>📷 Сканер</button>
            </div>

            {activeTab === 'manual' && (
              <div className="flex flex-col gap-2.5 pb-20">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Назва</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Банан" className="w-full bg-transparent text-xs outline-none text-gray-700" />
                </div>
                <div className="flex gap-2">
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Ккал (на 100 г)</label>
                    <input type="number" value={formData.calories} onChange={(e) => setFormData({ ...formData, calories: e.target.value })} className="w-full bg-transparent text-xs outline-none text-gray-700" />
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Білки (на 100 г)</label>
                    <input type="number" value={formData.protein} onChange={(e) => setFormData({ ...formData, protein: e.target.value })} className="w-full bg-transparent text-xs outline-none text-gray-700" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Жири (на 100 г)</label>
                    <input type="number" value={formData.fat} onChange={(e) => setFormData({ ...formData, fat: e.target.value })} className="w-full bg-transparent text-xs outline-none text-gray-700" />
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Вуглеводи (на 100 г)</label>
                    <input type="number" value={formData.carbs} onChange={(e) => setFormData({ ...formData, carbs: e.target.value })} className="w-full bg-transparent text-xs outline-none text-gray-700" />
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 border-dashed mt-1">
                  <label className="text-[9px] uppercase font-bold text-[#FF6EB4] block mb-0.5">Порція (грами)</label>
                  <input type="number" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="Вага порції" className="w-full bg-transparent text-xs outline-none font-bold text-[#FF6EB4]" />
                </div>
                <button onClick={handleAddFood} className="w-full bg-[#FF6EB4] text-white py-2.5 rounded-xl font-bold text-xs mt-1 uppercase tracking-wider">Додати в щоденник</button>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col flex-grow overflow-hidden pb-20">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 Пошук..." className="w-full bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-xs outline-none text-gray-700 mb-3" />
                <div className="flex-grow overflow-y-auto flex flex-col gap-2">
                  {filteredHistory.map((item, idx) => (
                    <div key={idx} onClick={() => handleSelectFromHistory(item)} className="flex justify-between items-center bg-gray-50 border border-gray-100/50 p-2.5 rounded-xl cursor-pointer">
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{item.name}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">Б:{item.protein} Ж:{item.fat} В:{item.carbs} · на 100г</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#FF6EB4]">{item.calories} ккал</span>
                        <button onClick={(e) => handleDeleteFromHistory(item.name, e)} className="text-gray-300 hover:text-red-400 text-xs p-1">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'scanner' && (
              <div className="flex flex-col gap-4 items-center flex-grow pb-20 pt-4">
                <div className="w-full h-64 bg-slate-900 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-gray-700">
                  {isScanning ? (
                    <>
                      <video id="video-preview" playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover"></video>
                      <div className="absolute inset-0 border-[40px] border-black/50 z-10 pointer-events-none">
                        <div className="w-full h-full border-2 border-[#FF6EB4] rounded-xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-[#FF6EB4]/50 animate-pulse"></div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4 z-10">
                      <span className="text-5xl mb-3 block">📷</span>
                      <p className="text-xs font-medium text-gray-400">Наведи камеру на штрихкод</p>
                    </div>
                  )}
                </div>

                {scanMessage && (
                  <div className="bg-pink-50 text-[#FF6EB4] px-4 py-2 rounded-xl text-[10px] font-bold text-center w-full shadow-sm">
                    {scanMessage}
                  </div>
                )}

                {isScanning ? (
                  <div className="flex gap-2 w-full mt-2">
                    {availableCameras.length > 1 && (
                      <button onClick={switchCamera} className="flex-1 bg-slate-200 text-gray-600 py-3 rounded-xl font-bold text-[10px] uppercase tracking-wider active:scale-95 shadow-sm border border-slate-300">
                        🔄 Інша ({currentCamIdx + 1}/{availableCameras.length})
                      </button>
                    )}
                    <button onClick={stopScanning} className="flex-1 bg-slate-200 text-gray-600 py-3 rounded-xl font-bold text-[10px] uppercase tracking-wider active:scale-95 shadow-sm border border-slate-300">
                      Зупинити
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startScanning(null)} className="w-full bg-[#FF6EB4] text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider mt-2 shadow-md active:scale-95">
                    Почати сканування
                  </button>
                )}
                
                <p className="text-[9px] text-gray-400 text-center mt-2 px-4 leading-relaxed">
                  Дані надаються Open Food Facts API.<br/>Локальні або рідкісні бренди можуть бути відсутні в базі.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══ ЕКРАН 3: СТАТИСТИКА ═══ */}
        {currentScreen === 'stats' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white flex flex-col pb-20">
            <div className="my-4 flex-shrink-0">
              <h1 className="text-xl font-bold text-[#2D2D2D]">Статистика</h1>
            </div>
            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl mb-4 flex-shrink-0">
              <button onClick={() => setStatsMode('days')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all ${statsMode === 'days' ? 'bg-[#FF6EB4] text-white shadow-sm' : 'text-gray-400'}`}>Дні</button>
              <button onClick={() => setStatsMode('weeks')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all ${statsMode === 'weeks' ? 'bg-[#FF6EB4] text-white shadow-sm' : 'text-gray-400'}`}>Тижні</button>
              <button onClick={() => setStatsMode('months')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all ${statsMode === 'months' ? 'bg-[#FF6EB4] text-white shadow-sm' : 'text-gray-400'}`}>Місяці</button>
            </div>
            <div className="bg-pink-50/10 border border-pink-100/30 rounded-2xl p-4 mb-4 flex-shrink-0 relative">
              <div className="h-28 flex items-end gap-3 relative pb-5 border-b border-gray-100">
                <div className="absolute left-0 right-0 border-t border-dashed border-[#FF85B2]/40" style={{ bottom: '75px' }}>
                  <span className="absolute right-0 -top-3.5 text-[8px] font-bold text-[#FF6EB4] bg-white px-1">{userGoals.calories} ккал</span>
                </div>
                {statsMode === 'days' && dailyStats.map((day, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                    <div className={`w-full rounded-t-md transition-all duration-300 ${day.label === 'Сьогодні' ? 'bg-[#FF6EB4] ring-4 ring-pink-100' : 'bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6]'}`} style={{ height: `${Math.min((day.calories / userGoals.calories) * 100, 100)}%` }}></div>
                    <span className={`text-[9px] absolute bottom-0 ${day.label === 'Сьогодні' ? 'font-bold text-[#FF6EB4]' : 'text-gray-400'}`}>{day.label}</span>
                  </div>
                ))}
                {statsMode === 'weeks' && weeklyStatsData.map((week, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                    <div className={`w-full rounded-t-md transition-all duration-300 ${idx === 2 ? 'bg-[#FF6EB4] ring-4 ring-pink-100' : 'bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6]'}`} style={{ height: `${Math.min((week.calories / userGoals.calories) * 100, 100)}%` }}></div>
                    <span className={`text-[9px] absolute bottom-0 ${idx === 2 ? 'font-bold text-[#FF6EB4]' : 'text-gray-400'}`}>{week.label}</span>
                  </div>
                ))}
                {statsMode === 'months' && monthlyStatsData.map((month, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                    <div className={`w-full rounded-t-md transition-all duration-300 ${idx === 2 ? 'bg-[#FF6EB4] ring-4 ring-pink-100' : 'bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6]'}`} style={{ height: `${Math.min((month.calories / userGoals.calories) * 100, 100)}%` }}></div>
                    <span className={`text-[9px] absolute bottom-0 ${idx === 2 ? 'font-bold text-[#FF6EB4]' : 'text-gray-400'}`}>{month.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-grow overflow-y-auto flex flex-col gap-2">
              {statsMode === 'days' && dailyStats.slice().reverse().map((day, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-700">{day.dateStr === getTodayDateString() ? 'Сьогодні' : day.dateStr}</span>
                    <span className={`text-xs font-black ${day.calories > 0 ? 'text-[#FF6EB4]' : 'text-gray-400'}`}>{day.calories} ккал</span>
                  </div>
                  <p className="text-[9px] text-gray-400">{day.calories > 0 ? `Б: ${day.protein}г · Ж: ${day.fat}г · В: ${day.carbs}г` : 'Записи відсутні'}</p>
                </div>
              ))}
              {statsMode === 'weeks' && [...weeklyStatsData].reverse().map((week, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-700">{idx === 0 ? 'Поточний тиждень' : idx === 1 ? 'Минулий тиждень' : 'Позаминулий'}</span>
                    <span className={`text-xs font-black ${week.hasData ? 'text-[#FF6EB4]' : 'text-gray-400'}`}>{week.calories} ккал/день</span>
                  </div>
                  <p className="text-[9px] text-gray-400">{week.hasData ? `Б: ${week.protein}г · Ж: ${week.fat}г · В: ${week.carbs}г` : 'Записи відсутні'}</p>
                </div>
              ))}
              {statsMode === 'months' && [...monthlyStatsData].reverse().map((month, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-700">{idx === 0 ? 'Поточний місяць' : idx === 1 ? 'Минулий місяць' : 'Позаминулий'}</span>
                    <span className={`text-xs font-black ${month.hasData ? 'text-[#FF6EB4]' : 'text-gray-400'}`}>{month.calories} ккал/день</span>
                  </div>
                  <p className="text-[9px] text-gray-400">{month.hasData ? `Б: ${month.protein}г · Ж: ${month.fat}г · В: ${month.carbs}г` : 'Записи відсутні'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ЕКРАН 4: НАЛАШТУВАННЯ ЦІЛЕЙ ═══ */}
        {currentScreen === 'goals' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white flex flex-col pb-20">
            <div className="my-4 flex-shrink-0">
              <h1 className="text-xl font-bold text-[#2D2D2D]">Мої цілі</h1>
            </div>
            <div className="flex flex-col gap-3">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Норма калорій (ккал)</label>
                <input type="number" value={goalsInput.calories} onChange={(e) => setGoalsInput({ ...goalsInput, calories: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
              </div>
              <div className="flex gap-2">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                  <label className="text-[9px] uppercase font-bold text-[#FF9ED6] block mb-0.5">Білки (г)</label>
                  <input type="number" value={goalsInput.protein} onChange={(e) => setGoalsInput({ ...goalsInput, protein: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                  <label className="text-[9px] uppercase font-bold text-[#C96EFF] block mb-0.5">Жири (г)</label>
                  <input type="number" value={goalsInput.fat} onChange={(e) => setGoalsInput({ ...goalsInput, fat: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex-1">
                  <label className="text-[9px] uppercase font-bold text-[#FF6EB4] block mb-0.5">Вуглеводи (г)</label>
                  <input type="number" value={goalsInput.carbs} onChange={(e) => setGoalsInput({ ...goalsInput, carbs: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
                </div>
              </div>
              <div className="bg-pink-50/10 border border-pink-100/40 rounded-xl p-3 mt-1">
                <p className="text-[9px] font-bold text-[#FF6EB4] uppercase tracking-wider mb-2">Розподіл БЖВ</p>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
                  <div className="h-full bg-[#FF9ED6]" style={{ width: `${pPct}%` }}></div><div className="h-full bg-[#C96EFF]" style={{ width: `${fPct}%` }}></div><div className="h-full bg-[#FF6EB4]" style={{ width: `${cPct}%` }}></div>
                </div>
                <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-1.5"><span>Б: {pPct}%</span><span>Ж: {fPct}%</span><span>В: {cPct}%</span></div>
              </div>
              <button onClick={handleSaveGoals} className="w-full bg-[#FF6EB4] text-white py-3 rounded-2xl font-bold text-xs mt-2 uppercase tracking-wider shadow-sm active:scale-95">Зберегти норми</button>
            </div>
          </div>
        )}

        {/* НАВІГАЦІЯ */}
        <div className="absolute bottom-0 w-full border-t border-gray-100 flex justify-around py-3 bg-white text-gray-300 text-[10px] font-bold flex-shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-50 rounded-b-[40px]">
          <button onClick={() => setCurrentScreen('home')} className={`flex flex-col items-center ${currentScreen === 'home' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>🏠</span><span>Сьогодні</span></button>
          <button onClick={() => setCurrentScreen('add')} className={`flex flex-col items-center ${currentScreen === 'add' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>➕</span><span>Додати</span></button>
          <button onClick={() => setCurrentScreen('stats')} className={`flex flex-col items-center ${currentScreen === 'stats' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>📊</span><span>Статистика</span></button>
          <button onClick={() => setCurrentScreen('goals')} className={`flex flex-col items-center ${currentScreen === 'goals' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>🎯</span><span>Цілі</span></button>
        </div>
      </div>
    </div>
  );
}
