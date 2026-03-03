export interface OfferItem {
  id: string;
  line_no: number;
  container_count: number;
  container_size_ft: string;
  status: 'frozen' | 'chilled' | 'frozen/chilled' | 'unknown';
  origin?: string; // 추가
  grade_mark: string;
  product_name: string;
  korean_name: string;
  hs_code?: string; // 추가
  manual_duty_rate?: number; // 추가
  normalized_key: string;
  original_description: string;
  weight_spec: string;
  ratio_spec: string;
  pack_spec: string;
  usd_per_kg: number;
}

export interface ParsingError {
  line_no: number;
  original_text: string;
  reason: string;
}

export interface ParseResult {
  items: OfferItem[];
  meta: string[];
  errors: ParsingError[];
}

export interface DutyMap {
  [product_key: string]: number; // duty_rate_percent
}

export interface CalculationResult {
  item: OfferItem;
  krw_per_kg_base: number;
  duty_rate: number;
  has_duty_match: boolean;
  duty_krw_per_kg: number;
  misc_krw_per_kg: number;
  total_krw_per_kg: number;
}

export interface AIAnalysisResult {
  product_name: string;
  korean_name: string;
  hs_code?: string;
  suggested_duty_rate: number;
  reason: string;
}
