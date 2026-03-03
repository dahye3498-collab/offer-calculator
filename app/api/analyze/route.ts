import { NextResponse } from 'next/server';
import { AIAnalysisResult, OfferItem } from '../../../lib/types';

export async function POST(req: Request) {
    const { items, originCountry, dutyRefText } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!apiKey || apiKey.includes('your_api_key_here')) {
        return NextResponse.json({ error: 'OpenAI API Key is missing' }, { status: 400 });
    }

    // 분석할 품목 리스트 (냉동/냉장 상태 포함)
    const itemsText = items.map((item: OfferItem) => `- ${item.product_name} (${item.status})`).join('\n');
    const userMessage = dutyRefText
        ? `${itemsText}\n\n[사용자 제공 관세 참조 자료]\n${dutyRefText}`
        : itemsText;

    const systemPrompt = `당신은 대한민국 축산물 수입·통관 전문 관세사입니다.
제공된 영어 품명 리스트와 원산지(${originCountry || '미상'})를 분석하여 정확한 정보를 제공하세요.

[2026년 기준 공식 연도별 관세율표 - 반드시 이 수치를 그대로 사용하세요]

■ 우육(소고기) 냉동 - HS CODE별 2026년 FTA 협정세율:
HS 0202300000 BONELESS BEEF (뼈없는 냉동우육 - 채끝, 등심, 안심, 목심, 앞다리, 우둔 등):
  미국: 0% | EU: 0% | 호주: 5.3% | 뉴질랜드: 8.0% | 캐나다: 8.0% | 멕시코: 40%

HS 0202100000 BONE IN BEEF (뼈있는 냉동우육 - 갈비, T본, 허리갈비 등):
  미국: 0% | EU: 0% | 호주: 5.3% | 뉴질랜드: 8.0% | 캐나다: 8.0% | 멕시코: 40%

HS 0202209000 샤블·기타 냉동우육:
  미국: 0% | EU: 0% | 호주: 5.3% | 뉴질랜드: 8.0% | 캐나다: 8.0% | 멕시코: 40%

HS 0206299000 안창·토시·볼살·스지·업통 등 냉동우육 부산물:
  미국: 0% | EU: 0% | 호주: 2.4% | 뉴질랜드: 3.6% | 캐나다: 0% | 멕시코: 18%

HS 0206291000 꼬리(TAIL):
  미국: 0% | EU: 0% | 호주: 2.4% | 뉴질랜드: 3.6% | 캐나다: 0% | 멕시코: 18%

HS 0206292000 발(FEET):
  미국: 0% | EU: 0% | 호주: 2.4% | 뉴질랜드: 3.6% | 캐나다: 0% | 멕시코: 18%

HS 0206210000 혀(TONGUE):
  미국: 0% | EU: 0% | 호주: 2.4% | 뉴질랜드: 3.6% | 캐나다: 0% | 멕시코: 18%

HS 0504001010 장(INTESTINE - 우육):
  미국: 0% | EU: 0% | 호주: 3.6% | 뉴질랜드: 5.4% | 캐나다: 0% | 멕시코: 27%

HS 0504003000 위(TRIPE/RUMEN):
  미국: 0% | EU: 0% | 호주: 3.6% | 뉴질랜드: 5.4% | 캐나다: 0% | 멕시코: 27%

■ 냉동돈육 - 2026년 FTA 협정세율:
HS 0203291000 냉동삼겹(FROZEN BELLY/PORK BELLY):
  미국: 0% | EU: 0% | 호주: 25.0% | 캐나다: 1.9% | 멕시코: 25%

HS 0203299000 냉동 목살·갈비·항정·정족 등(COLLAR, RIB, JOWL):
  미국: 0% | EU: 0% | 호주: 0% | 캐나다: 0% | 멕시코: 25%

HS 0206491000 미니족(PIG FEET MINI):
  미국: 0% | EU: 0% | 호주: 0% | 캐나다: 0% | 멕시코: 18%

HS 0206499000 갈매기·볼살 등 냉동돈 부산물:
  미국: 0% | EU: 0% | 호주: 0% | 캐나다: 0% | 멕시코: 18%

■ 냉장돈육 - 2026년 FTA 협정세율:
HS 0203191000 냉장삼겹(CHILLED BELLY):
  미국: 0% | EU: 0% | 호주: 0% | 캐나다: 1.7% | 멕시코: 22.5%

HS 0203199000 냉장 목살·갈비 등(CHILLED COLLAR, LOIN):
  미국: 0% | EU: 0% | 호주: 3.0% | 캐나다: 1.7% | 멕시코: 22.5%

■ 현재 원산지: ${originCountry}

[HS CODE 배정 원칙]
- 냉동 소고기 일반 부위(채끝, 등심, 안심, 목심, 앞다리, 우둔, 홍두깨 등): 0202300000
- 냉동 소고기 갈비류(SHORT RIB, RIB, 갈비, 등갈비): 0202100000
- 냉동 소고기 부산물(안창, 토시, 볼살, 혀, 꼬리, 발): 0206299000 또는 해당 세번
- 냉장 소고기 일반 부위: 0201300000
- 냉동 돼지 삼겹: 0203291000 | 냉동 돼지 목살·갈비·항정: 0203299000
- 냉장 돼지 삼겹: 0203191000 | 냉장 돼지 목살·갈비: 0203199000

[필수 규칙]
1. 위 관세율표의 2026년 값을 정확히 그대로 사용하세요. 임의로 바꾸지 마세요.
2. 미국산(USA, 미국, 미산)이면 소고기·돼지고기 모두 예외없이 0%.
3. 호주산 삼겹살은 25.0%로 주의하세요.
4. 캐나다산 소고기는 8.0%입니다.

결과는 반드시 아래의 JSON 형식 그대로만 응답하세요:
{
  "results": [
    {
      "product_name": "영어 이름",
      "korean_name": "한글 이름",
      "hs_code": "0202300000",
      "suggested_duty_rate": 5.3,
      "reason": "호주산 냉동 뼈없는 소고기 HS 0202300000 -> 한-호주 FTA 2026년 협정세율 5.3%"
    }
  ]
}`;

    try {
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
                    { role: 'user', content: userMessage }
                ],
                response_format: { type: 'json_object' }
            }),
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || 'OpenAI API Error');
        }
        const content = data.choices[0].message.content;

        let results: AIAnalysisResult[] = [];
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
                results = parsed;
            } else if (parsed.results && Array.isArray(parsed.results)) {
                results = parsed.results;
            } else if (parsed.items && Array.isArray(parsed.items)) {
                results = parsed.items;
            } else {
                const arrayKey = Object.keys(parsed).find(key => Array.isArray(parsed[key]));
                if (arrayKey) results = parsed[arrayKey];
            }
        } catch (e) {
            console.error('AI Response Parse Error:', e, 'Content:', content);
        }

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('AI Analysis Error:', error);
        return NextResponse.json({ error: 'AI Analysis failed', message: error.message }, { status: 500 });
    }
}
