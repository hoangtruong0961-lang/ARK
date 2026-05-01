import { RegexScript } from "../../types";

export const applyRegexScripts = (
  text: string, 
  scripts: RegexScript[], 
  macros: Record<string, string> // { "{{user}}": "Anon", "{{char}}": "Dora" }
): string => {
  if (!text || !scripts || scripts.length === 0) return text;
  
  let processedText = text;

  scripts.filter(s => !s.disabled).forEach(script => {
    try {
      if (!script.findRegex) return;
      
      // 1. Thay thế macro trong chuỗi thay thế (Replacement)
      let replacement = script.replaceString || '';
      Object.entries(macros).forEach(([key, value]) => {
        // Need to escape backslashes first to prevent user input from being evaluated as strings
        let safeValue = value || '';
        // In regex replacement string, $ has special meaning, we must escape it 
        safeValue = safeValue.replace(/\$/g, '$$$$');
        replacement = replacement.replaceAll(key, safeValue);
      });

      // Special string replacements for \n \t in replacement strings from ST format
      replacement = replacement.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

      // 2. Khởi tạo Regex an toàn
      const re = new RegExp(script.findRegex, 'g'); 
      
      // 3. Thực thi
      processedText = processedText.replace(re, replacement);
    } catch (e) {
      console.error(`Regex error in ${script.scriptName || script.id}:`, e);
    }
  });

  return processedText;
};
