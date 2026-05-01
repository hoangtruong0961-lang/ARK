
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Settings2, RotateCcw, Edit2, ToggleLeft, ToggleRight, Check, X, Download, Upload, Trash2 } from 'lucide-react';
import { TawaPresetConfig, PromptModule } from '../../../../types';
import { DEFAULT_PRESET_CONFIG } from '../../../../constants/tawa_modules';

interface TawaPresetManagerProps {
  onConfigChange: (config: TawaPresetConfig) => void;
}

export interface SavedPreset {
  id: string;
  name: string;
  config: TawaPresetConfig;
}

const LEGACY_STORAGE_KEY = 'tawa_preset_config_v1';
const PRESETS_STORAGE_KEY = 'tawa_presets_list_v2';
const ACTIVE_PRESET_ID_KEY = 'tawa_active_preset_id_v2';

const convertSTtoTawa = (stJson: any): TawaPresetConfig => {
    const modules: PromptModule[] = [];
    let cot: PromptModule | null = null;
    
    // Sort ST prompts by injection order, then mapping
    const prompts = stJson.prompts || [];
    
    prompts.forEach((p: any, i: number) => {
        const mod: PromptModule = {
            id: p.identifier || `st_${Date.now()}_${i}`,
            label: p.name || `ST Prompt ${i + 1}`,
            isActive: p.enabled ?? true,
            content: p.content || '',
            position: p.role === 'system' ? 'system' : 'bottom',
            order: typeof p.injection_order === 'number' ? p.injection_order : i * 10,
            injectKey: undefined
        };

        if (p.injection_trigger && Array.isArray(p.injection_trigger) && p.injection_trigger.length > 0) {
            // Some ST prompts might have triggers, but we can't easily map them. We'll set it as active if enabled.
        }

        // Identifying COT / Jailbreak
        if (!cot && (p.identifier?.toLowerCase().includes('jailbreak') || p.name?.toLowerCase().includes('cot'))) {
            mod.isCore = true;
            cot = mod;
        } else {
            modules.push(mod);
        }
    });

    // Fallback for ST Instruct Mode or Context Templates if 'prompts' is empty or missing
    if (prompts.length === 0) {
        if (stJson.system_prompt) {
            modules.push({
                id: 'st_instruct_system', label: 'System Prompt (Instruct)',
                isActive: true, content: stJson.system_prompt, position: 'system', order: 0
            });
        }
        if (stJson.story_string) {
            modules.push({
                id: 'st_context_story', label: 'Story String (Context)',
                isActive: true, content: stJson.story_string, position: 'system', order: 10
            });
        }
        if (stJson.post_history_instructions) {
            modules.push({
                id: 'st_post_history', label: 'Post-History Instructions',
                isActive: true, content: stJson.post_history_instructions, position: 'bottom', order: 99
            });
        }
    }

    if (!cot) {
        cot = {
            id: 'st_dummy_cot',
            label: 'Lõi Tư Duy (ST Không có)',
            isActive: true,
            isCore: true,
            content: '',
            position: 'bottom',
            order: 9999
        };
    }

    return { cot, modules };
};

const TawaPresetManager: React.FC<TawaPresetManagerProps> = ({ onConfigChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const [presets, setPresets] = useState<SavedPreset[]>(() => {
    try {
      const savedList = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (savedList) {
        return JSON.parse(savedList);
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        let defaultConf = DEFAULT_PRESET_CONFIG;
        if (legacy) {
          try {
            defaultConf = { ...DEFAULT_PRESET_CONFIG, ...JSON.parse(legacy) };
          } catch(e){
            console.error(e);
          }
        }
        return [{ id: 'default', name: 'Mặc định (Tawa)', config: defaultConf }];
      }
    } catch(e) {
      return [{ id: 'default', name: 'Mặc định (Tawa)', config: DEFAULT_PRESET_CONFIG }];
    }
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_PRESET_ID_KEY) || 'default';
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];
  const config = activePreset.config;

  useEffect(() => {
    onConfigChange(config);
  }, [config, onConfigChange]);

  // --- Handlers ---

  const updateConfig = (updater: (prev: TawaPresetConfig) => TawaPresetConfig) => {
    setPresets(prevList => {
       const newList = prevList.map(p => {
         if (p.id === activePresetId) {
           return { ...p, config: updater(p.config) };
         }
         return p;
       });
       localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(newList));
       return newList;
    });
  };

  const handleToggleModule = (moduleId: string) => {
    updateConfig(prev => ({
      ...prev,
      modules: prev.modules.map(m => m.id === moduleId ? { ...m, isActive: !m.isActive } : m)
    }));
  };

  const handleUpdateContent = (id: string, newContent: string) => {
    updateConfig(prev => {
        if (id === prev.cot.id) {
            return { ...prev, cot: { ...prev.cot, content: newContent } };
        } else {
            return {
                ...prev,
                modules: prev.modules.map(m => m.id === id ? { ...m, content: newContent } : m)
            };
        }
    });
  };

  const handleReset = () => {
      try {
        const freshConfig = JSON.parse(JSON.stringify(DEFAULT_PRESET_CONFIG));
        if (activePresetId === 'default') {
            updateConfig(() => freshConfig);
        } else {
            if (window.confirm("Ghi đè preset hiện tại bằng cấu hình mặc định?")) {
               updateConfig(() => freshConfig);
            }
        }
        setEditingId(null);
      } catch (error) {
        console.error("Failed to reset config:", error);
      }
  };

  const handleExport = () => {
    try {
      const dataStr = JSON.stringify(config, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tawa_preset_config.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const importedJson = JSON.parse(content);
        
        let newConfig: TawaPresetConfig;
        let presetName = file.name.replace('.json', '');

        if (importedJson && importedJson.cot && importedJson.modules) {
             newConfig = importedJson;
        } else if (importedJson && (Array.isArray(importedJson.prompts) || importedJson.system_prompt || importedJson.story_string)) {
             newConfig = convertSTtoTawa(importedJson);
             if (importedJson.name) {
                 presetName = importedJson.name; // Use ST Preset name if available
             }
        } else {
             alert("Tệp Preset không hợp lệ. Vui lòng cung cấp file Tawa Preset hoặc SillyTavern Preset.");
             return;
        }

        const newPreset: SavedPreset = {
            id: 'preset_' + Date.now(),
            name: presetName,
            config: newConfig
        };

        setPresets(prev => {
            const updated = [...prev, newPreset];
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
        setActivePresetId(newPreset.id);
        localStorage.setItem(ACTIVE_PRESET_ID_KEY, newPreset.id);
        setEditingId(null);
        
      } catch (error) {
        console.error("Lỗi khi đọc file preset:", error);
        alert("Lỗi khi đọc file preset. Tệp JSON không hợp lệ.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleDeletePreset = (id: string) => {
    if (id === 'default') return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa preset này?")) return;
    
    setPresets(prev => {
      const newList = prev.filter(p => p.id !== id);
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(newList));
      return newList;
    });
    if (activePresetId === id) {
      setActivePresetId('default');
      localStorage.setItem(ACTIVE_PRESET_ID_KEY, 'default');
    }
  };

  const handleSwitchPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setActivePresetId(id);
    localStorage.setItem(ACTIVE_PRESET_ID_KEY, id);
    setEditingId(null);
  };

  // --- Render Helpers ---

  const renderEditor = (id: string, label: string, content: string) => (
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-2 pl-4 border-l-2 border-stone-400 dark:border-slate-700"
      >
          <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-stone-500 uppercase font-bold">Editing: {label}</span>
              <button onClick={() => setEditingId(null)} className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 hover:underline">
                  <Check size={12}/> Done
              </button>
          </div>
          <textarea 
            value={content}
            onChange={(e) => handleUpdateContent(id, e.target.value)}
            className="w-full h-64 bg-stone-200 dark:bg-slate-900 border border-stone-400 dark:border-slate-700 rounded p-2 text-xs font-mono text-stone-800 dark:text-slate-300 focus:border-mystic-accent outline-none resize-y custom-scrollbar leading-relaxed"
            placeholder="Nhập nội dung prompt..."
          />
      </motion.div>
  );

  return (
    <>
        {/* Trigger Button */}
        <button 
            onClick={() => setIsOpen(true)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-stone-400 dark:hover:bg-slate-700/50 transition-colors group rounded-lg border border-stone-400 dark:border-slate-700 bg-stone-300 dark:bg-slate-800/30"
        >
            <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 dark:text-slate-300 group-hover:text-mystic-accent transition-colors uppercase">
                <Settings2 size={14} />
                Advanced Formatting
            </div>
            <div className="text-[10px] text-stone-500 bg-stone-400 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">
                {config.modules.filter(m => m.isActive).length} Active
            </div>
        </button>

        {/* Modal Popup */}
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                    >
                        {/* Modal Header */}
                        <div className="p-4 border-b border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-slate-900/50 shrink-0">
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-lg font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2">
                                    <Settings2 size={20} className="text-mystic-accent"/> Advanced Formatting & Preset
                                </h2>
                                <button onClick={() => setIsOpen(false)} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            
                            {/* Preset Selector */}
                            <div className="flex items-center gap-2">
                                <select 
                                    value={activePresetId}
                                    onChange={handleSwitchPreset}
                                    className="flex-1 bg-stone-200 dark:bg-mystic-800 border border-stone-400 dark:border-mystic-accent/30 text-stone-800 dark:text-slate-200 text-sm rounded-lg p-2 focus:outline-none focus:border-mystic-accent"
                                >
                                    {presets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                {activePresetId !== 'default' && (
                                    <button 
                                        onClick={() => handleDeletePreset(activePresetId)}
                                        className="p-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
                                        title="Xóa Preset này"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Modal Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 bg-stone-200 dark:bg-mystic-900">
                            {/* 1. Core COT Section */}
                            <div className="bg-stone-300 dark:bg-slate-800/30 p-4 rounded-lg border border-stone-400 dark:border-slate-700/50">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2 text-sm font-bold text-mystic-accent">
                                        <BrainCircuit size={16} />
                                        {config.cot.label}
                                    </div>
                                    <button 
                                        onClick={() => setEditingId(editingId === config.cot.id ? null : config.cot.id)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors border ${editingId === config.cot.id ? 'bg-stone-400 dark:bg-slate-700 border-mystic-accent text-mystic-accent' : 'border-stone-400 dark:border-slate-600 text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'}`}
                                    >
                                        <Edit2 size={12} /> {editingId === config.cot.id ? 'Đóng' : 'Sửa'}
                                    </button>
                                </div>
                                <p className="text-xs text-stone-500 mb-2">
                                    Logic cốt lõi điều khiển luồng suy nghĩ của AI.
                                </p>
                                {editingId === config.cot.id && renderEditor(config.cot.id, config.cot.label, config.cot.content)}
                            </div>

                            {/* 2. Modules List */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-stone-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    Modules
                                    <div className="h-[1px] flex-1 bg-stone-400 dark:bg-slate-800"></div>
                                </h4>
                                
                                {config.modules
                                    .filter(mod => mod.id !== 'conf_word_count') // FILTER HIDDEN MODULE
                                    .map(mod => (
                                    <div key={mod.id} className={`p-3 rounded-lg border transition-all ${mod.isActive ? 'bg-stone-300 dark:bg-slate-800/60 border-stone-400 dark:border-slate-600' : 'bg-stone-200 dark:bg-slate-900/50 border-stone-400 dark:border-slate-800 opacity-70'}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 mr-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                     <span className={`text-sm font-medium ${mod.isActive ? 'text-stone-800 dark:text-slate-200' : 'text-stone-400 dark:text-slate-500'}`}>
                                                        {mod.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => setEditingId(editingId === mod.id ? null : mod.id)}
                                                        className={`text-xs flex items-center gap-1 hover:underline ${editingId === mod.id ? 'text-mystic-accent' : 'text-stone-500'}`}
                                                    >
                                                        <Edit2 size={10} /> {editingId === mod.id ? 'Đóng' : 'Sửa'}
                                                    </button>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => handleToggleModule(mod.id)}
                                                className={`${mod.isActive ? 'text-green-600 dark:text-green-400' : 'text-stone-300 dark:text-slate-600'} hover:scale-110 transition-transform`}
                                                title={mod.isActive ? "Đang BẬT" : "Đang TẮT"}
                                            >
                                                {mod.isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                            </button>
                                        </div>
                                        {editingId === mod.id && renderEditor(mod.id, mod.label, mod.content)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleReset}
                                    className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20 px-3 py-2 rounded transition-colors"
                                >
                                    <RotateCcw size={14} /> Khôi phục Default
                                </button>
                                <button 
                                    onClick={handleExport}
                                    className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-slate-300 hover:bg-stone-400 dark:hover:bg-slate-800 px-3 py-2 rounded transition-colors"
                                >
                                    <Download size={14} />
                                    Export
                                </button>
                                <label className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-slate-300 hover:bg-stone-400 dark:hover:bg-slate-800 px-3 py-2 rounded transition-colors cursor-pointer">
                                    <Upload size={14} />
                                    Import (Tawa/ST)
                                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                            
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="px-6 py-2 bg-stone-400 dark:bg-mystic-800 border border-stone-400 dark:border-mystic-accent/30 text-stone-700 dark:text-mystic-accent hover:bg-stone-500 dark:hover:bg-mystic-accent/10 rounded-lg text-sm font-bold transition-all"
                            >
                                Đóng
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </>
  );
};

export default TawaPresetManager;

