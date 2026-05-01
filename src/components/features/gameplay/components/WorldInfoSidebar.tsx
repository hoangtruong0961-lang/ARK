import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Plus, Edit2, Trash2, ChevronDown, ChevronUp, Hash, EyeOff } from 'lucide-react';
import { Lorebook, LorebookEntry } from '../../../../services/ai/lorebook/types';
import LorebookEntryForm from './LorebookEntryForm';

interface WorldInfoSidebarProps {
  lorebook: Lorebook | undefined;
  onUpdateLorebook: (lorebook: Lorebook) => void;
}

const WorldInfoSidebar: React.FC<WorldInfoSidebarProps> = ({ lorebook, onUpdateLorebook }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LorebookEntry | null | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  
  const entries = lorebook?.entries ? Object.values(lorebook.entries) : [];

  const handleSaveEntry = (entry: LorebookEntry) => {
    const newEntries = { ...(lorebook?.entries || {}) };
    newEntries[entry.uid] = entry;
    
    onUpdateLorebook({
      ...lorebook,
      entries: newEntries
    });
    setEditingEntry(undefined);
    setIsAdding(false);
  };

  const handleDelete = (uid: string | number) => {
    if(window.confirm("Bạn có chắc chắn muốn xóa mục entry này?")) {
        const newEntries = { ...(lorebook?.entries || {}) };
        delete newEntries[uid];
        onUpdateLorebook({
          ...lorebook,
          entries: newEntries
        });
    }
  };

  return (
    <div className="w-full border border-stone-200 dark:border-slate-700/50 shadow-sm rounded-xl bg-white dark:bg-slate-800/40 overflow-hidden mb-3">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex justify-between items-center text-left hover:bg-stone-50 dark:hover:bg-slate-800/60 transition-colors group"
      >
          <div className="flex items-center gap-3 text-sm font-semibold text-stone-800 dark:text-slate-200 group-hover:text-amber-600 transition-colors">
             <div className="p-1.5 bg-stone-100 dark:bg-slate-700/50 rounded-lg group-hover:bg-amber-100 dark:group-hover:bg-amber-500/20 transition-colors">
                <BookOpen size={16} className="text-stone-600 dark:text-slate-400 group-hover:text-amber-600" />
             </div>
             World Info
          </div>
          <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-stone-500 bg-stone-100 dark:bg-slate-700/50 px-2.5 py-1 rounded-full">
                  {entries.length} mục
              </span>
              <div className="p-1 rounded hover:bg-stone-200 transition-colors">
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
          </div>
      </button>

      <AnimatePresence>
        {isOpen && (
            <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
            >
                <div className="p-3 pt-1 space-y-3">
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="w-full py-2 flex items-center justify-center gap-2 bg-stone-50 dark:bg-slate-800/30 hover:bg-stone-100 dark:hover:bg-slate-700/50 border border-dashed border-stone-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-stone-600 dark:text-slate-300 transition-colors hover:text-amber-600 dark:hover:text-amber-400 group"
                    >
                        <Plus size={14} className="group-hover:scale-110 transition-transform" /> Thêm Entry Mới
                    </button>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                        {entries.map(entry => (
                            <div key={entry.uid} className="flex flex-col p-3 bg-white dark:bg-slate-900/40 border border-stone-200 dark:border-slate-700/50 rounded-lg group hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                        <Hash size={14} className={`shrink-0 ${entry.constant ? "text-amber-500" : "text-indigo-400"}`} />
                                        <span className={`text-sm font-semibold truncate ${entry.disable ? 'text-stone-400 line-through' : 'text-stone-700 dark:text-slate-200'}`}>
                                            {entry.comment || entry.key[0] || 'Chưa đặt tên'}
                                        </span>
                                        {entry.disable && <EyeOff size={14} className="text-stone-400 shrink-0" />}
                                    </div>
                                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingEntry(entry); }} className="p-1.5 hover:bg-stone-100 dark:hover:bg-slate-800 text-stone-400 hover:text-indigo-500 rounded-md transition-colors"><Edit2 size={14} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(entry.uid); }} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-stone-400 hover:text-red-500 rounded-md transition-colors"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <div className="text-xs text-stone-500 dark:text-slate-400 truncate mt-2 font-mono bg-stone-50 dark:bg-slate-800/60 px-2 py-1 rounded inline-block w-fit max-w-full overflow-hidden text-ellipsis">
                                    {entry.key.join(', ')}
                                </div>
                            </div>
                        ))}
                        {entries.length === 0 && (
                            <div className="text-center py-4 text-[10px] text-stone-500 italic">Chưa có entry nào.</div>
                        )}
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {(isAdding || editingEntry) && (
        <LorebookEntryForm 
           initialData={editingEntry || undefined}
           onSave={handleSaveEntry}
           onCancel={() => { setIsAdding(false); setEditingEntry(undefined); }}
        />
      )}
    </div>
  );
};

export default WorldInfoSidebar;
