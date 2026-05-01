import { RegexScript } from '../types';

/**
 * Các Regex hệ thống cho Tawa Protocol
 */
export const TAWA_REGEX = {
  // Các mẫu cần loại bỏ khỏi văn bản hiển thị
  ARTIFACTS_REMOVAL: [
    /\[Hệ thống:.*?\]/gi,
    /\[Thông báo:.*?\]/gi,
    /\[Status:.*?\]/gi,
    /\[Cảnh báo:.*?\]/gi,
    /\[Lưu ý:.*?\]/gi,
    /\[Gợi ý:.*?\]/gi,
    /\[Time:.*?\]/gi,
    /\[Turn:.*?\]/gi,
    /\[Mục tiêu:.*?\]/gi,
    /\[Tiến độ:.*?\]/gi,
    /\[Giai đoạn:.*?\]/gi,
    /\[Đoạn:.*?\]/gi,
    /\[Số chữ:.*?\]/gi,
    /\[Tình trạng:.*?\]/gi,
    /\[Kiểm tra:.*?\]/gi,
    /\[Phân tích:.*?\]/gi,
    /\[Thinking:.*?\]/gi,
    /\[Content:.*?\]/gi,
    /\[Branches:.*?\]/gi,
    /\[Choices:.*?\]/gi,
    /\[Actions:.*?\]/gi,
    /\[LSR_SYNC:.*?\]/gi,
    /\[DATA_SYNC:.*?\]/gi,
    /\[INPUT_DECODING:.*?\]/gi,
    /\[SYNCHRONIZATION:.*?\]/gi,
    /\[Loading.*?:.*?\]/gi,
    /\[Tải.*?:.*?\]/gi,
    /\[KẾT THÚC PHẦN TRUYỆN\]/gi,
    /\[BẮT ĐẦU PHẦN TRUYỆN\]/gi,
    /\[SYSTEM BOOT & RESOURCE LOADING\]/gi,
    /^\s*->\s*$/gm,
    /^\s*=>\s*$/gm
  ]
};

/**
 * Trích xuất nội dung nằm giữa tag mở và tag đóng
 * Hỗ trợ cả trường hợp tag chưa đóng (cho streaming) hoặc có khoảng trắng trong tag
 * @param text Văn bản gốc
 * @param tagName Tên thẻ (không bao gồm < >)
 * @returns Nội dung bên trong hoặc null
 */
export const extractTagContent = (text: string, tagName: string): string | null => {
  if (typeof text !== 'string' || !text) return null;
  
  // Regex hỗ trợ khoảng trắng trong tag mở: <tag >
  const openTagRegex = new RegExp(`<${tagName}\\s*>`, 'i');
  const closeTagRegex = new RegExp(`</${tagName}\\s*>`, 'i');
  
  const openMatch = text.match(openTagRegex);
  if (!openMatch) return null;
  
  const startIndex = openMatch.index! + openMatch[0].length;
  const closeMatch = text.match(closeTagRegex);
  
  if (closeMatch) {
    return text.substring(startIndex, closeMatch.index).trim();
  }
  
  // Nếu không tìm thấy tag đóng, lấy hết phần còn lại (hữu ích cho streaming)
  return text.substring(startIndex).trim();
};

/**
 * Phân tách nội dung tag branches thành danh sách các lựa chọn
 * @param content Nội dung thô bên trong tag branches
 * @returns Danh sách các chuỗi lựa chọn
 */
export const parseChoices = (content: string | null): string[] => {
  if (!content) return [];
  
  // Tách theo dòng. Không tách theo | hoặc ; vì chúng có thể xuất hiện trong dữ liệu LSR rò rỉ
  const rawLines = content.split('\n');
  const validChoices: string[] = [];
  const fallbackChoices: string[] = [];
    
  for (const line of rawLines) {
    // 1. Làm sạch dòng: loại bỏ số thứ tự (1., 2., - , * , v.v.) ở đầu câu
    // Điều này giúp các regex sau đó (như narrativePatterns) hoạt động chính xác hơn.
    const cleaned = line.trim().replace(/^(\d+[.)-\s]+|[-*\u2022]\s*)/, '').trim();
    if (!cleaned) continue;

    // 0. BẮT BUỘC: Phải có định dạng chi phí thời gian [phút] ở đầu hoặc trong câu
    // Theo yêu cầu người dùng: "chỉ những hành động có chi phí thời gian mới được hiển thị"
    // Cải tiến: Hỗ trợ [10], [10 phút], [10 min], v.v.
    // Tránh khớp với các phân số như [580/1800] bằng cách giới hạn ký tự bên trong ngoặc
    const hasTime = cleaned.match(/\[\d+\s*(m|phút|min)?\]/i);

    // CẢI TIẾN QUAN TRỌNG: Nếu một dòng quá dài, nó có khả năng là văn bản truyện bị rò rỉ
    // Một lựa chọn hành động thường không quá 300 ký tự.
    if (cleaned.length > 350) continue;

    // KIỂM TRA CẤU TRÚC VĂN KỂ CHUYỆN & ĐỐI THOẠI:
    // Nới lỏng: Không lọc các câu kết thúc bằng dấu chấm trừ khi quá dài (văn kể chuyện thường rất dài)
    if (cleaned.endsWith('.') && cleaned.length > 200) continue;

    // 2. Nếu dòng chứa dấu ngoặc kép và có dấu hai chấm (định dạng đối thoại: Tên: "..."), loại bỏ.
    // Nhưng cho phép đối thoại ngắn trong lựa chọn (ví dụ: [5] Nói "Chào")
    if (cleaned.includes('"') && cleaned.includes(':') && cleaned.indexOf(':') < cleaned.indexOf('"')) continue;

    // 3. Nếu dòng bắt đầu bằng một cái tên và dấu hai chấm (ví dụ: Lâm Phong: ), loại bỏ.
    if (cleaned.match(/^[A-ZÀ-Ỹ][a-zà-ỹ]*(\s+[A-ZÀ-Ỹ][a-zà-ỹ]*)*\s*:/)) continue;

    // Narrative often starts with a name followed by a verb (Vietnamese specific patterns)
    // e.g., "Elara khẽ thở dài", "Hắn nhìn quanh", "Cô ấy mỉm cười", "Dân làng phẫn nộ"
    const narrativePatterns = [
      /^[A-ZÀ-Ỹ][a-zà-ỹ]*\s+(khẽ|đang|vừa|đã|sẽ|mỉm|nhìn|bước|thở|nói|hỏi|đáp|nghĩ|cảm|thấy|đứng|ngồi|đi|chạy|cười|khóc|mất|ra|lấy|cầm|đưa|nhảy|la|hét|gầm|nhếch|quay|tiến|lùi|đấm|đá|tấn|phòng|vung|chém|bắn|tung|rơi|bay|nằm|gục|chết|sống|biến|hiện|tỏa|thu|phát|truyền|hút|đẩy|kéo|nâng|hạ|mở|đóng|xé|nát|vỡ|tan|hợp|chia|đổi|giữ|buông|thả|bắt|thả|giết|cứu|giúp|hại|yêu|ghét|giận|vui|buồn|lo|sợ|kinh|ngạc|ngỡ|ngàng|bàng|hoàng|sửng|sốt|phẫn|nộ|hậm|hực|cay|cú|uất|ức|đau|khổ|sung|sướng|hạnh|phúc|tự|hào|thất|vọng|chán|nản|mệt|mỏi|yếu|ớt|mạnh|mẽ|hung|hăng|hung|dữ|hiền|lành|ngoan|ngoãn|hư|hỏng|tốt|bụng|xấu|xa|tham|lam|nhát|gan|dũng|cảm|thông|minh|ngu|ngốc|khờ|khạo|tinh|ranh|xảo|quyệt|gian|xảo|thật|thà|hiền|hậu|nhân|từ|độc|ác|tàn|nhẫn|vô|tình|hữu|ý|vô|ý|cố|tình|vô|tình)/,
      /^(Hắn|Cô|Anh|Chị|Nó|Họ|Tôi|Ta|Chúng|Bọn|Đám|Dân|Lính|Người|Kẻ|Tên|Gã|Mụ|Lão|Bà|Ông|Con|Cái|Sự|Cái|Điều)\s+(khẽ|đang|vừa|đã|sẽ|mỉm|nhìn|bước|thở|nói|hỏi|đáp|nghĩ|cảm|thấy|đứng|ngồi|đi|chạy|cười|khóc|mất|ra|lấy|cầm|đưa|nhảy|la|hét|gầm|nhếch|quay|tiến|lùi|đấm|đá|tấn|phòng|vung|chém|bắn|tung|rơi|bay|nằm|gục|chết|sống|biến|hiện|tỏa|thu|phát|truyền|hút|đẩy|kéo|nâng|hạ|mở|đóng|xé|nát|vỡ|tan|hợp|chia|đổi|giữ|buông|thả|bắt|thả|giết|cứu|giúp|hại|yêu|ghét|giận|vui|buồn|lo|sợ|kinh|ngạc|ngỡ|ngàng|bàng|hoàng|sửng|sốt|phẫn|nộ|hậm|hực|cay|cú|uất|ức|đau|khổ|sung|sướng|hạnh|phúc|tự|hào|thất|vọng|chán|nản|mệt|mỏi|yếu|ớt|mạnh|mẽ|hung|hăng|hung|dữ|hiền|lành|ngoan|ngoãn|hư|hỏng|tốt|bụng|xấu|xa|tham|lam|nhát|gan|dũng|cảm|thông|minh|ngu|ngốc|khờ|khạo|tinh|ranh|xảo|quyệt|gian|xảo|thật|thà|hiền|hậu|nhân|từ|độc|ác|tàn|nhẫn|vô|tình|hữu|ý|vô|ý|cố|tình|vô|tình)/,
      /^[A-ZÀ-Ỹ][a-zà-ỹ]*\s+[a-zà-ỹ]*\s+(khẽ|đang|vừa|đã|sẽ|mỉm|nhìn|bước|thở|nói|hỏi|đáp|nghĩ|cảm|thấy|đứng|ngồi|đi|chạy|cười|khóc)/,
      /^[A-ZÀ-Ỹ][a-zà-ỹ]*\s+có\s+chút\s+[a-zà-ỹ]*/,
      /^(Dân làng|Bọn lính|Đám đông|Mọi người|Kẻ địch|Đối phương|Nhân vật|Hệ thống)\s+/
    ];
    if (narrativePatterns.some(p => p.test(cleaned))) continue;

    // 4. Nếu dòng bắt đầu bằng # hoặc có định dạng index:Value (thông tin hệ thống rò rỉ), loại bỏ.
    if (cleaned.startsWith('#')) continue;
    // Regex mạnh hơn để bắt format d: hoặc d:d (LSR data)
    if (cleaned.match(/^\d+\s*:/)) continue;
    if (cleaned.match(/^[a-zA-Z0-9_]+\s*:/) && !cleaned.includes(' ')) continue; // Tên biến hệ thống: giá trị

    // 5. Nếu dòng quá ngắn (dưới 3 ký tự) và không phải là số trong ngoặc, loại bỏ.
    if (cleaned.length < 3 && !hasTime) continue;
    if (/^[^\w\s]+$/.test(cleaned)) continue;

    // 6. Nới lỏng: Cho phép dấu ngoặc kép trong lựa chọn hành động
    // if (cleaned.includes('"') || cleaned.includes('“') || cleaned.includes('”')) continue;

    // LOẠI BỎ CÁC DÒNG TƯ DUY / LOG HỆ THỐNG (Dựa trên ảnh lỗi của người dùng)
    const lower = cleaned.toLowerCase();
    if (lower === 'is clean.' || 
        lower === 'is clean' ||
        lower.includes('đoạn:') || 
        lower.includes('số chữ:') || 
        lower.includes('giai đoạn:') || 
        lower.includes('mục tiêu:') || 
        lower.includes('tiến độ:') || 
        lower.includes('đạt chuẩn') || 
        lower.includes('đang viết') ||
        lower.includes('kiểm tra') ||
        lower.includes('phân tích') ||
        lower.includes('thinking') ||
        lower.includes('content') ||
        lower.includes('branches') ||
        lower.includes('choices') ||
        lower.includes('actions') ||
        lower.includes('bắt đầu phần truyện') ||
        lower.includes('kết thúc phần truyện') ||
        cleaned.match(/\[(BẮT ĐẦU|KẾT THÚC)\s+PHẦN\s+TRUYỆN\]/i) ||
        cleaned.match(/^\[.*?\]$/) && (lower.includes('truyện') || lower.includes('phần')) ||
        lower.includes('lsr_sync') ||
        lower.includes('data_sync') ||
        lower.includes('input_decoding') ||
        lower.includes('synchronization') ||
        lower.includes('loading') ||
        lower.includes('tải biến') ||
        lower.includes('tải hiến pháp') ||
        lower.includes('luật cấm') ||
        lower.includes('đồng bộ') ||
        lower.includes('văn bản chính') ||
        lower.includes('chính văn') ||
        lower.includes('kết quả:') ||
        lower.includes('trạng thái:') ||
        lower.includes('thời gian:') ||
        lower.includes('địa điểm:') ||
        lower.includes('nhân vật:') ||
        lower.includes('hành động:') ||
        lower.includes('bối cảnh:') ||
        lower.includes('director\'s notes') ||
        lower.includes('director notes') ||
        lower.includes('system boot') ||
        lower.includes('resource loading') ||
        lower.includes('- ensure') ||
        lower.includes('- style') ||
        lower.includes('- anti-leakage') ||
        lower.includes('- structure') ||
        lower.includes('- no dialogue') ||
        lower.includes('- no narrative') ||
        lower.includes('- format') ||
        lower.includes('- purity') ||
        lower.includes('style enforcement') ||
        lower.includes('anti-leakage') ||
        lower.includes('structure check') ||
        lower.includes('player-centric') ||
        lower.includes('choice logic') ||
        lower.includes('action format') ||
        lower.includes('detail & progression') ||
        lower.includes('strict separation') ||
        lower.includes('important warning') ||
        lower.includes('branching rules') ||
        lower.includes('output structure') ||
        lower.includes('integrity check') ||
        lower.includes('word count') ||
        lower.includes('paragraphs:') ||
        lower.includes('plan for next stage') ||
        lower.includes('words per paragraph') ||
        lower.includes('internal dialogue') ||
        lower.includes('decision-making process') ||
        lower.includes('inprogress') ||
        cleaned.match(/^\w+\s+\d+\s+word\s+count/i) ||
        cleaned.match(/^\w+\s+\d+\s+paragraphs/i) ||
        cleaned.match(/^\w+\s+\d+\s+plan\s+for/i) ||
        cleaned.match(/\[\d+\/\d+\]/) || // Loại bỏ các fraction như [580/1800]
        cleaned.match(/^\d{4}-\d{2}-\d{2}/) || // Loại bỏ dòng ngày tháng rò rỉ
        cleaned.match(/^\d{2}:\d{2}/) // Loại bỏ dòng giờ giấc rò rỉ
    ) continue;

    // Loại bỏ các dòng rác hoặc tag rò rỉ
    if (cleaned.includes('|') && (cleaned.includes(':') || cleaned.startsWith('#'))) continue; // Lọc bỏ dữ liệu LSR dạng bảng
    if (cleaned.includes('<') || cleaned.includes('>')) continue;

    // Loại bỏ các dòng nằm trong ngoặc đơn (thường là lời nhắn của AI)
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) continue;

    // Loại bỏ các dòng chỉ có dấu chấm hoặc ký tự đặc biệt rác
    if (cleaned === '.' || cleaned === '...' || cleaned === '-' || cleaned === '->' || cleaned === '=>' || cleaned === '---') continue;

    // Loại bỏ các dòng bắt đầu bằng dấu gạch ngang hoặc mũi tên rác (thường là list chỉ dẫn rò rỉ)
    if (cleaned.startsWith('- ') || cleaned.startsWith('->') || cleaned.startsWith('=>') || cleaned.startsWith('---')) continue;
    
    // Loại bỏ các dòng có định dạng tiêu đề [THIẾT LẬP...] hoặc dấu mốc cấu trúc
    if (cleaned.match(/^\[(THIẾT LẬP|HỆ THỐNG|THÔNG BÁO|STATUS|START WRITING|WRITING START|STORY START|CONTINUE|NEXT|BẮT ĐẦU PHẦN TRUYỆN|KẾT THÚC PHẦN TRUYỆN).*?\]$/i)) continue;

    // 7. Thêm vào danh sách lựa chọn nếu vượt qua tất cả các bộ lọc
    if (cleaned) {
      const timeMatch = cleaned.match(/\[(\d+)\s*(m|phút|min)?\]/i);
      if (timeMatch) {
        const timeValue = timeMatch[1];
        const actionText = cleaned.replace(timeMatch[0], '').trim();
        validChoices.push(`${actionText} | ${timeValue}m`);
      } else {
        fallbackChoices.push(cleaned);
      }
    }
  }
  
  // Nếu có lựa chọn có thời gian, ưu tiên chúng
  if (validChoices.length > 0) return validChoices;
  
  // Nếu không có lựa chọn có thời gian, nhưng có lựa chọn tiềm năng, gắn thời gian mặc định [5]
  if (fallbackChoices.length > 0) {
    return fallbackChoices.map(c => `${c} | 5m`).slice(0, 10);
  }

  return [];
};

/**
 * Trích xuất định dạng JSON từ một chuỗi (hỗ trợ loại bỏ text/markdown dư thừa)
 * @param text Văn bản chứa cấu trúc JSON
 * @returns JSON object hoặc mảng nếu có, null nếu thất bại
 */
export const extractJson = <T>(text: string): T | null => {
  if (!text) return null;
  // Xóa bỏ các định dạng markdown
  const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();

  // Tìm cặp ngoặc nhọn hoặc ngoặc vuông đầu tiên/cuối cùng để trích xuất JSON
  const startBracketIndex = cleanedText.indexOf('{');
  const startSquareIndex = cleanedText.indexOf('[');
  
  let startIndex = -1;
  let endIndex = -1;
  if (startBracketIndex !== -1 && (startSquareIndex === -1 || startBracketIndex < startSquareIndex)) {
    startIndex = startBracketIndex;
    endIndex = cleanedText.lastIndexOf('}');
  } else if (startSquareIndex !== -1) {
    startIndex = startSquareIndex;
    endIndex = cleanedText.lastIndexOf(']');
  }

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const jsonStr = cleanedText.substring(startIndex, endIndex + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn("Lỗi phân tích JSON nội bộ:", e);
    }
  }

  // Fallback direct parse (in case it's clean enough)
  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    console.warn("Lỗi phân tích JSON toàn bộ:", e);
    return null;
  }
};

/**
 * Loại bỏ các thẻ hệ thống để lấy nội dung truyện thuần túy hiển thị ra UI
 * @param text Văn bản gốc
 * @returns Văn bản đã làm sạch
 */
export const cleanRawText = (text: string): string => {
  if (typeof text !== 'string' || !text) return "";
  
  const absoluteOriginal = text.trim();

  let cleaned = text;

  // Danh sách các thẻ hệ thống cần loại bỏ hoàn toàn (bao gồm cả nội dung bên trong)
  const tagsToRemove = [
    'thinking',
    'table_stored',
    'tableEdit',
    'branches',
    'choices',
    'actions',
    'memory_table_guide',
    'user_input',
    'word_count',
    'details',
    'set_time',
    'time_cost',
    'incrementalSummary'
  ];

  // 1. Xóa các khối thẻ hệ thống (Thẻ + Nội dung bên trong)
  // Chúng ta xóa các khối này TRƯỚC để tránh nội dung bên trong chúng bị hiển thị
  // CẢI TIẾN: Không xóa nội dung nếu nội dung bên trong quá dài (> 1200 ký tự) 
  // hoặc nếu thẻ chưa đóng VÀ nội dung bên trong dài (> 600 ký tự).
  tagsToRemove.forEach(tag => {
    const openTagStr = `<${tag}\\s*>`;
    const closeTagStr = `</${tag}\\s*>`;
    
    let searchIndex = 0;
    while (true) {
        const openTagRegex = new RegExp(openTagStr, 'i');
        const remainingText = cleaned.substring(searchIndex);
        const openMatch = remainingText.match(openTagRegex);
        
        if (!openMatch) break;
        
        const startIndex = searchIndex + openMatch.index!;
        const afterOpen = cleaned.substring(startIndex + openMatch[0].length);
        const closeTagRegex = new RegExp(closeTagStr, 'i');
        const closeMatch = afterOpen.match(closeTagRegex);
        
        if (closeMatch) {
            const contentInside = afterOpen.substring(0, closeMatch.index!);
            const endIndex = startIndex + openMatch[0].length + closeMatch.index! + closeMatch[0].length;
            
            // CẢI TIẾN: Nếu nội dung bên trong chứa nhiều dấu xuống dòng hoặc dấu câu truyện, 
            // có khả năng AI đã viết nhầm vào đây. Chúng ta cứu nội dung này.
            const looksLikeStory = contentInside.length > 400 || 
                                 (contentInside.match(/\n/g) || []).length > 3 ||
                                 (contentInside.match(/[.!?]["”]/g) || []).length > 1;

            if (looksLikeStory && tag === 'thinking') {
                // Nếu là thinking mà trông giống truyện, có thể AI đang "nháp" hoặc viết nhầm
                // Chúng ta giữ lại nhưng đánh dấu nhẹ
                cleaned = cleaned.substring(0, startIndex) + "\n" + contentInside + "\n" + cleaned.substring(endIndex);
                searchIndex = startIndex + contentInside.length + 2;
            } else if (contentInside.length > 1200) {
                cleaned = cleaned.substring(0, startIndex) + "\n" + contentInside + "\n" + cleaned.substring(endIndex);
                searchIndex = startIndex + contentInside.length + 2;
            } else {
                cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex);
                searchIndex = startIndex;
            }
        } else {
            const contentAfter = afterOpen;
            if (contentAfter.length < 600) {
                cleaned = cleaned.substring(0, startIndex);
                break; 
            } else {
                cleaned = cleaned.substring(0, startIndex) + "\n" + contentAfter;
                searchIndex = startIndex + 1; 
            }
        }
        if (searchIndex >= cleaned.length) break;
    }
  });

  const originalBeforeFiltering = cleaned;

  // 2. Xử lý thẻ <content> hoặc <story>
  const contentBody = extractTagContent(cleaned, 'content');
  const storyBody = extractTagContent(cleaned, 'story');
  
  if (contentBody && contentBody.length > 20) {
      cleaned = contentBody;
  } else if (storyBody && storyBody.length > 20) {
      cleaned = storyBody;
  }

  // 3. XÓA BỎ CÁC THẺ CÒN SÓT LẠI (Cực kỳ quan trọng để tránh lỗi React unrecognized tag)
  const allTagsToStrip = [...tagsToRemove, 'content', 'story', 'incrementalSummary'];
  allTagsToStrip.forEach(tag => {
      // Regex mạnh mẽ hơn để bắt mọi biến thể của thẻ: <tag>, <tag >, <tag\n>, v.v.
      const openRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
      const closeRegex = new RegExp(`</${tag}[^>]*>`, 'gi');
      cleaned = cleaned.replace(openRegex, '').replace(closeRegex, '');
  });

  // 4. LỌC CÁC DÒNG CHỈ DẪN HỆ THỐNG DẠNG VĂN BẢN THUẦN
  const lines = cleaned.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // Giữ lại dòng trống để ngắt đoạn

    // Loại bỏ các artifact kỹ thuật
    const lowerTrimmed = trimmed.toLowerCase();
    if (lowerTrimmed.includes('<finish>') || 
        lowerTrimmed === 'is clean.' ||
        lowerTrimmed === 'is clean' ||
        trimmed.match(/^['\s,.]*$/) || // Xóa dòng chỉ có dấu phẩy, chấm, nháy đơn rác
        trimmed === '->' || trimmed === '=>' || // Xóa dòng chỉ có mũi tên
        lowerTrimmed.includes('[kết thúc phần truyện]') ||
        lowerTrimmed.includes('[bắt đầu phần truyện]') ||
        lowerTrimmed.includes('[system boot & resource loading]') ||
        lowerTrimmed.includes('[start writing]') ||
        lowerTrimmed.includes('[writing_start]') ||
        lowerTrimmed.includes('[story_start]') ||
        lowerTrimmed.includes('[continue]') ||
        lowerTrimmed.includes('[next]') ||
        lowerTrimmed.includes('perspective:') ||
        lowerTrimmed.includes('director\'s notes') ||
        lowerTrimmed.includes('director notes') ||
        lowerTrimmed.includes('system boot') ||
        lowerTrimmed.includes('resource loading')
    ) return false;
    
    // Chỉ xóa dòng nếu nó CHỈ chứa một thẻ hệ thống (không có văn bản truyện đi kèm)
    if (trimmed.match(/^<\/?(set_time|time_cost|branches|thinking|content|story|tableEdit|table_stored|incrementalSummary).*?>$/i)) return false;
    
    // Loại bỏ các dòng log hệ thống đặc thù của Tawa
    if (trimmed.match(/^\d+:/)) return false; // Lọc bỏ rò rỉ LSR (0:Value)
    if (trimmed.includes('|')) return false; // Lọc bỏ rò rỉ LSR dạng bảng
    if (trimmed.match(/^\[(Tải Hiến Pháp|DATA SYNC|INPUT DECODING|ĐỒNG BỘ HÓA|Tải Biến Số|Luật Cấm|Đồng bộ Canon|Đồng bộ Trạng thái|Thiết lập thời gian|Địa điểm|Mục tiêu|Giai đoạn|Đoạn|Số chữ|Tiến độ|Tình trạng|Kiểm tra|Phân tích|Thinking|Content|Branches|Choices|Actions|LSR_SYNC|DATA_SYNC|INPUT_DECODING|SYNCHRONIZATION|Loading|Tải).*?\]/i)) return false;
    if (trimmed.match(/^\d+\.\s*\[(Tải Hiến Pháp|DATA SYNC|INPUT DECODING|ĐỒNG BỘ HÓA|Tải Biến Số|Luật Cấm|Mục tiêu|Giai đoạn|Đoạn|Số chữ|Tiến độ|Tình trạng|Kiểm tra|Phân tích).*?\]/i)) return false;
    if (trimmed.match(/^(\*|-) (User|NPC|Đồng bộ|Thiết lập|Địa điểm|Perspective|Cảnh báo|Lưu ý|Mục tiêu|Giai đoạn|Đoạn|Số chữ|Tiến độ|Tình trạng|Kiểm tra|Phân tích):/i)) return false;
    if (trimmed.match(/^(Mục tiêu|Giai đoạn|Đoạn|Số chữ|Tình trạng đạt chuẩn|Sắp xếp số chữ|Perspective|Cảnh báo|Lưu ý|Tiến độ|Tình trạng|Kiểm tra|Phân tích|Thinking|Content|Branches|Choices|Actions|LSR_SYNC|DATA_SYNC|INPUT_DECODING|SYNCHRONIZATION|Loading|Tải).*?:/i)) return false;
    if (trimmed.match(/^<!--.*?-->$/)) return false;
    if (trimmed.toLowerCase().includes('tiến hành viết chính văn')) return false;
    if (trimmed.toLowerCase().includes('bắt đầu viết')) return false;
    if (trimmed.toLowerCase().includes('đang viết')) return false;
    if (trimmed.toLowerCase().includes('kết thúc viết')) return false;
    if (trimmed.toLowerCase().includes('hoàn thành viết')) return false;
    if (trimmed.includes('[START WRITING]')) return false;
    if (trimmed.includes('[WRITING_START]')) return false;
    if (trimmed.includes('[STORY_START]')) return false;
    if (trimmed.includes('[CONTINUE]')) return false;
    if (trimmed.includes('[NEXT]')) return false;

    // Loại bỏ các dòng chỉ dẫn hệ thống tiếng Anh bị rò rỉ
    if (trimmed.startsWith('- Ensure') || 
        trimmed.startsWith('- STYLE') || 
        trimmed.startsWith('- ANTI-LEAKAGE') || 
        trimmed.startsWith('- STRUCTURE') ||
        trimmed.startsWith('- NO DIALOGUE') ||
        trimmed.startsWith('- NO NARRATIVE') ||
        trimmed.startsWith('- FORMAT') ||
        trimmed.startsWith('- PURITY') ||
        trimmed.startsWith('STYLE ENFORCEMENT') ||
        trimmed.startsWith('ANTI-LEAKAGE') ||
        trimmed.startsWith('STRUCTURE CHECK') ||
        trimmed.startsWith('CRITICAL_CHOICE_FORMATTING') ||
        trimmed.startsWith('TECHNICAL_FORMATTING_RULES') ||
        trimmed.startsWith('. No meta-talk') ||
        trimmed.startsWith('Anti-Mind Reading') ||
        trimmed.startsWith('Humility:') ||
        trimmed.startsWith('Integrity:') ||
        trimmed.startsWith('Load Core Variables') ||
        trimmed.startsWith('Axioms:') ||
        trimmed.startsWith('Anti-Rules:') ||
        trimmed.startsWith('Goal Analysis') ||
        trimmed.startsWith('Goal:') ||
        trimmed.startsWith('Paragraphs:') ||
        trimmed.startsWith('Words per paragraph') ||
        trimmed.startsWith('Canon Sync') ||
        trimmed.startsWith('Coordinates:') ||
        trimmed.startsWith('Status Sync') ||
        trimmed.startsWith('Enigma:') ||
        trimmed.startsWith('Thân thế thực sự') ||
        trimmed.startsWith('Bí mật về thảm họa') ||
        trimmed.startsWith('Seeds:') ||
        trimmed.startsWith('[World -') ||
        trimmed.startsWith('Thrilling Core') ||
        trimmed.startsWith('Axioms:') ||
        trimmed.startsWith('Anti-Rules:') ||
        trimmed.startsWith('Goal Analysis') ||
        trimmed.startsWith('Goal:') ||
        trimmed.startsWith('Paragraphs:') ||
        trimmed.startsWith('Words per paragraph') ||
        trimmed.startsWith('Canon Sync') ||
        trimmed.startsWith('Coordinates:') ||
        trimmed.includes('💭Tawa Finished Thinking') ||
        trimmed.includes('Anti-Mind Reading') ||
        trimmed.includes('Humility:') ||
        trimmed.includes('Integrity:') ||
        trimmed.includes('Load Core Variables') ||
        trimmed.includes('. No meta-talk')
    ) {
      return false;
    }

    return true;
  });

  cleaned = filteredLines.join('\n').trim();

  // FALLBACK: Nếu sau khi lọc mà không còn gì, nhưng trước đó có văn bản, hãy trả về văn bản trước khi lọc
  // Điều này giúp tránh việc hiển thị "Nội dung truyện trống" khi AI viết truyện nhưng bị nhầm là hệ thống
  if (!cleaned) {
      if (originalBeforeFiltering.trim().length > 10) {
          return originalBeforeFiltering.trim();
      }
      // CẢI TIẾN CUỐI CÙNG: Nếu vẫn trống, trả về văn bản gốc (đã trim) để người dùng có cái để đọc/sửa
      if (absoluteOriginal.length > 5) {
          return absoluteOriginal;
      }
  }

  return cleaned;
};

class RegexProvider {
    private static _instance: RegexProvider;
    private cache: Map<string, RegExp> = new Map();
    private maxCacheSize = 1000;

    static get instance() {
        if (!RegexProvider._instance) RegexProvider._instance = new RegexProvider();
        return RegexProvider._instance;
    }

    get(regexString: string, flags: string = 'g'): RegExp | null {
        const cacheKey = `/${regexString}/${flags}`;
        
        if (this.cache.has(cacheKey)) {
            const re = this.cache.get(cacheKey)!;
            this.cache.delete(cacheKey);
            this.cache.set(cacheKey, re);
            re.lastIndex = 0;
            return re;
        }

        try {
            const re = new RegExp(regexString, flags);
            if (this.cache.size >= this.maxCacheSize) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey !== undefined) {
                    this.cache.delete(firstKey);
                }
            }
            this.cache.set(cacheKey, re);
            return re;
        } catch (e) {
            console.error("Lỗi biên dịch Regex:", e, cacheKey);
            return null;
        }
    }

    clear() {
        this.cache.clear();
    }
}

export const regexProvider = RegexProvider.instance;

function filterString(str: string, trims: string[], macros: Record<string, string>): string {
    let result = str;
    for (const trim of trims) {
        if (!trim) continue;
        let processedTrim = trim;
        Object.entries(macros).forEach(([k, v]) => {
            processedTrim = processedTrim.split(k).join(v || '');
        });
        result = result.split(processedTrim).join('');
    }
    return result;
}

function extractFlags(findRegex: string): { regex: string, flags: string } {
    if (findRegex && findRegex.startsWith('/')) {
        const lastSlashIndex = findRegex.lastIndexOf('/');
        if (lastSlashIndex > 0) {
            const regex = findRegex.substring(1, lastSlashIndex);
            const flags = findRegex.substring(lastSlashIndex + 1);
            return { regex, flags };
        }
    }
    // Default fallback
    return { regex: findRegex, flags: 'gi' };
}

export function runRegexScript(
    script: RegexScript, 
    rawString: string, 
    params: { userName?: string; charName?: string; isDebug?: boolean } = {}
): string {
    if (script.disabled === true || !script.findRegex || !rawString) return rawString;

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const macros: Record<string, string> = {
        '{{user}}': params.userName || 'User',
        '{{char}}': params.charName || 'Character',
        '{{User}}': params.userName || 'User',
        '{{Char}}': params.charName || 'Character'
    };

    const substituteParams = (text: string, escapeMode: number) => {
        let result = text;
        Object.entries(macros).forEach(([key, value]) => {
            let v = value || '';
            if (escapeMode === 2) v = escapeRegExp(v);
            result = result.split(key).join(v);
        });
        return result;
    };

    const findRegexPattern = substituteParams(script.findRegex, script.substituteRegex || 0);
    const extracted = extractFlags(findRegexPattern);
    const re = RegexProvider.instance.get(extracted.regex, extracted.flags);
    
    if (!re) return rawString;

    const trims = script.trimStrings || [];
    let replaceString = script.replaceString || '';
    
    replaceString = substituteParams(replaceString, 0);
    replaceString = replaceString.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    try {
        return rawString.replace(re, (...args) => {
            const match = args[0];
            const isObject = (val: any) => val !== null && typeof val === 'object';
            const hasNamedGroups = args.length > 0 && isObject(args[args.length - 1]);
            const namedGroups = hasNamedGroups ? args[args.length - 1] : {};
            const numGroups = hasNamedGroups ? args.length - 3 : args.length - 2;
            const groups = args.slice(1, 1 + numGroups);

            let result = replaceString;

            const filteredMatch = filterString(match, trims, macros);
            result = result.split('{{match}}').join(filteredMatch.replace(/\$/g, '$$$$'));

            groups.forEach((g, idx) => {
                const filteredGroup = g !== undefined ? filterString(String(g), trims, macros) : '';
                result = result.split(`$${idx + 1}`).join(filteredGroup);
            });

            if (hasNamedGroups) {
                Object.entries(namedGroups).forEach(([key, val]) => {
                    const filteredGroup = val !== undefined ? filterString(String(val), trims, macros) : '';
                    result = result.split(`$<${key}>`).join(filteredGroup);
                });
            }

            result = result.replace(/\$\$\$\$/g, '$');

            const lowerRep = result.toLowerCase();
            if (lowerRep.includes('<!doctype html>') || lowerRep.includes('<html') || lowerRep.includes('<script')) {
                const base64Html = typeof btoa !== 'undefined' 
                    ? btoa(unescape(encodeURIComponent(result)))
                    : Buffer.from(result).toString('base64');
                return `<tawa-widget>${base64Html}</tawa-widget>`;
            }

            return result;
        });
    } catch (e) {
        if (params.isDebug) console.error(`[Regex Error] in script "${script.scriptName}":`, e);
        return rawString;
    }
}

export function getRegexedString(
    rawString: string,
    placement: number,
    scripts: RegexScript[],
    params: {
        userName?: string;
        charName?: string;
        isMarkdown?: boolean;
        isPrompt?: boolean;
        isEdit?: boolean;
        depth?: number;
        isDebug?: boolean;
    } = {}
): string {
    if (!scripts || scripts.length === 0 || !rawString || typeof rawString !== 'string') return rawString;

    let finalString = rawString;

    scripts.forEach(script => {
        if (script.disabled === true) return;
        
        if (script.placement && script.placement.length > 0) {
            if (!script.placement.includes(placement)) return;
        }

        // Ephemerality handling
        if (params.isMarkdown && script.alterChatDisplay === false && script.alterOutgoingPrompt === true && !script.markdownOnly) return; 
        if (params.isPrompt && script.alterOutgoingPrompt === false && script.alterChatDisplay === true && !script.promptOnly) return;

        if (script.markdownOnly && !params.isMarkdown) return;
        if (script.promptOnly && !params.isPrompt) return;
        if (!script.markdownOnly && !script.promptOnly && (params.isMarkdown || params.isPrompt)) {
            // By default, scripts without markdownOnly/promptOnly apply everywhere unless ephemerality dictates otherwise
        }

        if (params.isEdit && !script.runOnEdit) return;

        if (typeof params.depth === 'number' && params.depth !== -1) {
            const min = script.minDepth !== null && script.minDepth !== undefined ? script.minDepth : 0;
            // Handle maxDepth properly when it's null (unlimited)
            const max = script.maxDepth !== null && script.maxDepth !== undefined ? script.maxDepth : Infinity;
            if (params.depth < min || params.depth > max) return;
        }

        const preLength = finalString.length;
        finalString = runRegexScript(script, finalString, params);
        if (params.isDebug && preLength !== finalString.length) {
            console.log(`[Regex Debug] Script "${script.scriptName}" changed length from ${preLength} to ${finalString.length}`);
        }
    });

    return finalString;
}

export const applySTRegex = (
  text: string,
  scripts: RegexScript[],
  userName: string = 'User',
  charName: string = 'Character',
  placementTargets: number[] = [2],
  debug: boolean = false,
  messageDepth: number = -1
): string => {
   return getRegexedString(text, placementTargets[0] || 2, scripts, {
       userName, charName, isDebug: debug, depth: messageDepth, isMarkdown: placementTargets.includes(2)
   });
};
