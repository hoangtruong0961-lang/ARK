
import React, { useEffect, useState } from 'react';
import { NavigationProps, GameState, AppSettings, ThinkingBudgetLevel, ThinkingLevel, NarrativePerspective } from '../../../types';
import SafetySettings from './SafetySettings';
import { dbService, DEFAULT_SETTINGS } from '../../../services/db/indexedDB';
import Button from '../../ui/Button';
import { Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, Globe, RefreshCw, Sparkles } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { DIFFICULTY_LEVELS, OUTPUT_LENGTHS } from '../../../constants/promptTemplates';

interface SettingsScreenProps extends NavigationProps {
  fromGame?: boolean;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onNavigate, fromGame }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'api'>('general');
  const { setTheme, setFontFamily, setFontSize, setVisualEffects } = useTheme();
  const [localFontSize, setLocalFontSize] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      const s = await dbService.getSettings();
      setSettings(s);
      if (s) {
        setLocalFontSize(s.fontSize.toString());
      }
    };
    load();
  }, []);

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      if (!prev) return null;
      const newSettings = { ...prev, [key]: value };
      
      // Side effects should be triggered after state update
      setTimeout(() => {
        dbService.saveSettings(newSettings);
        if (key === 'theme') setTheme(value as 'light' | 'dark');
        if (key === 'systemFont') setFontFamily(value as string);
        if (key === 'fontSize') {
          setFontSize(value as number);
          setLocalFontSize(value.toString());
        }
        if (key === 'visualEffects') setVisualEffects(value as boolean);
      }, 0);
      
      return newSettings;
    });
  };

  const handleMultipleChanges = (changes: Partial<AppSettings>) => {
    setSettings(prev => {
      if (!prev) return null;
      const newSettings = { ...prev, ...changes };
      
      // Side effects should be triggered after state update
      setTimeout(() => {
        dbService.saveSettings(newSettings);
        Object.entries(changes).forEach(([key, value]) => {
          if (key === 'theme') setTheme(value as 'light' | 'dark');
          if (key === 'systemFont') setFontFamily(value as string);
          if (key === 'fontSize') {
            setFontSize(value as number);
            setLocalFontSize(value.toString());
          }
          if (key === 'visualEffects') setVisualEffects(value as boolean);
        });
      }, 0);
      
      return newSettings;
    });
  };

  const handleGlobalUpdate = (newSettings: AppSettings) => {
    setSettings(newSettings);
    dbService.saveSettings(newSettings);
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    await dbService.saveSettings(settings);
    setIsSaving(false);
    onNavigate(fromGame ? GameState.PLAYING : GameState.MENU);
  };

  const handleResetFactory = async () => {
      setSettings(DEFAULT_SETTINGS);
      await dbService.saveSettings(DEFAULT_SETTINGS);
  };

  const handleLoadModels = async () => {
    if (!settings?.proxies || settings.proxies.length === 0) {
      return;
    }
    
    setIsSaving(true);
    let updatedSettings = { ...settings };
    const updatedProxies = [...settings.proxies];

    const processModelData = (data: any, currentModel: string) => {
      let modelList: string[] = [];
      
      const extractId = (m: any): string | null => {
        if (typeof m === 'string') return m;
        if (m && typeof m === 'object') {
          return m.id || m.name || m.model || m.slug || m.key || null;
        }
        return null;
      };

      if (Array.isArray(data)) {
        modelList = data.map(extractId).filter((m): m is string => !!m);
      } else if (data && Array.isArray(data.data)) {
        // OpenAI style
        modelList = data.data.map(extractId).filter((m): m is string => !!m);
      } else if (data && Array.isArray(data.models)) {
        // Google style
        modelList = data.models.map(m => {
          const id = extractId(m);
          return id ? id.replace('models/', '') : null;
        }).filter((m): m is string => !!m);
      } else if (data && data.data && Array.isArray(data.data.models)) {
        // Some other providers
        modelList = data.data.models.map(extractId).filter((m): m is string => !!m);
      } else if (data && Array.isArray(data.model_names)) {
        // Simple string array providers
        modelList = data.model_names.filter((m: any) => typeof m === 'string');
      }
      
      // Filter out duplicates and empty values
      modelList = Array.from(new Set(modelList.filter(m => m && typeof m === 'string')));

      if (modelList.length > 0) {
        // Sắp xếp theo yêu cầu: Chữ A-Z, Số từ lớn đến nhỏ
        modelList.sort((a, b) => {
          const split = (s: string) => s.match(/(\d+)|(\D+)/g) || [];
          const aParts = split(a);
          const bParts = split(b);
          
          for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
            const aP = aParts[i];
            const bP = bParts[i];
            const aIsNum = /^\d+$/.test(aP);
            const bIsNum = /^\d+$/.test(bP);
            
            if (aIsNum && bIsNum) {
              // Nếu cả hai là số, xếp từ lớn đến nhỏ (Descending)
              const diff = parseInt(bP) - parseInt(aP);
              if (diff !== 0) return diff;
            } else {
              // Nếu là chữ, xếp theo a-z (Ascending)
              const comp = aP.toLowerCase().localeCompare(bP.toLowerCase());
              if (comp !== 0) return comp;
            }
          }
          return aParts.length - bParts.length;
        });

        return {
          models: modelList,
          model: modelList.includes(currentModel) ? currentModel : modelList[0]
        };
      } else {
        throw new Error("Proxy không trả về danh sách model hợp lệ");
      }
    };

    const loadFromProxy = async (url: string, key: string, currentModel: string, type?: string) => {
      // Normalize URL: remove trailing slash
      const baseUrl = url.replace(/\/$/, '');
      const isOpenAI = type === 'openai' || type === 'openrouter' || baseUrl.toLowerCase().includes('/v1') || baseUrl.toLowerCase().includes('openrouter.ai') || baseUrl.toLowerCase().includes('groq.com');
      
      const tryFetch = async (fetchUrl: string, useGoogleKey: boolean = false) => {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };

          if (key) {
            if (isOpenAI && !useGoogleKey) {
              headers['Authorization'] = `Bearer ${key}`;
            } else {
              headers['x-goog-api-key'] = key;
            }
          }

          // For Google style, also try appending key to URL to bypass some CORS header restrictions
          const finalUrl = (!isOpenAI && key && !fetchUrl.includes('key=')) 
            ? `${fetchUrl}${fetchUrl.includes('?') ? '&' : '?'}key=${key}`
            : fetchUrl;

          const response = await fetch(finalUrl, { headers });
          if (response.ok) return await response.json();
          return null;
        } catch (e) {
          return null;
        }
      };

      try {
        // Try multiple common paths based on detected type
        const paths = isOpenAI ? [
          `${baseUrl}/models`,
          baseUrl.replace(/\/v1$/, '') + '/models',
          `${baseUrl}`
        ] : [
          `${baseUrl}/v1beta/models`,
          `${baseUrl}/v1/models`,
          `${baseUrl}/models`,
          baseUrl
        ];

        for (const path of paths) {
          // Try with standard headers
          let data = await tryFetch(path, false);
          
          // If failed and not OpenAI, try with Google key header
          if (!data && !isOpenAI) {
            data = await tryFetch(path, true);
          }

          if (data) {
            try {
              return processModelData(data, currentModel);
            } catch (e) {
              continue;
            }
          }
        }
        
        throw new Error("Không thể tải danh sách model (CORS hoặc URL sai). Bạn có thể nhập tên model thủ công.");
      } catch (err: unknown) {
        console.error("Proxy Error:", err);
        throw err;
      }
    };

    try {
      const loadPromises = updatedProxies.map(async (proxy, index) => {
        if (!proxy.url) return;
        try {
          const result = await loadFromProxy(proxy.url, proxy.key || '', proxy.model || '', proxy.type);
          updatedProxies[index] = {
            ...proxy,
            models: result.models,
            model: result.model,
            lastError: undefined
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Proxy ${index + 1}: ${message}`);
          updatedProxies[index] = {
            ...proxy,
            lastError: message
          };
        }
      });

      await Promise.all(loadPromises);
      
      updatedSettings = {
        ...updatedSettings,
        proxies: updatedProxies
      };
      
      setSettings(updatedSettings);
      await dbService.saveSettings(updatedSettings);
    } catch (err: unknown) {
      console.error("General Proxy Error:", err);
    } finally {
      setIsSaving(false);
    }
  };
  const addProxy = () => {
    if (!settings) return;
    const newProxy = {
      id: `proxy-${Date.now()}`,
      url: '',
      key: '',
      model: '',
      models: [],
      isActive: false,
      type: 'google' as const
    };
    const updatedProxies = [...settings.proxies, newProxy];
    handleMultipleChanges({
      proxies: updatedProxies,
      activeProxyId: settings.activeProxyId || newProxy.id
    });
  };

  const removeProxy = (id: string) => {
    if (!settings) return;
    const updatedProxies = settings.proxies.filter(p => p.id !== id);
    let newActiveId = settings.activeProxyId;
    if (newActiveId === id) {
      newActiveId = updatedProxies.length > 0 ? updatedProxies[0].id : undefined;
    }
    handleMultipleChanges({
      proxies: updatedProxies,
      activeProxyId: newActiveId
    });
  };

  const updateProxy = (id: string, updates: Partial<any>) => {
    if (!settings) return;
    const updatedProxies = settings.proxies.map(p => {
      if (p.id === id) {
        const newProxy = { ...p, ...updates };
        // Auto-detect type if URL changed and type not explicitly provided
        if (updates.url !== undefined && updates.type === undefined) {
          const url = updates.url.toLowerCase();
          if (url.includes('openrouter.ai')) newProxy.type = 'openrouter';
          else if (url.includes('groq.com') || url.includes('/v1')) newProxy.type = 'openai';
          else newProxy.type = 'google';
        }
        return newProxy;
      }
      return p;
    });
    handleChange('proxies', updatedProxies);
  };

  const moveProxy = (index: number, direction: 'up' | 'down') => {
    if (!settings) return;
    const newProxies = [...settings.proxies];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newProxies.length) return;
    
    [newProxies[index], newProxies[targetIndex]] = [newProxies[targetIndex], newProxies[index]];
    handleChange('proxies', newProxies);
  };

  const handleResetApiTab = () => {
    if (settings) {
      setSettings({
        ...settings,
        geminiApiKey: [],
        proxies: [],
        activeProxyId: undefined,
        useGeminiApi: true,
        proxyEnabled: false
      });
    }
  };

  const handleImportTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      // Try JSON first
      try {
        const parsed = JSON.parse(content);
        if (settings) {
            // Guess type from URL
            const url = parsed.proxyUrl || parsed.url || '';
            let type: 'google' | 'openai' | 'openrouter' = 'google';
            if (url.includes('openrouter.ai')) type = 'openrouter';
            else if (url.includes('groq.com') || url.includes('/v1')) type = 'openai';

            const newProxy = {
              id: `proxy-${Date.now()}`,
              url: url,
              key: parsed.proxyKey || parsed.key || '',
              model: parsed.proxyModel || parsed.model || '',
              models: Array.isArray(parsed.proxyModels || parsed.models) ? (parsed.proxyModels || parsed.models) : [],
              isActive: true,
              type: type
            };

            setSettings({
                ...settings,
                proxies: [...settings.proxies, newProxy],
                activeProxyId: newProxy.id,
                geminiApiKey: Array.isArray(parsed.geminiApiKey) 
                    ? [...(settings.geminiApiKey || []), ...parsed.geminiApiKey] 
                    : (parsed.geminiApiKey ? [...(settings.geminiApiKey || []), parsed.geminiApiKey] : settings.geminiApiKey)
            });
            return;
        }
      } catch {
        // Not JSON, continue to TXT parsing
      }

      // TXT Parsing logic
      const lines = content.split('\n').map(l => l.trim()).filter(l => l !== '');
      const newGeminiKeys: string[] = [...(settings?.geminiApiKey || [])];
      const newProxies: any[] = [];
      
      let currentProxy: any = null;
      const geminiKeyRegex = /^AIzaSy[A-Za-z0-9_-]{33}$/;

      lines.forEach(line => {
        // 1. Check for Gemini API Keys
        if (geminiKeyRegex.test(line)) {
          if (!newGeminiKeys.includes(line)) {
            newGeminiKeys.push(line);
          }
          return;
        }

        // 2. Check for common pipe-separated format: URL|KEY|NAME or URL|KEY
        if (line.includes('|') && line.startsWith('http')) {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 2) {
            const url = parts[0];
            let type: 'google' | 'openai' | 'openrouter' = 'google';
            if (url.includes('openrouter.ai')) type = 'openrouter';
            else if (url.includes('groq.com') || url.includes('/v1')) type = 'openai';

            newProxies.push({
              id: `proxy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              url: url,
              key: parts[1],
              model: '',
              models: [],
              isActive: true,
              type: type
            });
            return;
          }
        }

        // 3. Check for multi-line format (URL followed by Key/Name)
        if (line.startsWith('http')) {
          // If we were already building a proxy, push it
          if (currentProxy && currentProxy.url && currentProxy.key) {
            newProxies.push(currentProxy);
          }
          
          let type: 'google' | 'openai' | 'openrouter' | 'custom' = 'google';
          if (line.includes('openrouter.ai')) type = 'openrouter';
          else if (line.includes('groq.com') || line.includes('/v1')) type = 'openai';

          currentProxy = {
            id: `proxy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: line,
            key: '',
            model: '',
            models: [],
            isActive: true,
            type: type
          };
        } else if (currentProxy) {
          if (line.toLowerCase().includes('proxy_key:') || line.toLowerCase().includes('key:')) {
            currentProxy.key = line.split(':')[1]?.trim() || currentProxy.key;
          } else if (line.length > 20 && !currentProxy.key) {
            // Heuristic: long string after URL is likely the key
            currentProxy.key = line;
          }
        }
      });

      // Push the last proxy if it exists
      if (currentProxy && currentProxy.url && currentProxy.key) {
        newProxies.push(currentProxy);
      }

      if (settings) {
        const updatedSettings = { 
          ...settings, 
          geminiApiKey: newGeminiKeys,
          proxies: [...settings.proxies, ...newProxies]
        };
        
        if (newProxies.length > 0) {
          updatedSettings.activeProxyId = newProxies[newProxies.length - 1].id;
        }

        setSettings(updatedSettings);
        dbService.saveSettings(updatedSettings);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!settings) return <div className="flex items-center justify-center h-full text-slate-400">Đang tải cấu hình...</div>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-[0.5vh]">
      <div className="flex flex-col h-[99vh] w-[99vw] bg-stone-50 dark:bg-mystic-950 text-slate-900 dark:text-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-stone-50/95 dark:bg-mystic-900/95 backdrop-blur z-20 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
                {/* Tab Switcher */}
                <div className="flex bg-stone-300 dark:bg-mystic-950/50 rounded-lg p-1 border border-stone-400 dark:border-slate-800">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-1.5 text-xs font-medium transition-all rounded-md ${activeTab === 'general' ? 'text-white bg-mystic-accent shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                        Chung
                    </button>
                    <button 
                        onClick={() => setActiveTab('api')}
                        className={`px-4 py-1.5 text-xs font-medium transition-all rounded-md ${activeTab === 'api' ? 'text-white bg-mystic-accent shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                        API & Proxy
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <Button 
                    variant="ghost" 
                    onClick={handleResetFactory}
                    className="text-red-600 dark:text-red-500 hover:text-white border-red-500/30 hover:bg-red-600 font-bold px-3 py-1.5 text-[10px] transition-all"
                >
                    Reset Gốc
                </Button>

                <Button 
                    variant="primary" 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-1.5 text-xs flex items-center gap-2 shadow-lg shadow-mystic-accent/20"
                >
                    {isSaving ? 'Đang lưu...' : (fromGame ? 'Lưu & Quay Lại' : 'Lưu & Về Sảnh')}
                </Button>
            </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 w-full space-y-10 pb-24">
            
            {activeTab === 'general' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                    <div className="space-y-10">
                        {/* AI Model Selection */}
                        <section className="space-y-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                                Mô Hình AI Gemini (Dùng cho API Key cá nhân)
                            </h3>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chọn Model</label>
                                <select 
                                    value={settings.aiModel}
                                    onChange={(e) => handleChange('aiModel', e.target.value)}
                                    className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-3 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                >
                                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                                    <option value="gemini-3-flash-preview">Gemini 3 Flash (Mặc định)</option>
                                    <option value="gemini-2.5-pro-preview">Gemini 2.5 Pro</option>
                                    <option value="gemini-2.5-flash-preview">Gemini 2.5 Flash</option>
                                </select>
                                <p className="text-[10px] text-slate-500 italic">
                                    {settings.aiModel.includes('pro') ? 'Model Pro: Tư duy sâu, phù hợp cốt truyện phức tạp.' : 'Model Flash: Tốc độ nhanh, phản hồi tức thì.'}
                                </p>
                            </div>

                            {/* Vector Memory Toggle */}
                            <div className="pt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Bộ nhớ Vector (RAG)</label>
                                        <p className="text-[10px] text-slate-500 italic">Lưu trữ và tìm kiếm ký ức cũ để AI không quên cốt truyện lâu dài.</p>
                                    </div>
                                    <button
                                        onClick={() => handleChange('enableVectorMemory', !settings.enableVectorMemory)}
                                        className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${settings.enableVectorMemory ? 'bg-mystic-accent justify-end' : 'bg-stone-400 dark:bg-slate-700 justify-start'}`}
                                    >
                                        <div className="w-3 h-3 bg-white rounded-full shadow-md" />
                                    </button>
                                </div>
                                {!settings.enableVectorMemory && (
                                    <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-600 dark:text-amber-400">
                                        Lưu ý: Tắt tính năng này sẽ giúp tiết kiệm API quota nhưng AI có thể quên các sự kiện xảy ra quá xa trong quá khứ.
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Full Screen Mode */}
                        <section className="space-y-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                                Full màn hình
                            </h3>
                            <div className="flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-700 transition-colors">
                                <button
                                    onClick={() => {
                                        handleChange('fullScreenMode', !settings.fullScreenMode);
                                        if (!settings.fullScreenMode) {
                                            document.documentElement.requestFullscreen().catch(() => {});
                                        } else {
                                            if (document.fullscreenElement) {
                                                document.exitFullscreen().catch(() => {});
                                            }
                                        }
                                    }}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${settings.fullScreenMode ? 'bg-mystic-accent justify-end' : 'bg-stone-400 dark:bg-slate-700 justify-start'}`}
                                >
                                    <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                                </button>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{settings.fullScreenMode ? 'Đang bật' : 'Đang tắt'}</span>
                            </div>
                        </section>
                    </div>

                        <div className="space-y-10">
                            {/* System & Display Settings */}
                            <section className="space-y-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                                    Hệ Thống & Hiển Thị
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    {/* System Font */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Phông chữ hệ thống</label>
                                        <select 
                                            value={settings.systemFont}
                                            onChange={(e) => handleChange('systemFont', e.target.value)}
                                            className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                        >
                                            <option value="Inter">Inter</option>
                                            <option value="Roboto">Roboto</option>
                                            <option value="Open Sans">Open Sans</option>
                                            <option value="Montserrat">Montserrat</option>
                                            <option value="Oswald">Oswald</option>
                                            <option value="Playfair Display">Playfair Display</option>
                                            <option value="Lora">Lora</option>
                                            <option value="Noto Sans Vietnamese">Noto Sans Vietnamese</option>
                                            <option value="Be Vietnam Pro">Be Vietnam Pro</option>
                                            <option value="JetBrains Mono">JetBrains Mono</option>
                                        </select>
                                    </div>

                                    {/* Font Size */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cỡ chữ hệ thống (px)</label>
                                        <input 
                                            type="number"
                                            value={localFontSize}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setLocalFontSize(val);
                                                const num = parseInt(val);
                                                if (!isNaN(num) && num >= 10 && num <= 40) {
                                                    handleChange('fontSize', num);
                                                }
                                            }}
                                            onBlur={() => {
                                                if (localFontSize === '' || isNaN(parseInt(localFontSize))) {
                                                    setLocalFontSize(settings.fontSize.toString());
                                                } else {
                                                    const num = parseInt(localFontSize);
                                                    if (num < 10) {
                                                        handleChange('fontSize', 10);
                                                        setLocalFontSize('10');
                                                    } else if (num > 40) {
                                                        handleChange('fontSize', 40);
                                                        setLocalFontSize('40');
                                                    }
                                                }
                                            }}
                                            className="w-full bg-slate-50 dark:bg-mystic-900 border border-slate-300 dark:border-slate-700 rounded p-2 text-sm text-slate-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                            min="10"
                                            max="40"
                                            placeholder="16"
                                        />
                                    </div>

                                    {/* Reality Difficulty */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Độ Khó Thực Tại</label>
                                        <select 
                                            value={settings.realityDifficulty}
                                            onChange={(e) => handleChange('realityDifficulty', e.target.value)}
                                            className="w-full bg-stone-100 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                        >
                                            <option value="Easy">Dễ (Hỗ trợ nhiều)</option>
                                            <option value="Normal">Bình thường</option>
                                            <option value="Hard">Khó (Khắc nghiệt)</option>
                                            <option value="Nightmare">Ác mộng</option>
                                        </select>
                                    </div>

                                    {/* Theme (Light Mode Toggle) */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chế độ Nền sáng</label>
                                        <div className="flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-700 transition-colors">
                                            <button
                                                onClick={() => handleChange('theme', settings.theme === 'light' ? 'dark' : 'light')}
                                                className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${settings.theme === 'light' ? 'bg-mystic-accent justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                                            >
                                                <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                                            </button>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{settings.theme === 'light' ? 'Đang bật' : 'Đang tắt'}</span>
                                        </div>
                                    </div>

                                    {/* Content Beautify */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Làm đẹp cho nội dung</label>
                                        <div className="flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-700 transition-colors">
                                            <button
                                                onClick={() => handleChange('contentBeautify', !settings.contentBeautify)}
                                                className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${settings.contentBeautify ? 'bg-mystic-accent justify-end' : 'bg-stone-400 dark:bg-slate-700 justify-start'}`}
                                            >
                                                <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                                            </button>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{settings.contentBeautify ? 'Đang bật' : 'Đang tắt'}</span>
                                        </div>
                                    </div>

                                    {/* Visual Effects */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hiệu ứng Hình ảnh</label>
                                        <div className="flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-700 transition-colors">
                                            <button
                                                onClick={() => handleChange('visualEffects', !settings.visualEffects)}
                                                className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${settings.visualEffects ? 'bg-mystic-accent justify-end' : 'bg-stone-400 dark:bg-slate-700 justify-start'}`}
                                            >
                                                <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                                            </button>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{settings.visualEffects ? 'Đang bật' : 'Đang tắt'}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Game Configuration Section */}
                            <section className="space-y-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                                    Cấu Hình Trò Chơi
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    {/* Narrative Perspective */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Góc nhìn kể chuyện (POV)
                                        </label>
                                        <select 
                                            value={settings.perspective}
                                            onChange={(e) => handleChange('perspective', e.target.value as NarrativePerspective)}
                                            className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                        >
                                            <option value="third">Ngôi thứ 3 (Anh ấy/Cô ấy/Tên)</option>
                                            <option value="first">Ngôi thứ 1 (Tôi)</option>
                                            <option value="second">Ngôi thứ 2 (Bạn/Ngươi)</option>
                                        </select>
                                    </div>

                                    {/* Difficulty */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Độ khó cốt truyện
                                        </label>
                                        <select 
                                            value={settings.difficulty.id}
                                            onChange={(e) => {
                                                const diff = DIFFICULTY_LEVELS.find(d => d.id === e.target.value);
                                                if (diff) handleChange('difficulty', diff);
                                            }}
                                            className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                        >
                                            {DIFFICULTY_LEVELS.map(d => (
                                                <option key={d.id} value={d.id}>{d.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Output Length */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Độ dài phản hồi
                                        </label>
                                        <select 
                                            value={settings.outputLength.id}
                                            onChange={(e) => {
                                                const len = OUTPUT_LENGTHS.find(o => o.id === e.target.value);
                                                if (len) handleChange('outputLength', len);
                                            }}
                                            className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                        >
                                            {OUTPUT_LENGTHS.map(o => (
                                                <option key={o.id} value={o.id}>{o.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Custom Word Count */}
                                    {settings.outputLength.id === 'custom' && (
                                        <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-2">
                                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Tối thiểu (Min words)</label>
                                                <input 
                                                    type="number"
                                                    value={settings.customMinWords}
                                                    onChange={(e) => handleChange('customMinWords', parseInt(e.target.value))}
                                                    className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Tối đa (Max words)</label>
                                                <input 
                                                    type="number"
                                                    value={settings.customMaxWords}
                                                    onChange={(e) => handleChange('customMaxWords', parseInt(e.target.value))}
                                                    className="w-full bg-stone-100 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Safety */}
                            <section className="space-y-4">
                                <SafetySettings 
                                    settings={settings}
                                    onUpdate={handleGlobalUpdate}
                                />
                            </section>

                            {/* Advanced Generation Params */}
                            <section className="space-y-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                                    Tham số Sinh (Generation)
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    {/* Temperature */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm items-center">
                                            <label className="font-medium text-slate-700 dark:text-slate-300">Temperature</label>
                                            <input 
                                                type="number" 
                                                min="0" max="2" step="0.01" 
                                                value={settings.temperature}
                                                onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                                                className="bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded px-2 py-1 text-xs w-16 text-center text-mystic-accent outline-none focus:border-mystic-accent transition-colors"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="0" max="2" step="0.01" 
                                            value={settings.temperature}
                                            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                                            className="w-full accent-mystic-accent bg-slate-300 dark:bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* Thinking Budget */}
                                    {settings.aiModel.includes('pro') && !settings.aiModel.includes('gemini-3') && (
                                        <div className="space-y-2 animate-in fade-in duration-300">
                                            <div className="flex justify-between text-sm">
                                                <label className="font-medium text-slate-700 dark:text-slate-300">
                                                    Thinking Budget
                                                </label>
                                                <span className="text-purple-600 dark:text-purple-400 font-mono uppercase text-xs border border-purple-200 dark:border-purple-900/50 bg-purple-100 dark:bg-purple-900/20 px-2 py-0.5 rounded">{settings.thinkingBudgetLevel}</span>
                                            </div>
                                            <select 
                                                value={settings.thinkingBudgetLevel}
                                                onChange={(e) => {
                                                    handleMultipleChanges({
                                                        thinkingBudgetLevel: e.target.value as ThinkingBudgetLevel,
                                                        thinkingMode: 'budget'
                                                    });
                                                }}
                                                className="w-full bg-stone-100 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                            >
                                                <option value="auto">Auto (0 tokens)</option>
                                                <option value="low">Low (4,096 tokens)</option>
                                                <option value="medium">Medium (16,384 tokens)</option>
                                                <option value="high">High (32,768 tokens)</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* Thinking Level (Gemini 3 Only) */}
                                    {settings.aiModel.includes('gemini-3') && (
                                        <div className="space-y-2 animate-in fade-in duration-300">
                                            <div className="flex justify-between text-sm">
                                                <label className="font-medium text-slate-700 dark:text-slate-300">
                                                    Thinking Level
                                                </label>
                                                <span className="text-emerald-600 dark:text-emerald-400 font-mono uppercase text-xs border border-emerald-200 dark:border-emerald-900/50 bg-emerald-100 dark:bg-emerald-900/20 px-2 py-0.5 rounded">{settings.thinkingLevel}</span>
                                            </div>
                                            <select 
                                                value={settings.thinkingLevel}
                                                onChange={(e) => {
                                                    handleMultipleChanges({
                                                        thinkingLevel: e.target.value as ThinkingLevel,
                                                        thinkingMode: 'level'
                                                    });
                                                }}
                                                className="w-full bg-stone-100 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                            >
                                                <option value="OFF">OFF (Tắt tư duy)</option>
                                                <option value="LOW">LOW (Tư duy cơ bản)</option>
                                                <option value="MEDIUM">MEDIUM (Tư duy trung bình)</option>
                                                <option value="HIGH">HIGH (Tư duy tối đa)</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* Top K */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm items-center">
                                            <label className="font-medium text-slate-700 dark:text-slate-300">Top K</label>
                                            <input 
                                                type="number" 
                                                min="1" max="500" step="1" 
                                                value={settings.topK}
                                                onChange={(e) => handleChange('topK', parseInt(e.target.value))}
                                                className="bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded px-2 py-1 text-xs w-16 text-center text-mystic-accent outline-none focus:border-mystic-accent transition-colors"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="1" max="500" step="1" 
                                            value={settings.topK}
                                            onChange={(e) => handleChange('topK', parseInt(e.target.value))}
                                            className="w-full accent-mystic-accent bg-slate-300 dark:bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* Top P */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm items-center">
                                            <label className="font-medium text-slate-700 dark:text-slate-300">Top P</label>
                                            <input 
                                                type="number" 
                                                min="0" max="1" step="0.01" 
                                                value={settings.topP}
                                                onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
                                                className="bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded px-2 py-1 text-xs w-16 text-center text-mystic-accent outline-none focus:border-mystic-accent transition-colors"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="0" max="1" step="0.01" 
                                            value={settings.topP}
                                            onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
                                            className="w-full accent-mystic-accent bg-slate-300 dark:bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* Context Size */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Context Size</label>
                                        <input 
                                            type="number" 
                                            min="1000"
                                            max="2000000"
                                            value={settings.contextSize}
                                            onChange={(e) => handleChange('contextSize', parseInt(e.target.value))}
                                            className="w-full bg-stone-100 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono transition-colors"
                                        />
                                    </div>

                                    {/* Max Output */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Max Output</label>
                                        <input 
                                            type="number" 
                                            value={settings.maxOutputTokens}
                                            onChange={(e) => handleChange('maxOutputTokens', parseInt(e.target.value))}
                                            className="w-full bg-stone-100 dark:bg-slate-800 border border-stone-400 dark:border-slate-600 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono transition-colors"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    {/* Column 1: Gemini API Key */}
                    <div className="space-y-8">
                        <section className="space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">
                                        Gemini API Key (Cá nhân)
                                    </h3>
                                    <button 
                                        onClick={() => handleChange('useGeminiApi', !settings.useGeminiApi)}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${settings.useGeminiApi ? 'bg-mystic-accent' : 'bg-slate-400'}`}
                                        title={settings.useGeminiApi ? "Đang bật" : "Đang tắt"}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.useGeminiApi ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleResetApiTab}
                                        className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
                                    >
                                        Reset tab API
                                    </button>
                                    <label className={`text-xs text-mystic-accent hover:text-mystic-accent/80 font-medium cursor-pointer px-2 py-1 rounded hover:bg-mystic-accent/10 transition-colors ${!settings.useGeminiApi ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        Nhập txt
                                        <input 
                                            type="file" 
                                            accept=".txt,.json" 
                                            className="hidden" 
                                            onChange={handleImportTxt}
                                            disabled={!settings.useGeminiApi}
                                        />
                                    </label>
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await window.aistudio.openSelectKey();
                                            } catch (e) {
                                                console.error("Lỗi khi mở hộp thoại chọn API Key:", e);
                                            }
                                        }}
                                        className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded transition-colors font-medium flex items-center gap-1 shadow-sm"
                                        title="Sử dụng API Key có trả phí từ AI Studio (Yêu cầu cho một số model)"
                                    >
                                        <Sparkles size={12} />
                                        Chọn API Key (Paid)
                                    </button>
                                </div>
                            </div>
                            <div className={`space-y-4 bg-stone-100 dark:bg-slate-800/50 p-6 rounded-lg border border-stone-300 dark:border-slate-700 transition-all ${!settings.useGeminiApi ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Thêm API Key mới</label>
                                        <div className="flex flex-col gap-2">
                                            <textarea 
                                                placeholder="Dán API Key vào đây (mỗi dòng 1 key)..."
                                                className="w-full bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-3 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono min-h-[80px] transition-colors"
                                                disabled={!settings.useGeminiApi}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && e.ctrlKey) {
                                                        const target = e.target as HTMLTextAreaElement;
                                                        const newKeys = target.value.split('\n').map(k => k.trim()).filter(k => k !== '');
                                                        if (newKeys.length > 0) {
                                                            const currentKeys = settings.geminiApiKey || [];
                                                            const updatedKeys = [...currentKeys];
                                                            newKeys.forEach(nk => {
                                                                if (!updatedKeys.includes(nk)) updatedKeys.push(nk);
                                                            });
                                                            handleChange('geminiApiKey', updatedKeys);
                                                            target.value = '';
                                                        }
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    const target = e.target as HTMLTextAreaElement;
                                                    const newKeys = target.value.split('\n').map(k => k.trim()).filter(k => k !== '');
                                                    if (newKeys.length > 0) {
                                                        const currentKeys = settings.geminiApiKey || [];
                                                        const updatedKeys = [...currentKeys];
                                                        newKeys.forEach(nk => {
                                                            if (!updatedKeys.includes(nk)) updatedKeys.push(nk);
                                                        });
                                                        handleChange('geminiApiKey', updatedKeys);
                                                        target.value = '';
                                                    }
                                                }}
                                            />
                                            <p className="text-[10px] text-slate-500 italic">Mẹo: Nhấn Ctrl + Enter hoặc click ra ngoài để thêm nhanh.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Danh sách Key ({settings.geminiApiKey?.length || 0})</label>
                                        <div className="space-y-2 pr-2">
                                            {settings.geminiApiKey && settings.geminiApiKey.length > 0 ? (
                                                settings.geminiApiKey.map((key, index) => (
                                                    <div key={index} className="flex items-center justify-between bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-2 group transition-colors">
                                                        <div className="flex items-center overflow-hidden">
                                                            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-mystic-accent/10 text-mystic-accent text-[10px] font-bold rounded-full border border-mystic-accent/20">
                                                                {index + 1}
                                                            </span>
                                                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                                                                {key.substring(0, 8)}...{key.substring(key.length - 4)}
                                                            </span>
                                                        </div>
                                                        <button 
                                                            onClick={() => {
                                                                const updated = settings.geminiApiKey?.filter((_, i) => i !== index);
                                                                handleChange('geminiApiKey', updated || []);
                                                            }}
                                                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                            disabled={!settings.useGeminiApi}
                                                        >
                                                            Xóa
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-xs text-slate-500 italic p-4 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded">
                                                    Chưa có API Key nào được thêm.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-2 border-t border-slate-200 dark:border-slate-700/50">
                                        Hệ thống sẽ tự động luân phiên (rotate) các Key này theo thứ tự từ 1 đến hết để tối ưu hóa giới hạn gọi API.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Security Notice Removed */}
                    </div>

                    {/* Column 2: Reverse Proxy */}
                    <div className="space-y-8">
                        <section className="space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">
                                        Reverse Proxy
                                    </h3>
                                    <button 
                                        onClick={() => handleChange('proxyEnabled', !settings.proxyEnabled)}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${settings.proxyEnabled ? 'bg-mystic-accent' : 'bg-slate-400'}`}
                                        title={settings.proxyEnabled ? "Đang bật" : "Đang tắt"}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.proxyEnabled ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        variant="ghost"
                                        className="text-[10px] h-7 px-3 border-mystic-accent/30 text-mystic-accent hover:bg-mystic-accent/10"
                                        onClick={addProxy}
                                        disabled={!settings.proxyEnabled}
                                    >
                                        <Plus className="w-3 h-3 mr-1" /> Thêm Proxy
                                    </Button>
                                    <Button 
                                        variant="ghost"
                                        className="text-[10px] h-7 px-3 border-mystic-accent/30 text-mystic-accent hover:bg-mystic-accent/10"
                                        onClick={handleLoadModels}
                                        disabled={isSaving || !settings.proxyEnabled || !settings.proxies?.length}
                                    >
                                        {isSaving ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Globe className="w-3 h-3 mr-1" />}
                                        Load All Models
                                    </Button>
                                </div>
                            </div>
                            
                            <div className={`space-y-6 transition-all ${!settings.proxyEnabled ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                                {settings.proxies && settings.proxies.length > 0 ? (
                                    settings.proxies.map((proxy, index) => (
                                        <div key={proxy.id} className={`space-y-6 bg-stone-100 dark:bg-slate-800/50 p-6 rounded-lg border transition-all ${settings.activeProxyId === proxy.id ? 'border-mystic-accent shadow-md shadow-mystic-accent/5' : 'border-stone-300 dark:border-slate-700'}`}>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <button 
                                                        onClick={() => handleChange('activeProxyId', proxy.id)}
                                                        className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold border transition-all ${settings.activeProxyId === proxy.id ? 'bg-mystic-accent text-white border-mystic-accent' : 'bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500/20'}`}
                                                    >
                                                        {settings.activeProxyId === proxy.id ? <CheckCircle2 className="w-3 h-3" /> : null}
                                                        {settings.activeProxyId === proxy.id ? 'ACTIVE' : 'SELECT'}
                                                    </button>
                                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-widest">Proxy {index + 1}</h4>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => moveProxy(index, 'up')}
                                                        disabled={index === 0}
                                                        className="p-1 text-slate-400 hover:text-mystic-accent disabled:opacity-30"
                                                    >
                                                        <ChevronUp className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => moveProxy(index, 'down')}
                                                        disabled={index === settings.proxies!.length - 1}
                                                        className="p-1 text-slate-400 hover:text-mystic-accent disabled:opacity-30"
                                                    >
                                                        <ChevronDown className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => removeProxy(proxy.id)}
                                                        className="p-1 text-slate-400 hover:text-red-500 ml-2"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">URL Proxy</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="https://api.example.com/v1"
                                                        value={proxy.url}
                                                        onChange={(e) => updateProxy(proxy.id, { url: e.target.value })}
                                                        className="w-full bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono transition-colors"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Loại Proxy</label>
                                                    <select 
                                                        value={proxy.type}
                                                        onChange={(e) => updateProxy(proxy.id, { type: e.target.value as any })}
                                                        className="w-full bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none transition-colors"
                                                    >
                                                        <option value="google">Google GenAI</option>
                                                        <option value="openai">OpenAI Compatible</option>
                                                        <option value="openrouter">OpenRouter</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">API Key / Password</label>
                                                    <input 
                                                        type="password" 
                                                        placeholder="sk-..."
                                                        value={proxy.key}
                                                        onChange={(e) => updateProxy(proxy.id, { key: e.target.value })}
                                                        className="w-full bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono transition-colors"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Chọn Model ({proxy.models?.length || 0})</label>
                                                <div className="flex gap-2">
                                                    <select 
                                                        value={proxy.model}
                                                        onChange={(e) => updateProxy(proxy.id, { model: e.target.value })}
                                                        className={`flex-1 bg-stone-200 dark:bg-slate-900 border ${proxy.lastError ? 'border-red-500' : 'border-stone-400 dark:border-slate-700'} rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono transition-colors`}
                                                    >
                                                        <option value="">-- Chọn Model --</option>
                                                        {proxy.models?.map(m => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                    <input 
                                                        type="text"
                                                        placeholder="Hoặc nhập model..."
                                                        value={proxy.model}
                                                        onChange={(e) => updateProxy(proxy.id, { model: e.target.value })}
                                                        className="w-1/3 bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-sm text-stone-900 dark:text-slate-200 focus:border-mystic-accent outline-none font-mono transition-colors"
                                                    />
                                                </div>
                                                {proxy.lastError && (
                                                    <p className="text-[10px] text-red-500 mt-1 italic">{proxy.lastError}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10 bg-stone-100 dark:bg-slate-800/30 rounded-lg border border-dashed border-stone-300 dark:border-slate-700">
                                        <Globe className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm text-slate-500 italic">Chưa có Proxy nào được cấu hình.</p>
                                        <Button 
                                            variant="ghost"
                                            className="mt-4 text-xs border-mystic-accent/30 text-mystic-accent"
                                            onClick={addProxy}
                                        >
                                            <Plus className="w-3 h-3 mr-1" /> Thêm Proxy đầu tiên
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 italic leading-relaxed">
                                Hệ thống hỗ trợ nhiều Proxy. Bạn có thể chọn một Proxy làm "ACTIVE" để sử dụng. Nút "Load All Models" sẽ tự động cập nhật danh sách model cho tất cả các Proxy đang có.
                            </p>
                        </section>
                    </div>
                </div>
            )}

            <div className="h-10"></div>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
