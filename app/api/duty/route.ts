import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache } from '../../../lib/api-cache';
import { DutyMap } from '../../../lib/types';

const CACHE_KEY_PREFIX = 'duty_rate_';
const DEFAULT_TTL = 86400; // 24 hours

const INITIAL_DUTY_MAP: DutyMap = {
    'beef_striploin': 40,
    'beef_cube_roll': 40,
    'beef_chuck_eye_roll': 40,
    'pork_collar': 22.5,
    'beef_tender': 40,
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const hsCode = searchParams.get('hs_code');
    const ttl = process.env.DUTY_CACHE_SECONDS ? parseInt(process.env.DUTY_CACHE_SECONDS) : DEFAULT_TTL;

    // 만약 HS 코드가 보드에 전달되지 않았다면 기본 맵 반환
    if (!hsCode) {
        return NextResponse.json({ dutyMap: INITIAL_DUTY_MAP, source: 'local_config' });
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${hsCode}`;
    const cachedRate = getCache<number>(cacheKey, ttl);
    if (cachedRate !== null) {
        return NextResponse.json({ rate: cachedRate, source: 'cache' });
    }

    const apiKey = process.env.DUTY_API_KEY;
    const baseUrl = process.env.DUTY_API_BASE_URL;

    if (!apiKey || !baseUrl || apiKey.includes('your_api_key_here')) {
        return NextResponse.json({ rate: 40.0, source: 'fallback_default' });
    }

    try {
        // UNIPASS HS 정보 조회 API (흔히 사용하는 엔드포인트 예시)
        // 실제 운영 환경의 정확한 연계 가이드에 맞춰 엔드포인트 수정 가능
        const url = `${baseUrl}/hisSvcGetHsInfo?crkyCn=${apiKey}&hsCd=${hsCode}`;
        const response = await fetch(url);
        const xmlText = await response.text();

        // XML에서 관세율 정보 추출 (예: <trfRt> 또는 <basRt>)
        // 단순 정규식을 사용하여 의존성 없이 추출
        const rateMatch = xmlText.match(/<trfRt>([\d.]+)<\/trfRt>/) || xmlText.match(/<basRt>([\d.]+)<\/basRt>/);

        if (rateMatch && rateMatch[1]) {
            const rate = parseFloat(rateMatch[1]);
            setCache(cacheKey, rate);
            return NextResponse.json({ rate, source: 'unipass' });
        }

        throw new Error('Could not find rate in UNIPASS response');
    } catch (error) {
        console.error('Duty API (UNIPASS) Error:', error);
        return NextResponse.json({ rate: 40.0, source: 'error_fallback' });
    }
}
