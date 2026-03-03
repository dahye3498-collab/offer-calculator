import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { text } = await req.json();

        const apiKey = process.env.OPENAI_API_KEY;
        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

        if (!apiKey) {
            return NextResponse.json({ error: 'OpenAI API Key is missing' }, { status: 400 });
        }

        const systemPrompt = `
당신은 축산물 오퍼(Offer) 텍스트 분석 전문가입니다. 
비정형적인 축산물 오퍼 텍스트를 분석하여 구조화된 JSON 데이터로 변환하십시오.

[분석 지침]
1. 품목(Items) 추출: 각 오퍼 라인을 개별 품목으로 분리하십시오.
2. 수량(container_count): 컨테이너 수량을 숫자로 추출하십시오. (기본값: 1)
3. 컨테이너 사이즈(container_size_ft): 20FCL, 40FCL 등 컨테이너 규격을 추출하십시오.
4. 상태(status): frozen(냉동), chilled(냉장), frozen/chilled 중 하나로 분류하십시오.
5. 부위명(product_name): 영문 부위명을 추출하고 정규화하십시오. (예: BEEF STRIPLOINS -> BEEF STRIPLOIN)
6. 등급(grade_mark): A, CHOICE, PRIME, *S* 등의 등급 정보를 별도로 추출하십시오.
7. 스펙 추출:
   - weight_spec: 중량 정보 (예: 25kg, 20kg/box)
   - ratio_spec: 비율 정보 (예: 80/20, 90vl)
   - pack_spec: 포장 정보 (예: Vacuum Packed, IWP, Poly Bag)
8. 단가(usd_per_kg): $ 기호 뒤의 숫자를 추출하십시오. 기준은 kg당 단가로 간주합니다.
9. 메타 데이터(meta): 오퍼의 제목, 선적 시기, 브랜드 등 품목 외의 중요한 정보를 배열로 추출하십시오.
10. 한글 부위명(korean_name): 해당 영문 부위명의 한국 축산 시장 표준 한글명을 반드시 채우십시오.
    주요 매핑 기준 (소고기):
    - STRIPLOIN → 채끝, CUBE ROLL → 등심, CHUCK EYE ROLL → 알목심
    - TENDERLOIN / TENDER → 안심, RIBEYE ROLL / RIBEYE → 꽃등심
    - BRISKET → 양지, SHORT PLATE → 치마양지, FLANK → 옆구리살
    - CHUCK → 목심/앞다리, OUTSIDE FLAT → 보섭살, RUMP → 우둔/도가니살
    - TOPSIDE → 홍두깨살, SILVERSIDE → 설도, SHORT RIB → 갈비, RIB → 갈비
    - CLOD → 앞다리살, OYSTER BLADE → 부채살, SHIN / SHANK → 사태
    주요 매핑 기준 (돼지고기):
    - COLLAR → 목살, BELLY → 삼겹살, SHOULDER → 앞다리, LOIN → 등심
    - HAM → 뒷다리, JOWL → 항정살, CHEEK → 볼살, BACK FAT → 등지방
    - 정확한 매핑이 불분명한 경우 영문명을 그대로 한글 음역하세요.

[응답 형식]
반드시 아래의 JSON 구조로만 응답하십시오:
{
  "items": [
    {
      "container_count": 1,
      "container_size_ft": "40FCL",
      "status": "frozen",
      "product_name": "BEEF STRIPLOIN",
      "korean_name": "채끝",
      "grade_mark": "*S*",
      "weight_spec": "25kg",
      "ratio_spec": "",
      "pack_spec": "Vacuum Packed",
      "usd_per_kg": 8.50,
      "original_description": "원문 라인 전체"
    }
  ],
  "meta": ["FEBUARY / MARCH SHIPMENT", "Brand: PREMIUM BEEF CO."],
  "errors": []
}
`;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                response_format: { type: "json_object" }
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'OpenAI API Error');
        }

        const parsedResult = JSON.parse(data.choices[0].message.content);

        // ID 및 Line No 추가
        if (parsedResult.items) {
            parsedResult.items = parsedResult.items.map((item: any, index: number) => ({
                ...item,
                id: `ai-item-${index}-${Date.now()}`,
                line_no: index + 1,
                // korean_name은 GPT가 반환한 값을 그대로 사용 (빈 문자열로 초기화 안 함)
                korean_name: item.korean_name || '',
                normalized_key: item.product_name.replace(/\s+/g, '_').toLowerCase()
            }));
        }

        return NextResponse.json(parsedResult);
    } catch (error: any) {
        console.error('AI Parse Error:', error);
        return NextResponse.json({
            error: 'AI Parsing failed',
            message: error.message,
            items: [],
            meta: [],
            errors: [{ line_no: 0, original_text: '', reason: error.message }]
        }, { status: 500 });
    }
}
