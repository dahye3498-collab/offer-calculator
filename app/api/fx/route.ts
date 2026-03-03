import { NextResponse } from 'next/server';
import { getCache, setCache } from '../../../lib/api-cache';

const CACHE_KEY_PREFIX = 'fx_rate_';
const DEFAULT_TTL = 3600; // 1 hour

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const currency = searchParams.get('currency')?.toUpperCase() || 'USD';

    const ttl = process.env.FX_CACHE_SECONDS ? parseInt(process.env.FX_CACHE_SECONDS) : DEFAULT_TTL;
    const cacheKey = `${CACHE_KEY_PREFIX}${currency}_krw`;
    const cachedRate = getCache<number>(cacheKey, ttl);

    if (cachedRate) {
        return NextResponse.json({ rate: cachedRate, source: 'cache', currency });
    }

    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    const baseUrl = process.env.EXCHANGE_RATE_API_BASE_URL;

    if (!apiKey || apiKey === 'your_api_key_here' || !baseUrl) {
        // Fallback for demo if no keys
        let baseMock = 1320.5;
        if (currency === 'EUR') baseMock = 1430.2;
        if (currency === 'AUD') baseMock = 870.5;

        const mockRate = baseMock + (Math.random() * 10 - 5);
        setCache(cacheKey, mockRate);
        return NextResponse.json({ rate: mockRate, source: 'fallback_mock', currency });
    }

    try {
        // 한국수출입은행 API는 비영업일 데이터가 없으므로 최근 3일간 시도
        const getRateForDate = async (dateStr: string) => {
            const url = `${baseUrl}?authkey=${apiKey}&searchdate=${dateStr}&data=AP01`;
            const response = await fetch(url);
            const data = await response.json();

            if (Array.isArray(data)) {
                const currencyData = data.find((item: any) => item.cur_unit === currency);
                if (currencyData && currencyData.deal_bas_r) {
                    // "1,320.5" 형식의 문자열을 숫자로 변환
                    return parseFloat(currencyData.deal_bas_r.replace(/,/g, ''));
                }
            }
            return null;
        };

        let rate: number | null = null;
        const now = new Date();

        // 오늘부터 3일 전까지 확인 (주말/공휴일 대비)
        for (let i = 0; i < 4; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
            rate = await getRateForDate(dateStr);
            if (rate) break;
        }

        if (rate) {
            setCache(cacheKey, rate);
            return NextResponse.json({ rate, source: 'api', currency });
        } else {
            throw new Error(`Could not find ${currency} rate in the last 4 days`);
        }
    } catch (error: any) {
        console.error('FX API Error:', error);
        // 최종 실패 시에도 mock 값으로 서비스 지속성 유지
        let fallbackRate = 1320.5;
        if (currency === 'EUR') fallbackRate = 1430.0;
        if (currency === 'AUD') fallbackRate = 870.0;

        return NextResponse.json(
            { error: 'Failed to fetch exchange rate', rate: fallbackRate, source: 'api_error_fallback', currency },
            { status: 200 }
        );
    }
}
