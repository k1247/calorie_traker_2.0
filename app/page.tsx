'use client';

import React, { useState, useEffect } from 'react';
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

export default function Home() {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
    weight: '',
  });

  // Отримуємо поточну дату у форматі YYYY-MM-DD (локальну)
  const getTodayDateString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    return localISOTime;
  };

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
  }, []);

  const fetchUserData = async () => {
    try {
      const todayStr = getTodayDateString();

      // 1. Завантажуємо цілі
      const { data: goalsData } = await supabase
        .from('user_goals')
        .select('calories, protein, fat, carbs')
        .eq('user_id', 'default_user')
        .maybeSingle();

      if (goalsData) {
        setUserGoals(goalsData);
        setGoalsInput(goalsData);
      }

      // 2. Завантажуємо щоденник тільки за СЬОГОДНІ для обнулення дня
      const { data: diaryData } = await supabase
        .from('food_diary')
        .select('id, name, weight, calories, protein, fat, carbs, color, date')
        .eq('user_id', 'default_user')
        .eq('date', todayStr) // Фільтр чисто під сьогоднішній день
        .order('created_at', { ascending: false });

      if (diaryData) {
        const formattedList = diaryData.map((item) => ({
          id: item.id,
          name: item.name,
          weight: item.weight,
          cal: item.calories,
          protein: item.protein || 0,
          fat: item.fat || 0,
          carbs: item.carbs || 0,
          color: item.color,
        }));
        setFoodList(formattedList);
      }

      // 3. Завантажуємо ВСЮ історію продуктів (без фільтра по даті) для вкладки Історія
      const { data: allHistoryData } = await supabase
        .from('food_diary')
        .select('name, weight, calories, protein, fat, carbs')
        .eq('user_id', 'default_user');

      const uniqueProducts: { [key: string]: HistoryItem } = {};
      const defaultHistory = [
        { name: 'Куряча грудка', calories: 110, protein: 23, fat: 2, carbs: 0 },
        { name: 'Вівсянка сухофрукти', calories: 369, protein: 13, fat: 7, carbs: 62 },
        { name: 'Гречка варена', calories: 92, protein: 3, fat: 1, carbs: 20 },
        { name: 'Авокадо хасс', calories: 160, protein: 2, fat: 15, carbs: 9 },
      ];
      defaultHistory.forEach((p) => { uniqueProducts[p.name] = p; });

      if (allHistoryData) {
        allHistoryData.forEach((item) => {
          if (!uniqueProducts[item.name]) {
            uniqueProducts[item.name] = {
              name: item.name,
              calories: Math.round((item.calories / item.weight) * 100) || 0,
              protein: Math.round(((item.protein || 0) / item.weight) * 100) || 0,
              fat: Math.round(((item.fat || 0) / item.weight) * 100) || 0,
              carbs: Math.round(((item.carbs || 0) / item.weight) * 100) || 0,
            };
          }
        });
      }
      setHistoryDatabase(Object.values(uniqueProducts));

    } catch (e) {
      console.error(e);
    } finaly {
      setLoading(false);
    }
  };

  // Розрахунок фактично з'їденого за сьогодні
  const totalCalories = foodList.reduce((sum, item) => sum + item.cal, 0);
  const totalProtein = foodList.reduce((sum, item) => sum + item.protein, 0);
  const totalFat = foodList.reduce((sum, item) => sum + item.fat, 0);
  const totalCarbs = foodList.reduce((sum, item) => sum + item.carbs, 0);

  const filteredHistory = historyDatabase.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalGrams = Number(goalsInput.protein) + Number(goalsInput.fat) + Number(goalsInput.carbs);
  const pPct = totalGrams ? Math.round((Number(goalsInput.protein) / totalGrams) * 100) : 0;
  const fPct = totalGrams ? Math.round((Number(goalsInput.fat) / totalGrams) * 100) : 0;
  const cPct = totalGrams ? 100 - pPct - fPct : 0;

  const handleSelectFromHistory = (item: HistoryItem) => {
    setFormData({
      name: item.name,
      calories: item.calories.toString(),
      protein: item.protein.toString(),
      fat: item.fat.toString(),
      carbs: item.carbs.toString(),
      weight: '',
    });
    setActiveTab('manual');
  };

  // ВИДАЛЕННЯ ЗАПИСУ ЗІ СЬОГОДНІШНЬОГО ДНЯ
  const handleDeleteFoodItem = async (id: number) => {
    const { error } = await supabase
      .from('food_diary')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Не вдалося видалити запис');
      return;
    }
    setFoodList(foodList.filter(item => item.id !== id));
  };

  // ВИДАЛЕННЯ ПРОДУКТУ З ІСТОРІЇ НАЗАВЖДИ
  const handleDeleteFromHistory = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation(); // щоб не спрацьовував клік по всій картці
    if (!confirm(`Видалити "${name}" з історії пошуку?`)) return;

    const { error } = await supabase
      .from('food_diary')
      .delete()
      .eq('user_id', 'default_user')
      .eq('name', name);

    if (error) {
      alert('Помилка при видаленні з історії');
      return;
    }
    setHistoryDatabase(historyDatabase.filter(item => item.name !== name));
  };

  const handleSimulateScan = () => {
    setFormData({
      name: 'Розпізнаний Сир (OCR)',
      calories: '285',
      protein: '14',
      fat: '11',
      carbs: '32',
      weight: '',
    });
    setActiveTab('manual');
  };

  const handleAddFood = async () => {
    if (!formData.name || !formData.calories || !formData.weight) return;

    const weightRatio = Number(formData.weight) / 100;
    const calculatedCal = Math.round(Number(formData.calories) * weightRatio);
    const calcProtein = Math.round(Number(formData.protein) * weightRatio);
    const calcFat = Math.round(Number(formData.fat) * weightRatio);
    const calcCarbs = Math.round(Number(formData.carbs) * weightRatio);
    const todayStr = getTodayDateString();

    const { data, error } = await supabase
      .from('food_diary')
      .insert([
        {
          user_id: 'default_user',
          name: formData.name,
          weight: Number(formData.weight),
          calories: calculatedCal,
          protein: calcProtein,
          fat: calcFat,
          carbs: calcCarbs,
          color: '#FF6EB4',
          date: todayStr // Записуємо реальну дату створення
        },
      ])
      .select();

    if (error) {
      alert('Помилка бази даних!');
      return;
    }

    if (data && data[0]) {
      const newFood: FoodItem = {
        id: data[0].id,
        name: data[0].name,
        weight: data[0].weight,
        cal: data[0].calories,
        protein: data[0].protein || 0,
        fat: data[0].fat || 0,
        carbs: data[0].carbs || 0,
        color: data[0].color,
      };
      setFoodList([newFood, ...foodList]);

      if (!historyDatabase.find((h) => h.name === formData.name)) {
        setHistoryDatabase((prev) => [
          ...prev,
          {
            name: formData.name,
            calories: Number(formData.calories),
            protein: Number(formData.protein),
            fat: Number(formData.fat),
            carbs: Number(formData.carbs),
          },
        ]);
      }
    }

    setFormData({ name: '', calories: '', protein: '', fat: '', carbs: '', weight: '' });
    setCurrentScreen('home');
  };

  const handleSaveGoals = async () => {
    const { error } = await supabase.from('user_goals').upsert(
      {
        user_id: 'default_user',
        calories: goalsInput.calories,
        protein: goalsInput.protein,
        fat: goalsInput.fat,
        carbs: goalsInput.carbs,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      alert('Помилка збереження цілей!');
      return;
    }

    setUserGoals({ ...goalsInput });
    setCurrentScreen('home');
  };

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
            <p>• Твій ТГ Name: <span className="text-white">{userName || 'Немає'}</span></p>
            <p>• Скрипт ТГ: <span className="text-white">{typeof window !== 'undefined' && window.Telegram ? 'Завантажено' : 'ВІДСУТНІЙ'}</span></p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || isAuthorized === null) {
    return (
      <div className="min-h-screen bg-slate-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6EB4] mx-auto mb-3"></div>
          <p className="text-xs text-gray-400 font-medium">Зв'язок з Supabase...</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="min-h-screen bg-slate-100 text-[#2D2D2D] p-4 flex justify-center items-center">
      <div className="w-[360px] h-[740px] bg-white rounded-[40px] border border-[#FF85B2]/20 overflow-hidden shadow-xl relative flex flex-col justify-between">
        <div className="h-6 w-full flex items-center justify-center bg-white flex-shrink-0">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-2"></div>
        </div>

        {/* ═══ ЕКРАН 1: СЬОГОДНІ ═══ */}
        {currentScreen === 'home' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white">
            <div className="flex justify-between items-center my-4">
              <div>
                <h1 className="text-xl font-bold text-[#2D2D2D]">Привіт, {userName}! 👋</h1>
                <p className="text-xs text-gray-400 capitalize">{today}</p>
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
                <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#FF9ED6]" style={{ width: `${Math.min((totalProtein / userGoals.protein) * 100, 100)}%` }}></div>
                </div>
                <p className="text-[8px] text-gray-300 mt-1">з {userGoals.protein}г</p>
              </div>
              <div className="bg-pink-50/10 border border-pink-100/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-gray-400 font-bold mb-0.5">Жири</p>
                <p className="text-xs font-bold text-[#C96EFFিলেন]">{totalFat}г</p>
                <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#C96EFF]" style={{ width: `${Math.min((totalFat / userGoals.fat) * 100, 100)}%` }}></div>
                </div>
                <p className="text-[8px] text-gray-300 mt-1">з {userGoals.fat}г</p>
              </div>
              <div className="bg-pink-50/10 border border-pink-100/50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-gray-400 font-bold mb-0.5">Вугл.</p>
                <p className="text-xs font-bold text-[#FF6EB4]">{totalCarbs}г</p>
                <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#FF6EB4]" style={{ width: `${Math.min((totalCarbs / userGoals.carbs) * 100, 100)}%` }}></div>
                </div>
                <p className="text-[8px] text-gray-300 mt-1">з {userGoals.carbs}г</p>
              </div>
            </div>

            <p className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2">Прийоми їжі за сьогодні</p>
            <div className="flex flex-col gap-2 mb-20">
              {foodList.length === 0 ? (
                <p className="text-center text-xs text-gray-300 py-6">Сьогодні ще нічого не додано</p>
              ) : (
                foodList.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-pink-50/10 border border-pink-100/20 rounded-xl p-3 group relative">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <div className="flex-grow">
                      <p className="text-xs font-semibold text-gray-700">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.weight}г · Б:{item.protein} Ж:{item.fat} В:{item.carbs}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#FF6EB4]">{item.cal}</span>
                      <button onClick={() => handleDeleteFoodItem(item.id)} className="text-gray-300 hover:text-red-400 text-xs p-1 transition-colors">❌</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button onClick={() => setCurrentScreen('add')} className="absolute bottom-20 right-5 w-12 h-12 rounded-2xl bg-[#FF6EB4] flex items-center justify-center text-white font-bold text-2xl shadow-lg active:scale-95 transition-transform">+</button>
          </div>
        )}

        {/* ═══ ЕКРАН 2: ДОДАВАННЯ ЇЖІ ═══ */}
        {currentScreen === 'add' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white flex flex-col">
            <div className="my-4">
              <h1 className="text-xl font-bold text-[#2D2D2D]">Додати їжу</h1>
              <p className="text-xs text-gray-400">Централізована форма</p>
            </div>

            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl mb-4 flex-shrink-0">
              <button onClick={() => setActiveTab('manual')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${activeTab === 'manual' ? 'bg-white text-[#FF6EB4] shadow-sm' : 'text-gray-400'}`}>✏️ Ввід</button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${activeTab === 'history' ? 'bg-white text-[#FF6EB4] shadow-sm' : 'text-gray-400'}`}>🕐 Історія</button>
              <button onClick={() => setActiveTab('scanner')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold ${activeTab === 'scanner' ? 'bg-white text-[#FF6EB4] shadow-sm' : 'text-gray-400'}`}>📷 Сканер</button>
            </div>

            {activeTab === 'manual' && (
              <div className="flex flex-col gap-2.5 pb-6">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Назва продукту</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Наприклад, Банан" className="w-full bg-transparent text-xs outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Калорії (на 100 г)</label>
                  <input type="number" value={formData.calories} onChange={(e) => setFormData({ ...formData, calories: e.target.value })} placeholder="0" className="w-full bg-transparent text-xs outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Білки (на 100 г)</label>
                  <input type="number" value={formData.protein} onChange={(e) => setFormData({ ...formData, protein: e.target.value })} placeholder="0" className="w-full bg-transparent text-xs outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Жири (на 100 г)</label>
                  <input type="number" value={formData.fat} onChange={(e) => setFormData({ ...formData, fat: e.target.value })} placeholder="0" className="w-full bg-transparent text-xs outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Вуглеводи (на 100 г)</label>
                  <input type="number" value={formData.carbs} onChange={(e) => setFormData({ ...formData, carbs: e.target.value })} placeholder="0" className="w-full bg-transparent text-xs outline-none text-gray-700" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 border-dashed mt-1">
                  <label className="text-[9px] uppercase font-bold text-[#FF6EB4] block mb-0.5">Порція (грами)</label>
                  <input type="number" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="Введіть вагу порції" className="w-full bg-transparent text-xs outline-none font-bold text-[#FF6EB4]" />
                </div>
                <button onClick={handleAddFood} className="w-full bg-[#FF6EB4] text-white py-2.5 rounded-xl font-bold text-xs mt-1 uppercase tracking-wider">Додати в щоденник</button>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col flex-grow overflow-hidden">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 Пошук продуктів з бази..." className="w-full bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-xs outline-none text-gray-700 mb-3 flex-shrink-0" />
                <div className="flex-grow overflow-y-auto flex flex-col gap-2 pb-4">
                  {filteredHistory.map((item, idx) => (
                    <div key={idx} onClick={() => handleSelectFromHistory(item)} className="flex justify-between items-center bg-gray-50 border border-gray-100/50 p-2.5 rounded-xl cursor-pointer hover:border-pink-200 group">
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
              <div className="flex flex-col gap-4 items-center justify-center flex-grow pb-10">
                <div className="w-full h-44 bg-slate-900 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center text-white border-2 border-dashed border-[#FF6EB4]/30">
                  <div className="bg-white/90 text-[#2D2D2D] text-[8px] p-2 rounded w-32 font-mono">
                    <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 text-center">NUTRITION FACTS</p>
                    <p className="flex justify-between"><span>Calories:</span><b>285 kcal</b></p>
                  </div>
                </div>
                <button onClick={handleSimulateScan} className="bg-pink-50 text-[#FF6EB4] border border-[#FF85B2]/30 px-5 py-2 rounded-xl text-xs font-bold active:scale-95">📸 Симулювати сканування</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ ЕКРАН 3: СТАТИСТИКА ═══ */}
        {currentScreen === 'stats' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white flex flex-col">
            <div className="my-4 flex-shrink-0">
              <h1 className="text-xl font-bold text-[#2D2D2D]">Статистика</h1>
              <p className="text-xs text-gray-400">Глибока аналітика</p>
            </div>

            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl mb-4 flex-shrink-0">
              <button onClick={() => setStatsMode('days')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all ${statsMode === 'days' ? 'bg-[#FF6EB4] text-white shadow-sm' : 'text-gray-400'}`}>Дні</button>
              <button onClick={() => setStatsMode('weeks')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all ${statsMode === 'weeks' ? 'bg-[#FF6EB4] text-white shadow-sm' : 'text-gray-400'}`}>Тижні</button>
              <button onClick={() => setStatsMode('months')} className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all ${statsMode === 'months' ? 'bg-[#FF6EB4] text-white shadow-sm' : 'text-gray-400'}`}>Місяці</button>
            </div>

            <div className="bg-pink-50/10 border border-pink-100/30 rounded-2xl p-4 mb-4 flex-shrink-0 relative">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-4">
                {statsMode === 'days' && 'Калорії по днях (Динамічний графік)'}
                {statsMode === 'weeks' && 'Середнє по тижнях (Останні місяці)'}
                {statsMode === 'months' && 'Динаміка по місяцях (Поточний рік)'}
              </p>

              <div className="h-28 flex items-end gap-3 relative pb-5 border-b border-gray-100">
                <div className="absolute left-0 right-0 border-t border-dashed border-[#FF85B2]/40" style={{ bottom: '75px' }}>
                  <span className="absolute right-0 -top-3.5 text-[8px] font-bold text-[#FF6EB4] bg-white px-1">
                    {userGoals.calories} ккал
                  </span>
                </div>

                {statsMode === 'days' && (
                  <>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6] rounded-t-md" style={{ height: '70%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Пн</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gray-200 rounded-t-md" style={{ height: '82%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Вт</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6] rounded-t-md" style={{ height: '64%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Ср</span></div>
                    {/* РЕАЛЬНИЙ СТОВПЧИК «СЬОГОДНІ» ЯКИЙ ЗАЛЕЖИТЬ ВІД ЗМІНИ НОРМИ */}
                    <div className="flex-1 flex flex-col items-center h-full justify-end">
                      <div className="w-full bg-[#FF6EB4] rounded-t-md ring-4 ring-pink-100 transition-all duration-300" style={{ height: `${Math.min((totalCalories / userGoals.calories) * 100, 100)}%` }}></div>
                      <span className="text-[9px] font-bold text-[#FF6EB4] absolute bottom-0">Сьогодні</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gray-100 rounded-t-md" style={{ height: '5%' }}></div><span className="text-[9px] text-gray-300 absolute bottom-0">Пт</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gray-100 rounded-t-md" style={{ height: '5%' }}></div><span className="text-[9px] text-gray-300 absolute bottom-0">Сб</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gray-100 rounded-t-md" style={{ height: '5%' }}></div><span className="text-[9px] text-gray-300 absolute bottom-0">Нд</span></div>
                  </>
                )}
                {statsMode === 'weeks' && (
                  <>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gray-200 rounded-t-md" style={{ height: '85%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Т1</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6] rounded-t-md" style={{ height: '78%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Т2</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-[#FF6EB4] rounded-t-md ring-4 ring-pink-100" style={{ height: '68%' }}></div><span className="text-[9px] font-bold text-[#FF6EB4] absolute bottom-0">Т3</span></div>
                  </>
                )}
                {statsMode === 'months' && (
                  <>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gray-200 rounded-t-md" style={{ height: '90%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Бер</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-gradient-to-t from-[#C96EFF] to-[#FF9ED6] rounded-t-md" style={{ height: '75%' }}></div><span className="text-[9px] text-gray-400 absolute bottom-0">Kві</span></div>
                    <div className="flex-1 flex flex-col items-center h-full justify-end"><div className="w-full bg-[#FF6EB4] rounded-t-md ring-4 ring-pink-100" style={{ height: '62%' }}></div><span className="text-[9px] font-bold text-[#FF6EB4] absolute bottom-0">Тра</span></div>
                  </>
                )}
              </div>
            </div>

            <p className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2 flex-shrink-0">Історія записів</p>
            <div className="flex-grow overflow-y-auto flex flex-col gap-2 pb-20">
              {statsMode === 'days' && (
                <>
                  {/* ВИПРАВЛЕНО: Замість ліній КБЖВ тут тепер статичні підписи з цифрами */}
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">Сьогодні (Підсумок)</span>
                      <span className="text-xs font-black text-[#FF6EB4]">{totalCalories} ккал</span>
                    </div>
                    <p className="text-[9px] text-gray-400">Поточне КБЖВ: Б: {totalProtein}г · Ж: {totalFat}г · В: {totalCarbs}г</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">Вчора</span>
                      <span className="text-xs font-black text-gray-700">1820 ккал</span>
                    </div>
                    <p className="text-[9px] text-gray-400">Архівне КБЖВ: Б: 96г · Ж: 58г · В: 194г</p>
                  </div>
                </>
              )}
              {statsMode === 'weeks' && (
                <>
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">Поточний тиждень (Т3)</span>
                      <span className="text-xs font-black text-[#FF6EB4]">1710 ккал/день</span>
                    </div>
                    <p className="text-[9px] text-gray-400">Середнє КБЖВ: Б: 92г · Ж: 61г · В: 185г</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">Минулий тиждень (Т2)</span>
                      <span className="text-xs font-black text-gray-700">1940 ккал/день</span>
                    </div>
                    <p className="text-[9px] text-gray-400">Середнє КБЖВ: Б: 110г · Ж: 74г · В: 210г</p>
                  </div>
                </>
              )}
              {statsMode === 'months' && (
                <>
                  {/* ВИПРАВЛЕНО: На місяцях також прибрали лінії і поставили текстовий підпис КБЖВ */}
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">Поточний місяць</span>
                      <span className="text-xs font-black text-[#FF6EB4]">1780 ккал/день</span>
                    </div>
                    <p className="text-[9px] text-gray-400">Середнє КБЖВ за місяць: Б: 104г · Ж: 65г · В: 202г</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">Минулий місяць</span>
                      <span className="text-xs font-black text-gray-700">1910 ккал/день</span>
                    </div>
                    <p className="text-[9px] text-gray-400">Середнє КБЖВ за місяць: Б: 115г · Ж: 71г · В: 218г</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ ЕКРАН 4: НАЛАШТУВАННЯ ЦІЛЕЙ ═══ */}
        {currentScreen === 'goals' && (
          <div className="px-5 overflow-y-auto flex-grow bg-white flex flex-col">
            <div className="my-4 flex-shrink-0">
              <h1 className="text-xl font-bold text-[#2D2D2D]">Мої цілі</h1>
              <p className="text-xs text-gray-400">Налаштування особистих норм</p>
            </div>
            <div className="flex flex-col gap-3 pb-4">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Денна норма калорій (ккал)</label>
                <input type="number" value={goalsInput.calories} onChange={(e) => setGoalsInput({ ...goalsInput, calories: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                <label className="text-[9px] uppercase font-bold text-[#FF9ED6] block mb-0.5">Денна норма Білків (г)</label>
                <input type="number" value={goalsInput.protein} onChange={(e) => setGoalsInput({ ...goalsInput, protein: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                <label className="text-[9px] uppercase font-bold text-[#C96EFF] block mb-0.5">Денна норма Жирів (г)</label>
                <input type="number" value={goalsInput.fat} onChange={(e) => setGoalsInput({ ...goalsInput, fat: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                <label className="text-[9px] uppercase font-bold text-[#FF6EB4] block mb-0.5">Денна норма Вуглеводів (г)</label>
                <input type="number" value={goalsInput.carbs} onChange={(e) => setGoalsInput({ ...goalsInput, carbs: Number(e.target.value) })} className="w-full bg-transparent text-sm font-bold outline-none text-gray-700" />
              </div>
              <div className="bg-pink-50/10 border border-pink-100/40 rounded-xl p-3 mt-1">
                <p className="text-[9px] font-bold text-[#FF6EB4] uppercase tracking-wider mb-2">Динамічний розподіл БЖВ</p>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
                  <div className="h-full bg-[#FF9ED6]" style={{ width: `${pPct}%` }}></div>
                  <div className="h-full bg-[#C96EFF]" style={{ width: `${fPct}%` }}></div>
                  <div className="h-full bg-[#FF6EB4]" style={{ width: `${cPct}%` }}></div>
                </div>
                <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-1.5">
                  <span>Б: {pPct}%</span><span>Ж: {fPct}%</span><span>В: {cPct}%</span>
                </div>
              </div>
              <button onClick={handleSaveGoals} className="w-full bg-[#FF6EB4] text-white py-3 rounded-2xl font-bold text-xs mt-2 uppercase tracking-wider shadow-sm active:scale-[0.98] transition-transform">Зберегти норми</button>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 flex justify-around py-3 bg-white text-gray-300 text-[10px] font-bold flex-shrink-0">
          <button onClick={() => setCurrentScreen('home')} className={`flex flex-col items-center ${currentScreen === 'home' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>🏠</span><span>Сьогодні</span></button>
          <button onClick={() => setCurrentScreen('add')} className={`flex flex-col items-center ${currentScreen === 'add' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>➕</span><span>Додати</span></button>
          <button onClick={() => setCurrentScreen('stats')} className={`flex flex-col items-center ${currentScreen === 'stats' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>📊</span><span>Статистика</span></button>
          <button onClick={() => setCurrentScreen('goals')} className={`flex flex-col items-center ${currentScreen === 'goals' ? 'text-[#FF6EB4]' : 'opacity-40'}`}><span>🎯</span><span>Цілі</span></button>
        </div>
      </div>
    </div>
  );
}
