import { OfferItem, DutyMap, CalculationResult } from './types';

export function calculateCosts(
    items: OfferItem[],
    dutyMap: DutyMap,
    fxExchangeRate: number,
    miscKrwPerKg: number,
    shouldRound: boolean
): CalculationResult[] {
    return items.map((item: OfferItem): CalculationResult => {
        const krw_per_kg_base = item.usd_per_kg * fxExchangeRate;

        // 관세율 매핑 (수동 입력 우선, 그 다음 normalized_key 또는 product_name 기준)
        const duty_rate = item.manual_duty_rate ?? dutyMap[item.normalized_key] ?? dutyMap[item.product_name] ?? 0;
        const has_duty_match = (item.manual_duty_rate !== undefined) || (dutyMap[item.normalized_key] !== undefined) || (dutyMap[item.product_name] !== undefined);

        const duty_krw_per_kg = krw_per_kg_base * (duty_rate / 100);
        const total_krw_per_kg = krw_per_kg_base + duty_krw_per_kg + miscKrwPerKg;

        return {
            item,
            krw_per_kg_base,
            duty_rate,
            has_duty_match,
            duty_krw_per_kg,
            misc_krw_per_kg: miscKrwPerKg,
            total_krw_per_kg,
        };
    });
}

export function formatKrw(value: number, shouldRound: boolean): string {
    if (shouldRound) {
        return Math.round(value).toLocaleString('ko-KR');
    }
    return value.toLocaleString('ko-KR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}
