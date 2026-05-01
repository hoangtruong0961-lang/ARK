import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RegexScript, WorldData, AppSettings } from '../../../../types';
import { dbService } from '../../../../services/db/indexedDB';
import { Settings, X, Plus, ChevronUp, ChevronDown, Edit2, Trash2, Play, Bug } from 'lucide-react';
import { runRegexScript } from '../../../../utils/regex';

export enum SCRIPT_TYPES {
    GLOBAL = 0,
    SCOPED = 1,
    PRESET = 2,
}

interface RegexScriptsManagerProps {
    activeWorld?: WorldData | null;
    onUpdateWorld?: (data: Partial<WorldData>) => void;
    playerName: string;
    charName: string;
    onScriptsChanged?: () => void;
}

const RegexScriptsManager: React.FC<RegexScriptsManagerProps> = ({ activeWorld, onUpdateWorld, playerName, charName, onScriptsChanged }) => {
    // UI states
    const [isOpen, setIsOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isDebuggerOpen, setIsDebuggerOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<RegexScript | null>(null);
    const [editingType, setEditingType] = useState<SCRIPT_TYPES | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [globalScripts, setGlobalScripts] = useState<RegexScript[]>([]);
    const [scopedScripts, setScopedScripts] = useState<RegexScript[]>([]);
    const [presetScripts, setPresetScripts] = useState<RegexScript[]>([]);
    
    const [scopedEnabled, setScopedEnabled] = useState(true);
    const [presetEnabled, setPresetEnabled] = useState(true);
    
    // Editor State
    const [testInput, setTestInput] = useState<string>('Test your regex here...');
    
    // Debugger State
    const [debuggerInput, setDebuggerInput] = useState<string>('Test detailed processing...');
    const [debuggerHighlights, setDebuggerHighlights] = useState<boolean>(false);
    const [debuggerResults, setDebuggerResults] = useState<any[]>([]);

    const loadScripts = useCallback(async () => {
        try {
            const settings = await dbService.getSettings() as AppSettings;
            let globals = settings.regex_scripts || [];
            
            let scopeds = activeWorld?.extensions?.regex_scripts || [];
            let presets = activeWorld?.config?.regexScripts || [];
            
            // Migrate
            const migrate = (arr: any[]) => arr.map(s => {
                if (!s.id) s.id = crypto.randomUUID();
                if (!Array.isArray(s.placement)) {
                    s.placement = s.placement ? [s.placement] : [0, 1, 2];
                }
                if (s.placement.includes(0)) {
                    s.placement = s.placement.filter((p: number) => p !== 0);
                    s.markdownOnly = true;
                    s.promptOnly = true;
                }
                if (s.placement.includes(4)) {
                    s.placement = [...s.placement.filter((p: number) => p !== 4), 3];
                }
                
                // Map legacy names
                if (s.name && !s.scriptName) s.scriptName = s.name;
                if (s.regex && !s.findRegex) s.findRegex = s.regex;
                if (s.replacement !== undefined && s.replaceString === undefined) s.replaceString = s.replacement;
                if (s.isEnabled !== undefined && s.disabled === undefined) s.disabled = !s.isEnabled;
                
                return s as RegexScript;
            });

            globals = migrate(globals);
            scopeds = migrate(scopeds);
            presets = migrate(presets);

            setGlobalScripts(globals);
            setScopedScripts(scopeds);
            setPresetScripts(presets);
        } catch (e) {
            console.error("Failed to load regex scripts", e);
        }
    }, [activeWorld]);

    useEffect(() => {
        if (isOpen) {
            loadScripts();
        }
    }, [isOpen, loadScripts]);

    const saveScriptsByType = async (scripts: RegexScript[], type: SCRIPT_TYPES) => {
        try {
            if (type === SCRIPT_TYPES.GLOBAL) {
                const settings = await dbService.getSettings() as AppSettings;
                settings.regex_scripts = scripts;
                await dbService.saveSettings(settings);
                setGlobalScripts(scripts);
            } else if (type === SCRIPT_TYPES.SCOPED) {
                if (onUpdateWorld && activeWorld) {
                    const ext = activeWorld.extensions || {};
                    onUpdateWorld({ extensions: { ...ext, regex_scripts: scripts } });
                }
                setScopedScripts(scripts);
            } else if (type === SCRIPT_TYPES.PRESET) {
                if (onUpdateWorld && activeWorld) {
                    const cfg = activeWorld.config || {};
                    onUpdateWorld({ config: { ...cfg, regexScripts: scripts } });
                }
                setPresetScripts(scripts);
            }
        } catch (e) {
            console.error("Failed to save scripts", e);
        }
        if (onScriptsChanged) onScriptsChanged();
    };

    const handleToggleDisable = (scriptId: string, type: SCRIPT_TYPES) => {
        const list = type === SCRIPT_TYPES.GLOBAL ? globalScripts : type === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts;
        const newList = list.map(s => s.id === scriptId ? { ...s, disabled: !s.disabled } : s);
        saveScriptsByType(newList, type);
    };

    const handleDelete = (scriptId: string, type: SCRIPT_TYPES) => {
        if (!confirm("Are you sure you want to delete this script?")) return;
        const list = type === SCRIPT_TYPES.GLOBAL ? globalScripts : type === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts;
        saveScriptsByType(list.filter(s => s.id !== scriptId), type);
    };

    const handleMove = (index: number, direction: 'up' | 'down', type: SCRIPT_TYPES) => {
        const list = [...(type === SCRIPT_TYPES.GLOBAL ? globalScripts : type === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts)];
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === list.length - 1)) return;
        const temp = list[index];
        if (direction === 'up') {
            list[index] = list[index - 1];
            list[index - 1] = temp;
        } else {
            list[index] = list[index + 1];
            list[index + 1] = temp;
        }
        saveScriptsByType(list, type);
    };

    const openEditor = (script: RegexScript | null, type: SCRIPT_TYPES) => {
        if (script) {
            setEditingScript({ ...script });
        } else {
            setEditingScript({
                id: crypto.randomUUID(),
                scriptName: 'New Script',
                findRegex: '',
                replaceString: '',
                trimStrings: [],
                placement: [1, 2],
                substituteRegex: 0,
                markdownOnly: false,
                promptOnly: false,
                minDepth: null,
                maxDepth: null,
                disabled: false,
                runOnEdit: false
            });
        }
        setEditingType(type);
        setIsEditorOpen(true);
    };

    const saveEditor = () => {
        if (!editingScript || editingType === null) return;
        const list = editingType === SCRIPT_TYPES.GLOBAL ? globalScripts : editingType === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts;
        const idx = list.findIndex(s => s.id === editingScript.id);
        if (idx >= 0) {
            const newList = [...list];
            newList[idx] = editingScript;
            saveScriptsByType(newList, editingType);
        } else {
            saveScriptsByType([...list, editingScript], editingType);
        }
        setIsEditorOpen(false);
    };

    const renderList = (title: string, list: RegexScript[], type: SCRIPT_TYPES, isEnabled: boolean, onToggleEnable?: () => void) => (
        <div className="mb-6">
            <div className="flex items-center justify-between bg-stone-100 dark:bg-slate-800 p-2 rounded-t-lg border border-stone-200 dark:border-slate-700">
                <h3 className="font-bold text-stone-800 dark:text-stone-200">{title}</h3>
                <div className="flex items-center gap-2">
                    {onToggleEnable && (
                        <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-slate-300 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={isEnabled} 
                                onChange={onToggleEnable} 
                                className="rounded bg-stone-200" 
                            />
                            Enable section
                        </label>
                    )}
                    <button onClick={() => openEditor(null, type)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-700 rounded" title={`New ${title} Script`}>
                        <Plus size={16} />
                    </button>
                </div>
            </div>
            <div className="border border-t-0 border-stone-200 dark:border-slate-700 rounded-b-lg p-2 bg-white dark:bg-slate-900/50 space-y-2">
                {list.length === 0 ? (
                    <div className="text-center text-stone-400 p-4 text-sm">No scripts</div>
                ) : list.map((script, idx) => (
                    <div key={script.id} className="flex items-center justify-between p-2 hover:bg-stone-50 dark:hover:bg-slate-800 rounded border border-stone-100 dark:border-slate-700/50 group">
                        <div className="flex items-center gap-3">
                            <button className="cursor-move text-stone-400 hover:text-stone-600">☰</button>
                            <input 
                                type="checkbox" 
                                checked={!script.disabled} 
                                onChange={() => handleToggleDisable(script.id, type)} 
                            />
                            <span className={`font-semibold ${script.disabled ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-200'}`}>
                                {script.scriptName}
                            </span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleMove(idx, 'up', type)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-700 rounded"><ChevronUp size={14}/></button>
                            <button onClick={() => handleMove(idx, 'down', type)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-700 rounded"><ChevronDown size={14}/></button>
                            <button onClick={() => openEditor(script, type)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-700 rounded"><Edit2 size={14}/></button>
                            <button onClick={() => handleDelete(script.id, type)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded"><Trash2 size={14}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const testOutput = useMemo(() => {
        if (!editingScript) return '';
        try {
            return runRegexScript(editingScript, testInput, { userName: playerName, charName: charName, isDebug: true });
        } catch(e) {
            return 'Regex Error';
        }
    }, [editingScript, testInput, playerName, charName]);

    const runDebugger = () => {
        let text = debuggerInput;
        const results = [];
        
        const allScripts = [
            ...globalScripts,
            ...(scopedEnabled ? scopedScripts : []),
            ...(presetEnabled ? presetScripts : [])
        ];

        for (const script of allScripts) {
            if (script.disabled) continue;
            const before = text;
            text = runRegexScript(script, text, { userName: playerName, charName, isDebug: true });
            
            const diff = text.length - before.length;
            if (before !== text) {
                results.push({
                    scriptName: script.scriptName,
                    diff,
                    result: text
                });
            }
        }
        
        setDebuggerResults(results);
    };

    return (
        <div className="mb-4">
            <button onClick={() => setIsOpen(true)} className="w-full p-3 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-300 dark:hover:bg-slate-800 rounded-lg flex justify-between items-center transition-colors">
                 <div className="flex items-center gap-2 font-bold text-stone-700 dark:text-stone-300"><Settings size={18}/> Regex Scripts Manager</div>
                 <div className="text-xs px-2 py-1 bg-stone-300 dark:bg-slate-700 rounded-full">{globalScripts.length + scopedScripts.length + presetScripts.length} combined</div>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950">
                            <h2 className="font-bold text-lg text-stone-800 dark:text-stone-100 flex items-center gap-2"><Settings size={20}/> Regex Scripts Manager</h2>
                            <div className="flex gap-2">
                                <button onClick={() => setIsDebuggerOpen(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded hover:bg-indigo-200 transition-colors font-bold"><Bug size={14}/> Debugger</button>
                                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-800 rounded text-stone-500"><X size={20}/></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-stone-50/50 dark:bg-slate-900">
                            {renderList('Global Scripts', globalScripts, SCRIPT_TYPES.GLOBAL, true)}
                            {renderList('Scoped Scripts', scopedScripts, SCRIPT_TYPES.SCOPED, scopedEnabled, () => setScopedEnabled(!scopedEnabled))}
                            {renderList('Preset Scripts', presetScripts, SCRIPT_TYPES.PRESET, presetEnabled, () => setPresetEnabled(!presetEnabled))}
                        </div>
                    </div>
                </div>
            )}

            {isEditorOpen && editingScript && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-3xl max-h-[95vh] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-stone-200 dark:border-slate-700">
                        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950">
                            <h2 className="font-bold text-lg flex items-center gap-2"><Edit2 size={18}/> Edit Script ({editingType === 0 ? 'Global' : editingType === 1 ? 'Scoped' : 'Preset'})</h2>
                            <button onClick={() => setIsEditorOpen(false)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-800 rounded"><X size={20}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Script Name</label>
                                    <input className="w-full p-2 bg-stone-100 dark:bg-slate-800 rounded border border-stone-300 dark:border-slate-700 outline-none focus:border-indigo-500" value={editingScript.scriptName} onChange={e => setEditingScript({...editingScript, scriptName: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Disabled</label>
                                    <div className="flex items-center h-10">
                                        <input type="checkbox" className="w-5 h-5 rounded cursor-pointer" checked={editingScript.disabled} onChange={e => setEditingScript({...editingScript, disabled: e.target.checked})} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Find Regex</label>
                                <input className="w-full p-2 font-mono text-pink-600 bg-stone-100 dark:bg-slate-800 rounded border border-stone-300 dark:border-slate-700 outline-none focus:border-indigo-500" placeholder="/pattern/g" value={editingScript.findRegex} onChange={e => setEditingScript({...editingScript, findRegex: e.target.value})} />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Replace With (use {'{{match}}'}, $1)</label>
                                <textarea className="w-full p-2 font-mono text-emerald-600 bg-stone-100 dark:bg-slate-800 rounded border border-stone-300 dark:border-slate-700 min-h-[80px] outline-none focus:border-indigo-500 resize-none" value={editingScript.replaceString} onChange={e => setEditingScript({...editingScript, replaceString: e.target.value})} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Trim Strings (one per line)</label>
                                    <textarea className="w-full p-2 text-sm bg-stone-100 dark:bg-slate-800 rounded border border-stone-300 dark:border-slate-700 min-h-[80px] outline-none focus:border-indigo-500 resize-none" value={editingScript.trimStrings?.join('\n') || ''} onChange={e => setEditingScript({...editingScript, trimStrings: e.target.value.split('\n')})} />
                                </div>
                                <div className="space-y-2 py-4">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input type="checkbox" checked={editingScript.alterChatDisplay || false} onChange={e => setEditingScript({...editingScript, alterChatDisplay: e.target.checked})} className="rounded"/> Alter Chat Display
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input type="checkbox" checked={editingScript.alterOutgoingPrompt || false} onChange={e => setEditingScript({...editingScript, alterOutgoingPrompt: e.target.checked})} className="rounded"/> Alter Outgoing Prompt
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input type="checkbox" checked={editingScript.runOnEdit || false} onChange={e => setEditingScript({...editingScript, runOnEdit: e.target.checked})} className="rounded"/> Run on Edit
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2 border-t border-stone-200 dark:border-slate-700 pt-4">
                                <h4 className="font-bold text-sm">Placement Targets</h4>
                                <div className="flex gap-4">
                                    {[
                                        {v: 1, l: 'User Input'},
                                        {v: 2, l: 'AI Output'},
                                        {v: 3, l: 'Slash Command'},
                                        {v: 5, l: 'World Info'},
                                        {v: 6, l: 'Reasoning'}
                                    ].map(p => (
                                        <label key={p.v} className="flex items-center gap-1 text-sm bg-stone-100 dark:bg-slate-800 px-2 py-1 rounded cursor-pointer border border-stone-200 dark:border-slate-700">
                                            <input type="checkbox" checked={editingScript.placement?.includes(p.v) || false} onChange={e => {
                                                const arr = editingScript.placement || [];
                                                setEditingScript({...editingScript, placement: e.target.checked ? [...arr, p.v] : arr.filter(x => x !== p.v)});
                                            }}/> {p.l}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                                <h4 className="font-bold text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-2"><Play size={16}/> Test Mode</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <textarea className="w-full text-sm p-2 bg-white dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded h-32 resize-none" value={testInput} onChange={e => setTestInput(e.target.value)} />
                                    <div className="w-full text-sm p-2 bg-stone-50 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded h-32 overflow-auto whitespace-pre-wrap">{testOutput}</div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950 flex justify-end gap-2">
                            <button className="px-4 py-2 font-bold rounded text-stone-600 hover:bg-stone-200 dark:hover:bg-slate-800" onClick={() => setIsEditorOpen(false)}>Cancel</button>
                            <button className="px-4 py-2 font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700" onClick={saveEditor}>Save Script</button>
                        </div>
                    </div>
                </div>
            )}

            {isDebuggerOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[95vh] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-stone-200 dark:border-slate-700">
                         <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950">
                            <h2 className="font-bold text-lg flex items-center gap-2"><Bug size={18}/> Regex Debugger</h2>
                            <button onClick={() => setIsDebuggerOpen(false)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-800 rounded"><X size={20}/></button>
                        </div>
                        <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
                            <div className="flex flex-col h-1/3">
                                <label className="text-sm font-bold text-stone-600 mb-1">Input Sequence</label>
                                <textarea className="w-full flex-1 p-3 bg-stone-100 dark:bg-slate-950 border border-stone-300 dark:border-slate-700 rounded resize-none" value={debuggerInput} onChange={e => setDebuggerInput(e.target.value)} />
                                <div className="mt-2 flex justify-end">
                                    <button onClick={runDebugger} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 shadow-lg">Run Debug Test</button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto bg-stone-50 dark:bg-slate-800/30 p-4 border border-stone-200 dark:border-slate-700 rounded-lg">
                                <h3 className="font-bold mb-4">Step-by-step Results</h3>
                                {debuggerResults.length === 0 ? <p className="text-stone-500 italic text-sm">No transformations occurred. Run test to see results.</p> : (
                                    <div className="space-y-4">
                                        {debuggerResults.map((r, i) => (
                                            <div key={i} className="border border-stone-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 override-overflow">
                                                <div className="bg-stone-100 dark:bg-slate-800 px-3 py-2 flex justify-between items-center border-b border-stone-200 dark:border-slate-700">
                                                    <span className="font-bold text-indigo-600 dark:text-indigo-400">Step {i+1}: {r.scriptName}</span>
                                                    <span className={`text-xs font-mono px-2 py-1 rounded ${r.diff > 0 ? 'bg-red-100 text-red-700' : r.diff < 0 ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-600'}`}>{r.diff > 0 ? '+' : ''}{r.diff} chars</span>
                                                </div>
                                                <div className="p-3 whitespace-pre-wrap font-mono text-sm">{r.result}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegexScriptsManager;
