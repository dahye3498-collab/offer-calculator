import { OfferItem, ParsingError, ParseResult } from './types';

/**
 * 정규화 함수:
 * 1. 별표마킹(*S*) 및 등급 토큰(A, AF 등) 추출
 * 2. 부위 명칭 정규화 (끝에 'S' 제거 등)
 */
export function normalizeProductName(rawName: string): { name: string; grade: string } {
    let grade = '';
    let name = rawName.toUpperCase().trim();

    // 추출할 등급 패턴들
    const gradePatterns = [/\*S\*/g, /\bA\b/g, /\bAF\b/g, /\bB\b/g, /\bCHOICE\b/g, /\bPRIME\b/g];

    gradePatterns.forEach(pattern => {
        if (pattern.test(name)) {
            const matches = name.match(pattern);
            if (matches) grade = matches.join(' ');
            name = name.replace(pattern, '').replace(/\s+/g, ' ').trim();
        }
    });

    // 단순 정규화: 끝에 'S'가 붙은 복수형 처리 (예: STRIPLOINS -> STRIPLOIN)
    // 단, 'S'로 끝나는 고유 명칭이 있을 수 있으니 기본적인 것만 처리
    if (name.endsWith('S') && name.length > 4) {
        name = name.substring(0, name.length - 1);
    }

    return { name, grade };
}

/**
 * 스펙 추출 함수:
 * 원문에서 중량, 비율, 포장 단위 등을 대략적으로 추출
 */
function extractSpecs(description: string) {
    const specs = {
        weight: '',
        ratio: '',
        pack: '',
    };

    // 예: 25kg, 20kg/box
    const weightMatch = description.match(/(\d+\s*(kg|lb|mt|G))/i);
    if (weightMatch) specs.weight = weightMatch[0];

    // 예: 80/20, 90vl
    const ratioMatch = description.match(/(\d+\/\d+|\d+vl)/i);
    if (ratioMatch) specs.ratio = ratioMatch[0];

    // 예: vacuum packed, IWP, poly bag
    const packMatch = description.match(/(vacuum|iwp|ivp|poly|wrapped|box)/i);
    if (packMatch) specs.pack = packMatch[0];

    return specs;
}

export function parseOfferText(text: string): ParseResult {
    const lines = text.split('\n');
    const items: OfferItem[] = [];
    const meta: string[] = [];
    const errors: ParsingError[] = [];

    // 핵심 패턴: (수량)x(사이즈) (상태) (설명) @ $(가격)
    // 예: 1x40FCL frozen BEEF STRIPLOINS *S* @ $5.50
    const itemRegex = /^(\d+)x(\d+)(FCL|LCL)?\s+(frozen|chilled|frozen\/chilled)\s+(.*?)\s*@\s*\$(\d+(\.\d+)?)/i;

    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        const match = trimmedLine.match(itemRegex);

        if (match) {
            const containerCount = parseInt(match[1]);
            const containerSize = match[2] + (match[3] || 'FCL');
            const statusStr = match[4].toLowerCase();
            const status = (['frozen', 'chilled', 'frozen/chilled'].includes(statusStr)
                ? statusStr
                : 'unknown') as OfferItem['status'];
            const fullDescription = match[5].trim();
            const usdPerKg = parseFloat(match[6]);

            const { name, grade } = normalizeProductName(fullDescription);
            const specs = extractSpecs(fullDescription);

            items.push({
                id: `item-${index}`,
                line_no: index + 1,
                container_count: containerCount,
                container_size_ft: containerSize,
                status: status,
                grade_mark: grade,
                product_name: name,
                korean_name: '', // 초기화
                normalized_key: name.replace(/\s+/g, '_').toLowerCase(),
                original_description: trimmedLine,
                weight_spec: specs.weight,
                ratio_spec: specs.ratio,
                pack_spec: specs.pack,
                usd_per_kg: usdPerKg,
            });
        } else {
            // 가격표시(@ $) 가 있는데 매칭 안되면 에러로 처리
            if (trimmedLine.includes('@') || trimmedLine.includes('$')) {
                errors.push({
                    line_no: index + 1,
                    original_text: trimmedLine,
                    reason: '패턴 매칭 실패 (수량x사이즈 상태 설명 @ $가격 형식 확인 필요)'
                });
            } else {
                // 나머지는 메타 데이터
                meta.push(trimmedLine);
            }
        }
    });

    return { items, meta, errors };
}
